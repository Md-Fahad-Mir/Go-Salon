"""Walk-ins: somebody added at the counter rather than booked ahead.

The question these answer is *who ends up seeing the row*. A walk-in one
stylist adds has to reach the owner — it is the salon's money and the salon's
diary — and the stylist who took them, and nobody else on the floor.
"""

from __future__ import annotations

from django.utils import timezone

from Apps.bookings.models import Appointment, business_tz
from Apps.users.models import Role, SalonEmployee, User

from .base import BookingTestCase

WALK_IN = '/api/bookings/walk-in/'
BOOKINGS = '/api/bookings/'


class WalkInTests(BookingTestCase):
    def setUp(self):
        super().setUp()
        # A second chair, so "the others cannot see it" has somebody to be
        # true about.
        self.as_user(self.owner_session)
        self.other_chair = self._hire('01755000009', 'Nusrat Jahan')

        self.verify('+8801755000004')
        self.verify('+8801755000009')
        self.stylist = self.sign_in('+8801755000004').data
        self.colleague = self.sign_in('+8801755000009').data

    def add(self, session, *, name='Rahim Mia', phone='', services=None,
            employee=None, notes='', expect=201):
        self.as_user(session)
        payload = {
            'customer_name': name,
            'customer_phone': phone,
            'service_ids': [s.id for s in (services or [self.cut])],
            'notes': notes,
        }
        if employee is not None:
            payload['employee'] = employee.id
        response = self.client.post(WALK_IN, payload, format='json')
        if expect is not None:
            self.assertEqual(response.status_code, expect, response.data)
        return response

    def business_now(self):
        """The clock the salon reads off the wall."""
        return timezone.now().astimezone(business_tz())

    def listed(self, session) -> list[int]:
        self.as_user(session)
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 200, response.data)
        return [row['id'] for row in response.data['results']]

    # --- the reported bug ---------------------------------------------------

    def test_a_stylists_walk_in_reaches_the_owner(self):
        walk_in = self.add(self.stylist).data
        self.assertIn(walk_in['id'], self.listed(self.owner_session))

    def test_the_stylist_who_added_it_keeps_it(self):
        walk_in = self.add(self.stylist).data
        self.assertIn(walk_in['id'], self.listed(self.stylist))

    def test_another_chair_never_sees_it(self):
        walk_in = self.add(self.stylist).data
        self.assertNotIn(walk_in['id'], self.listed(self.colleague))

    def test_a_customer_elsewhere_never_sees_it(self):
        walk_in = self.add(self.stylist).data
        self.assertNotIn(walk_in['id'], self.listed(self.customer_session))

    # --- what the row is ----------------------------------------------------

    def test_it_belongs_to_the_salon_and_to_the_chair_that_took_them(self):
        walk_in = self.add(self.stylist).data
        from Apps.bookings.models import Appointment

        row = Appointment.objects.get(pk=walk_in['id'])
        self.assertEqual(row.salon_id, self.salon.id)
        self.assertIsNone(row.barber_id)
        self.assertEqual(row.employee_id, self.chair.id)
        self.assertTrue(row.walk_in)

    def test_it_is_approved_on_arrival(self):
        """Nobody accepts a customer who is already standing there."""
        walk_in = self.add(self.stylist).data
        self.assertEqual(walk_in['status'], 'approved')
        self.assertTrue(walk_in['walk_in'])

    def test_it_carries_the_name_written_down_with_no_account(self):
        walk_in = self.add(self.stylist, name='Rahim Mia', phone='').data
        self.assertEqual(walk_in['customer_name'], 'Rahim Mia')
        self.assertEqual(walk_in['customer_phone'], '')
        self.assertFalse(User.objects.filter(name='Rahim Mia').exists())

    def test_it_prices_the_basket_the_same_way_a_booking_does(self):
        walk_in = self.add(self.stylist, services=[self.cut, self.colour]).data
        self.assertEqual(walk_in['subtotal'], '4400.00')
        self.assertEqual(walk_in['duration_minutes'], 150)
        self.assertEqual(len(walk_in['items']), 2)

    def test_a_number_the_salon_already_knows_links_the_visit_to_that_account(self):
        walk_in = self.add(self.stylist, phone=self.customer.phone).data
        self.assertIn(walk_in['id'], self.listed(self.customer_session))
        self.assertEqual(walk_in['customer_name'], self.customer.name)

    def test_it_is_taken_now_rather_than_on_the_slot_grid(self):
        """The whole point: no lead time, no alignment, no free chair needed."""
        self.add(self.stylist)
        second = self.add(self.stylist, name='Karim', expect=201).data
        self.assertEqual(second['date'], self.business_now().date().isoformat())

    def test_it_is_stamped_on_the_salons_clock_not_the_servers(self):
        """`timezone.localtime()` reads Django's TIME_ZONE (UTC), while the
        model reads the stored wall clock back as BUSINESS_TIME_ZONE — so a
        walk-in was filed six hours in the past and the chair it occupied was
        sold to somebody else."""
        here = self.business_now()
        walk_in = self.add(self.stylist, name='Clock').data

        self.assertEqual(walk_in['date'], here.date().isoformat())
        self.assertEqual(walk_in['start_time'][:2], here.strftime('%H'))

        row = Appointment.objects.get(pk=walk_in['id'])
        # The instant the diary actually blocks must be now, not now ± an offset.
        self.assertLess(abs((row.starts_at - timezone.now()).total_seconds()), 120)

    # --- who may add one ----------------------------------------------------

    def test_an_owner_may_put_one_at_any_chair(self):
        walk_in = self.add(self.owner_session, employee=self.other_chair).data
        self.assertIn(walk_in['id'], self.listed(self.owner_session))
        self.assertIn(walk_in['id'], self.listed(self.colleague))
        self.assertNotIn(walk_in['id'], self.listed(self.stylist))

    def test_an_owner_may_leave_the_chair_unassigned(self):
        walk_in = self.add(self.owner_session).data
        self.assertIsNone(walk_in['employee_id'])
        self.assertIn(walk_in['id'], self.listed(self.owner_session))

    def test_a_stylist_cannot_put_one_at_somebody_elses_chair(self):
        """The chair follows the caller, so naming another one changes nothing
        rather than being obeyed."""
        walk_in = self.add(self.stylist, employee=self.other_chair).data
        self.assertEqual(walk_in['employee_id'], self.chair.id)
        self.assertNotIn(walk_in['id'], self.listed(self.colleague))

    def test_a_customer_cannot_add_one(self):
        response = self.add(self.customer_session, expect=403)
        self.assertEqual(response.data['code'], 'permission_denied')

    def test_a_name_is_required(self):
        response = self.add(self.stylist, name='   ', expect=400)
        self.assertIn('customer_name', response.data['errors'])

    def test_at_least_one_service_is_required(self):
        self.as_user(self.stylist)
        response = self.client.post(
            WALK_IN, {'customer_name': 'Rahim', 'service_ids': []}, format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_a_service_from_another_menu_is_refused(self):
        other_owner = self.make_owner(phone='01912000088')
        self.as_user(other_owner)
        theirs = self._service('Beard trim', '400.00', 30)

        response = self.add(self.stylist, services=[theirs], expect=400)
        self.assertIn('service_ids', response.data['errors'])

    def test_a_bad_number_is_refused_rather_than_stored(self):
        response = self.add(self.stylist, phone='12345', expect=400)
        self.assertIn('customer_phone', response.data['errors'])


class SoloBarberWalkInTests(BookingTestCase):
    """A barber working alone has no chairs and no owner above them."""

    def setUp(self):
        super().setUp()
        self.barber_session = self.make_barber(phone='01712000044')
        self.as_user(self.barber_session)
        self.client.put('/api/schedule/me/', {'days': []}, format='json')
        self.their_cut = self._service('Skin fade', '650.00', 30)

    def test_a_lone_barber_adds_one_against_their_own_trade(self):
        self.as_user(self.barber_session)
        response = self.client.post(WALK_IN, {
            'customer_name': 'Sabbir',
            'service_ids': [self.their_cut.id],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        from Apps.bookings.models import Appointment

        row = Appointment.objects.get(pk=response.data['id'])
        self.assertIsNone(row.salon_id)
        self.assertIsNotNone(row.barber_id)
        self.assertIsNone(row.employee_id)
        self.assertTrue(row.walk_in)

        self.as_user(self.barber_session)
        listed = self.client.get(BOOKINGS).data['results']
        self.assertIn(response.data['id'], [row['id'] for row in listed])
