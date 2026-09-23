"""Whose appointment is whose."""

from __future__ import annotations

from Apps.bookings.models import AppointmentStatus
from Apps.users.models import Salon, User

from .base import BookingTestCase, all_week


class ScopeTests(BookingTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)
        self.mine = self.book(time='11:00', services=[self.cut]).data

        # A second customer, booking the same salon at another time.
        self.other_customer = self.make_customer(phone='01777000999', name='Rumi Chowdhury')
        self.as_user(self.other_customer)
        self.theirs = self.book(time='14:00', services=[self.cut]).data

    def listed(self) -> set[int]:
        response = self.client.get('/api/bookings/')
        self.assertEqual(response.status_code, 200, response.data)
        return {row['id'] for row in response.data['results']}

    def test_a_customer_sees_only_their_own(self):
        self.as_user(self.customer_session)
        self.assertEqual(self.listed(), {self.mine['id']})
        self.assertEqual(
            self.client.get('/api/bookings/').data['viewpoint'], 'customer')

    def test_a_customer_cannot_read_another_customers_booking(self):
        self.as_user(self.customer_session)
        self.assertEqual(
            self.client.get(f'/api/bookings/{self.theirs["id"]}/').status_code, 404)

    def test_a_customer_cannot_cancel_another_customers_booking(self):
        self.as_user(self.customer_session)
        response = self.client.post(f'/api/bookings/{self.theirs["id"]}/cancel/',
                                    {}, format='json')
        self.assertEqual(response.status_code, 404, response.data)

    def test_the_owner_sees_the_whole_salon(self):
        self.as_user(self.owner_session)
        self.assertEqual(self.listed(), {self.mine['id'], self.theirs['id']})
        self.assertEqual(self.client.get('/api/bookings/').data['viewpoint'], 'owner')

    def test_another_salons_owner_sees_none_of_it(self):
        stranger = self.make_owner(phone='01913333333', business_name='Other Salon')
        self.as_user(stranger)
        self.assertEqual(self.listed(), set())
        self.assertEqual(
            self.client.get(f'/api/bookings/{self.mine["id"]}/').status_code, 404)

    def test_an_employee_sees_only_what_is_assigned_to_them(self):
        # A second chair, and a booking sent to it.
        self.as_user(self.owner_session)
        second = self._hire('01755000005', 'Nadia Sultana')
        self.as_user(self.customer_session)
        for_second = self.book(time='16:00', services=[self.cut], employee=second).data

        employee = self.verify('+8801755000004')
        self.as_user(self.sign_in(employee.phone).data)
        seen = self.listed()
        self.assertIn(self.mine['id'], seen)
        self.assertNotIn(for_second['id'], seen)
        self.assertEqual(self.client.get('/api/bookings/').data['viewpoint'], 'employee')
        self.assertEqual(
            self.client.get(f'/api/bookings/{for_second["id"]}/').status_code, 404)

    def test_an_employee_may_manage_their_own_assigned_booking(self):
        self.as_user(self.owner_session)
        self.client.patch('/api/profile/me/', {'auto_accept': False}, format='json')
        self.as_user(self.customer_session)
        pending = self.book(time='16:00', services=[self.cut], employee=self.chair).data

        employee = self.verify('+8801755000004')
        self.as_user(self.sign_in(employee.phone).data)
        response = self.client.post(f'/api/bookings/{pending["id"]}/approve/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], AppointmentStatus.APPROVED)

    def test_an_independent_barber_sees_their_own_diary(self):
        barber = self.make_barber()
        self.as_user(barber)
        self.client.put('/api/schedule/me/', all_week(), format='json')
        service = self.client.post('/api/services/', {
            'name': 'Skin fade', 'price': '600.00', 'duration_minutes': 30,
        }, format='json').data

        from Apps.users.models import BarberProfile
        profile = BarberProfile.objects.get(user__phone='+8801811111111')

        # This customer has joined the barber as well as the salon, so
        # the request has to say which of the two it is about.
        self.customer_at(profile)
        made = self.client.post('/api/bookings/', {
            'listing': f'barber-{profile.id}', 'date': self.day.isoformat(),
            'time': '12:00', 'service_ids': [service['id']],
        }, format='json')
        self.assertEqual(made.status_code, 201, made.data)

        self.as_user(barber)
        seen = self.listed()
        self.assertEqual(seen, {made.data['id']})
        self.assertEqual(self.client.get('/api/bookings/').data['viewpoint'], 'barber')
        # The salon's bookings are not theirs.
        self.assertNotIn(self.mine['id'], seen)

    def test_an_admin_is_not_a_party_to_anybodys_booking(self):
        self.make_admin()
        self.as_user(self.sign_in('+8801700000000').data)
        self.assertEqual(self.listed(), set())

    def test_signing_out_closes_the_list(self):
        self.client.credentials()
        self.assertEqual(self.client.get('/api/bookings/').status_code, 401)


class FilterTests(BookingTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)
        self.approved = self.book(time='11:00', services=[self.cut]).data
        self.cancelled = self.book(time='14:00', services=[self.cut]).data
        self.client.post(f'/api/bookings/{self.cancelled["id"]}/cancel/', {}, format='json')

    def test_filters_by_status(self):
        response = self.client.get('/api/bookings/', {'status': 'cancelled'})
        self.assertEqual({r['id'] for r in response.data['results']},
                         {self.cancelled['id']})

    def test_filters_by_day(self):
        response = self.client.get('/api/bookings/', {'date': self.day.isoformat()})
        self.assertEqual(len(response.data['results']), 2)
        empty = self.client.get('/api/bookings/', {'date': '2020-01-01'})
        self.assertEqual(empty.data['results'], [])
