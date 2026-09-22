"""The rules a customer actually experiences when picking a time.

Written against the scenarios a salon owner described in plain language, so
that the next person to change `availability.py` finds out in seconds whether
they broke "three o'clock is free again once the two o'clock is finished".

Everything here goes through the real endpoints. The unit-level maths has its
own tests in `test_availability.py`; these are about what the API answers.
"""

from __future__ import annotations

from Apps.bookings.models import Appointment, AppointmentStatus

from .base import BookingTestCase

BOOKINGS = '/api/bookings/'


class OverlapTests(BookingTestCase):
    """A booking occupies a *range*, and only that range."""

    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)

    def slot(self, time: str, **kwargs) -> dict:
        rows = self.slots(**kwargs)
        found = next((row for row in rows if row['time'] == time), None)
        self.assertIsNotNone(found, f'{time} is not on the grid at all')
        return found

    def test_an_hour_long_booking_frees_the_hour_after_it(self):
        """The reported scenario, verbatim: book 14:00 for an hour, and 15:00
        must come back."""
        self.book(time='14:00', services=[self.cut])

        self.assertTrue(self.slot('13:00', services=[self.cut])['available'])
        self.assertFalse(self.slot('14:00', services=[self.cut])['available'])
        self.assertFalse(self.slot('14:30', services=[self.cut])['available'])
        self.assertTrue(self.slot('15:00', services=[self.cut])['available'])
        self.assertTrue(self.slot('16:00', services=[self.cut])['available'])

    def test_it_also_blocks_the_run_up_that_would_overlap(self):
        """13:30 is refused not because 13:30 is taken but because an hour
        starting there runs into 14:00. Being able to state that difference is
        the whole point of the grid."""
        self.book(time='14:00', services=[self.cut])

        self.assertFalse(self.slot('13:30', services=[self.cut])['available'])
        # A shorter service fits in the same gap, which proves the block is
        # about the overlap and not about the time itself.
        self.as_user(self.owner_session)
        short = self._service('Fringe trim', '300.00', 15)
        self.as_user(self.customer_session)
        self.assertTrue(self.slot('13:30', services=[short])['available'])

    def test_a_longer_service_blocks_proportionally_more(self):
        self.book(time='14:00', services=[self.colour])  # 90 minutes

        self.assertFalse(self.slot('15:00', services=[self.cut])['available'])
        self.assertTrue(self.slot('15:30', services=[self.cut])['available'])

    def test_a_new_booking_may_start_exactly_when_another_ends(self):
        """Half-open ranges: touching is not overlapping."""
        self.book(time='14:00', services=[self.cut])
        self.book(time='15:00', services=[self.cut], expect=201)

    def test_finishing_with_the_booking_releases_nothing_else(self):
        """One booking costs exactly its own overlap window and no more."""
        before = {row['time'] for row in self.slots(services=[self.cut]) if row['available']}
        self.book(time='14:00', services=[self.cut])
        after = {row['time'] for row in self.slots(services=[self.cut]) if row['available']}

        lost = sorted(before - after)
        self.assertEqual(
            lost, ['13:15', '13:30', '13:45', '14:00', '14:15', '14:30', '14:45'])

    def test_cancelling_gives_the_time_straight_back(self):
        booked = self.book(time='14:00', services=[self.cut]).data
        self.assertFalse(self.slot('14:00', services=[self.cut])['available'])

        self.as_user(self.customer_session)
        self.client.post(f'{BOOKINGS}{booked["id"]}/cancel/', {'reason': 'x'}, format='json')
        self.assertTrue(self.slot('14:00', services=[self.cut])['available'])

    def test_seconds_never_creep_into_a_start_time(self):
        """A start stored as 14:00:30 ends at 15:00:30 and silently eats the
        15:00 slot for everybody else."""
        self.as_user(self.customer_session)
        response = self.client.post(BOOKINGS, {
            'listing': f'salon-{self.salon.id}',
            'date': self.day.isoformat(),
            'time': '14:00:30',
            'service_ids': [self.cut.id],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        row = Appointment.objects.get(pk=response.data['id'])
        self.assertEqual(row.start_time.second, 0)
        self.assertEqual(row.end_time.second, 0)
        self.assertTrue(self.slot('15:00', services=[self.cut])['available'])


class ChairIsolationTests(BookingTestCase):
    """One stylist being busy is not the salon being busy."""

    def setUp(self):
        super().setUp()
        self.as_user(self.owner_session)
        self.second = self._hire('01755000009', 'Nusrat Jahan')
        self.as_user(self.customer_session)

    def test_booking_one_stylist_leaves_the_other_free(self):
        self.book(time='15:00', services=[self.cut], employee=self.chair)

        mine = {row['time']: row for row in self.slots(services=[self.cut], employee=self.chair)}
        theirs = {row['time']: row for row in self.slots(services=[self.cut], employee=self.second)}
        anyone = {row['time']: row for row in self.slots(services=[self.cut])}

        self.assertFalse(mine['15:00']['available'])
        self.assertTrue(theirs['15:00']['available'])
        self.assertTrue(anyone['15:00']['available'])
        # "Anyone" narrows to the chair that is actually free rather than
        # answering with a bare yes.
        self.assertEqual(anyone['15:00']['employee_ids'], [self.second.id])

    def test_the_second_stylist_can_be_booked_at_the_same_time(self):
        self.book(time='15:00', services=[self.cut], employee=self.chair)
        self.book(time='15:00', services=[self.cut], employee=self.second, expect=201)

    def test_the_salon_only_closes_once_every_chair_is_taken(self):
        self.book(time='15:00', services=[self.cut], employee=self.chair)
        self.book(time='15:00', services=[self.cut], employee=self.second)

        rows = {row['time']: row for row in self.slots(services=[self.cut])}
        self.assertFalse(rows['15:00']['available'])
        self.assertEqual(rows['15:00']['reason'], 'taken')


class DayOffTests(BookingTestCase):
    """A stylist's own week is honoured, including the days off in it."""

    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)

    def week(self, closed: str) -> dict:
        return {'days': [
            {'day': day, 'is_closed': day == closed,
             'intervals': [] if day == closed else [{'start': '10:00', 'end': '20:00'}]}
            for day in ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')
        ]}

    def test_a_declared_day_off_is_not_bookable(self):
        """It used to fall back to the salon's hours and sell the whole day,
        while the stylist's own profile showed the day closed."""
        self.as_user(self.owner_session)
        saved = self.client.put(
            f'/api/schedule/employees/{self.chair.id}/', self.week('mon'), format='json')
        self.assertEqual(saved.status_code, 200, saved.data)

        self.as_user(self.customer_session)
        self.assertEqual(self.slots(services=[self.cut], employee=self.chair), [])
        refused = self.book(time='11:00', services=[self.cut], employee=self.chair, expect=400)
        self.assertEqual(refused.data['code'], 'closed')

    def test_the_rest_of_their_week_still_works(self):
        self.as_user(self.owner_session)
        self.client.put(
            f'/api/schedule/employees/{self.chair.id}/', self.week('fri'), format='json')

        self.as_user(self.customer_session)
        self.assertTrue(self.free_times(services=[self.cut], employee=self.chair))
        self.book(time='11:00', services=[self.cut], employee=self.chair, expect=201)

    def test_a_chair_with_no_week_of_its_own_still_keeps_the_salons(self):
        self.as_user(self.customer_session)
        self.assertTrue(self.free_times(services=[self.cut], employee=self.chair))


class RefusalReasonTests(BookingTestCase):
    """Why a time cannot be booked, said accurately.

    Answering everything with "that time has just been taken" is what made a
    slot nobody had booked look permanently held.
    """

    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)

    def test_off_the_grid_is_not_a_clash(self):
        refused = self.book(time='14:07', services=[self.cut], expect=400)
        self.assertEqual(refused.data['code'], 'off_grid')

    def test_a_genuine_clash_still_says_taken(self):
        self.book(time='14:00', services=[self.cut], employee=self.chair)
        refused = self.book(time='14:00', services=[self.cut], employee=self.chair, expect=409)
        self.assertEqual(refused.data['code'], 'slot_taken')

    def test_a_day_beyond_the_horizon_is_refused_rather_than_accepted(self):
        from datetime import timedelta

        far = self.day + timedelta(days=400)
        refused = self.book(day=far, time='11:00', services=[self.cut], expect=400)
        self.assertEqual(refused.data['code'], 'beyond_horizon')

    def test_a_day_that_has_already_been_is_refused(self):
        from datetime import timedelta

        refused = self.book(day=self.day - timedelta(days=400), time='11:00',
                            services=[self.cut], expect=400)
        self.assertEqual(refused.data['code'], 'in_the_past')

    def test_the_grid_says_when_nobody_is_working_rather_than_taken(self):
        self.as_user(self.owner_session)
        self.client.put('/api/schedule/me/', {'days': [
            {'day': 'mon', 'is_closed': False,
             'intervals': [{'start': '10:00', 'end': '12:00'}]},
        ]}, format='json')

        self.as_user(self.customer_session)
        rows = {row['time']: row for row in self.slots(services=[self.cut])}
        self.assertNotIn('14:00', rows)


class AvailabilityHonestyTests(BookingTestCase):
    """The calendar must not offer what the booking endpoint will refuse."""

    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)

    def test_an_empty_basket_is_marked_as_a_guess(self):
        response = self.client.get('/api/bookings/availability/', {
            'listing': f'salon-{self.salon.id}',
            'date': self.day.isoformat(),
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['assumed_duration'])
        self.assertEqual(response.data['duration_minutes'], 30)

    def test_a_real_basket_is_not(self):
        response = self.client.get('/api/bookings/availability/', {
            'listing': f'salon-{self.salon.id}',
            'date': self.day.isoformat(),
            'service_ids': str(self.cut.id),
        })
        self.assertFalse(response.data['assumed_duration'])
        self.assertEqual(response.data['duration_minutes'], 60)

    def test_every_time_the_grid_offers_can_actually_be_booked(self):
        """The strongest statement available: walk the whole day and book it."""
        offered = self.free_times(services=[self.cut], employee=self.chair)
        self.assertTrue(offered)
        for time in offered:
            taken = self.book(time=time, services=[self.cut],
                              employee=self.chair, expect=None)
            self.assertIn(
                taken.status_code, (201, 409),
                f'{time} was offered but refused with {taken.data.get("code")}')
            if taken.status_code == 201:
                self.as_user(self.customer_session)


class FrozenQuoteTests(BookingTestCase):
    """Moving a booking must not reprice it off tomorrow's menu."""

    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)

    def move(self, booking_id: int, *, time: str, expect=201):
        self.as_user(self.customer_session)
        response = self.client.post(f'{BOOKINGS}{booking_id}/reschedule/', {
            'date': self.day.isoformat(), 'time': time,
        }, format='json')
        if expect is not None:
            self.assertEqual(response.status_code, expect, response.data)
        return response

    def test_a_move_keeps_the_agreed_price_and_length(self):
        booked = self.book(time='14:00', services=[self.cut]).data

        self.as_user(self.owner_session)
        self.client.patch(f'/api/services/{self.cut.id}/',
                          {'price': '5000.00', 'duration_minutes': 120}, format='json')

        moved = self.move(booked['id'], time='16:00').data
        self.assertEqual(moved['total'], booked['total'])
        self.assertEqual(moved['duration_minutes'], booked['duration_minutes'])
        self.assertEqual(moved['items'][0]['price'], booked['items'][0]['price'])

    def test_a_move_never_silently_drops_a_retired_service(self):
        booked = self.book(time='14:00', services=[self.cut, self.colour]).data
        self.assertEqual(len(booked['items']), 2)

        self.as_user(self.owner_session)
        self.client.delete(f'/api/services/{self.colour.id}/')

        refused = self.move(booked['id'], time='16:00', expect=409)
        self.assertEqual(refused.data['code'], 'service_gone')
        # And the original is untouched rather than half-moved.
        row = Appointment.objects.get(pk=booked['id'])
        self.assertEqual(row.status, AppointmentStatus.APPROVED)
