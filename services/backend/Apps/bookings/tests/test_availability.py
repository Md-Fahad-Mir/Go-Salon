"""Availability: hours, staff, duration and the diary, answered together."""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from Apps.services.models import Service
from Apps.users.models import SalonEmployee

from .base import BookingTestCase, all_week


class AvailabilityTests(BookingTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)

    def test_slots_come_from_the_real_opening_hours(self):
        times = self.free_times(services=[self.cut])
        self.assertEqual(times[0], '10:00')
        # A sixty-minute cut cannot start at seven when they shut at eight.
        self.assertEqual(times[-1], '19:00')

    def test_a_closed_day_has_no_slots(self):
        self.as_user(self.owner_session)
        self.client.put('/api/schedule/me/', {'days': [
            {'day': 'mon', 'is_closed': True, 'intervals': []},
        ]}, format='json')
        self.as_user(self.customer_session)
        self.assertEqual(self.free_times(services=[self.cut]), [])

    def test_a_lunch_break_is_not_bookable_through(self):
        self.as_user(self.owner_session)
        self.client.put('/api/schedule/me/', {'days': [{
            'day': 'mon', 'is_closed': False,
            'intervals': [{'start': '10:00', 'end': '13:00'},
                          {'start': '16:00', 'end': '20:00'}],
        }]}, format='json')
        self.as_user(self.customer_session)
        times = self.free_times(services=[self.cut])
        self.assertIn('10:00', times)
        self.assertIn('16:00', times)
        # Nothing may start at half twelve and run through the break.
        self.assertNotIn('12:30', times)
        self.assertNotIn('14:00', times)

    def test_prep_time_pushes_the_first_slot_back(self):
        # Colour needs twenty minutes of mixing before the client sits down,
        # so ten o'clock cannot be seated — but the grid stays on the quarter.
        times = self.free_times(services=[self.colour])
        self.assertEqual(times[0], '10:30')
        self.assertNotIn('10:00', times)
        self.assertNotIn('10:15', times)

    def test_a_longer_basket_has_fewer_late_slots(self):
        short = self.free_times(services=[self.cut])
        long = self.free_times(services=[self.cut, self.colour])
        self.assertGreater(len(short), len(long))
        self.assertEqual(long[-1], '17:30')

    def test_a_booked_time_stops_being_offered(self):
        self.book(time='11:00', services=[self.cut], employee=self.chair)
        times = self.free_times(services=[self.cut], employee=self.chair)
        self.assertNotIn('11:00', times)
        self.assertNotIn('11:30', times)
        self.assertIn('12:00', times)

    def test_a_taken_slot_is_reported_rather_than_hidden(self):
        self.book(time='11:00', services=[self.cut], employee=self.chair)
        eleven = next(s for s in self.slots(services=[self.cut], employee=self.chair)
                      if s['time'] == '11:00')
        self.assertFalse(eleven['available'])
        self.assertEqual(eleven['reason'], 'taken')

    def test_another_chair_is_still_free_at_the_same_time(self):
        second = self._hire_as_owner('01755000005', 'Nadia Sultana')
        self.as_user(self.customer_session)
        self.book(time='11:00', services=[self.cut], employee=self.chair)
        # The salon is still bookable at eleven, just not with that chair.
        self.assertIn('11:00', self.free_times(services=[self.cut]))
        self.assertIn('11:00', self.free_times(services=[self.cut], employee=second))
        self.assertNotIn('11:00', self.free_times(services=[self.cut], employee=self.chair))

    def test_a_salon_with_every_chair_taken_has_no_slot(self):
        self.book(time='11:00', services=[self.cut], employee=self.chair)
        self.assertNotIn('11:00', self.free_times(services=[self.cut]))

    def test_only_chairs_cleared_for_the_service_are_offered(self):
        second = self._hire_as_owner('01755000005', 'Nadia Sultana')
        self.as_user(self.owner_session)
        self.client.patch(f'/api/services/{self.colour.id}/',
                          {'eligible_employee_ids': [second.id]}, format='json')
        self.as_user(self.customer_session)
        # The first chair is not named on colour, so it cannot take it.
        self.assertEqual(self.free_times(services=[self.colour], employee=self.chair), [])
        self.assertNotEqual(self.free_times(services=[self.colour], employee=second), [])

    def test_a_basket_needs_one_chair_cleared_for_everything(self):
        second = self._hire_as_owner('01755000005', 'Nadia Sultana')
        self.as_user(self.owner_session)
        self.client.patch(f'/api/services/{self.cut.id}/',
                          {'eligible_employee_ids': [self.chair.id]}, format='json')
        self.client.patch(f'/api/services/{self.colour.id}/',
                          {'eligible_employee_ids': [second.id]}, format='json')
        self.as_user(self.customer_session)
        # Nobody can do both, so the pair cannot be booked together.
        self.assertEqual(self.free_times(services=[self.cut, self.colour]), [])

    def test_today_hides_times_that_are_too_soon(self):
        today = timezone.localdate()
        self.as_user(self.owner_session)
        self.client.put('/api/schedule/me/', all_week('00:00', '23:45'), format='json')
        self.as_user(self.customer_session)
        slots = self.slots(services=[self.cut], day=today)
        now = timezone.localtime().strftime('%H:%M')
        soon = [s for s in slots if s['time'] <= now]
        self.assertTrue(soon, 'expected some times already past today')
        self.assertTrue(all(not s['available'] and s['reason'] == 'too_soon' for s in soon))

    def test_the_diary_does_not_open_forever(self):
        far = timezone.localdate() + timedelta(days=400)
        response = self.client.get('/api/bookings/availability/', {
            'listing': f'salon-{self.salon.id}', 'date': far.isoformat(),
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['slots'], [])

    def test_an_unknown_listing_is_refused(self):
        response = self.client.get('/api/bookings/availability/', {
            'listing': 'salon-9999', 'date': self.day.isoformat(),
        })
        self.assertEqual(response.status_code, 400, response.data)

    def test_signing_out_closes_availability(self):
        self.client.credentials()
        response = self.client.get('/api/bookings/availability/', {
            'listing': f'salon-{self.salon.id}', 'date': self.day.isoformat(),
        })
        self.assertEqual(response.status_code, 401)

    # --- helper ------------------------------------------------------------

    def _hire_as_owner(self, phone: str, name: str) -> SalonEmployee:
        self.as_user(self.owner_session)
        chair = self._hire(phone, name)
        self.as_user(self.customer_session)
        return chair
