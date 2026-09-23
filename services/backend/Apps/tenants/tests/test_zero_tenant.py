"""An account that belongs to nowhere can reach nothing.

`TenantContext` lets a request through with `request.tenant = None` when the
account belongs to no tenant at all — a platform admin, or a customer who has
not joined a salon yet — because asking them to name one would be asking for
something that does not exist. That is only safe if *every* endpoint then
refuses or answers empty, so this walks all of them rather than trusting the
three that happened to be covered elsewhere.

The bar is deliberate: no 500s, no unhandled exceptions, and no endpoint
answering from an implicit `filter(tenant=None)` — which is `IS NULL` in SQL
and returns nothing only for as long as no row has a null tenant.
"""

from __future__ import annotations

from Apps.bookings.models import Appointment
from Apps.bookings.tests.base import BookingTestCase


class ZeroTenantAdminTests(BookingTestCase):
    """A real salon with a real booking, and an admin who is part of neither."""

    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)
        times = self.free_times(services=[self.cut])
        self.booked_at = times[0]
        self.booking_id = self.book(time=self.booked_at).data['id']

        admin = self.make_admin(phone='01700000123')
        admin.set_password('chairside2026')
        admin.save(update_fields=['password'])
        self.admin_session = self.sign_in(admin.phone).data
        self.as_user(self.admin_session)          # deliberately no X-Tenant-Id

    # -- provider-only surfaces: refused on the role, before tenancy -------

    def test_every_provider_endpoint_refuses_an_admin(self):
        listing = f'salon-{self.salon.id}'
        calls = [
            ('get', '/api/services/', None),
            ('post', '/api/services/',
             {'name': 'X', 'price': '1.00', 'duration_minutes': 30}),
            ('get', '/api/schedule/me/', None),
            ('put', '/api/schedule/me/',
             {'days': [{'day': 'mon', 'is_closed': True, 'intervals': []}]}),
            ('get', f'/api/schedule/employees/{self.chair.id}/', None),
            ('get', '/api/profile/me/gallery/', None),
            ('post', '/api/profile/me/gallery/', {'image': 'https://e.test/a.jpg'}),
            ('get', '/api/salon/employees/', None),
            ('post', '/api/salon/employees/',
             {'phone': '01755000123', 'name': 'X', 'password': 'chairside2026'}),
            ('post', '/api/bookings/walk-in/',
             {'customer_name': 'X', 'service_ids': [self.cut.id]}),
            ('get', '/api/bookings/performance/', None),
        ]
        for verb, url, payload in calls:
            with self.subTest(endpoint=f'{verb.upper()} {url}'):
                fn = getattr(self.client, verb)
                response = fn(url, payload, format='json') if payload else fn(url)
                self.assertEqual(response.status_code, 403, response.data)

    # -- availability: the one that leaked ---------------------------------

    def test_availability_is_refused_rather_than_answered_for_any_salon(self):
        """This used to hand over the whole week, and get it wrong as well.

        `parse_listing` treated a `None` tenant as "do not check", so an
        account belonging nowhere could name any salon and read its grid — and
        `_busy` filtered `tenant=None`, which is `IS NULL`, matched no
        appointment and reported the booked slot as free. A leak and a lie in
        the same response.
        """
        response = self.client.get(
            f'/api/bookings/availability/?listing=salon-{self.salon.id}'
            f'&date={self.day.isoformat()}&service_ids={self.cut.id}')
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(response.data['code'], 'wrong_tenant')
        self.assertNotIn('slots', response.data)

    def test_booking_into_a_salon_is_refused_the_same_way(self):
        response = self.client.post('/api/bookings/', {
            'listing': f'salon-{self.salon.id}', 'date': self.day.isoformat(),
            'time': '12:00', 'service_ids': [self.cut.id],
        }, format='json')
        self.assertIn(response.status_code, (403, 400), response.data)
        self.assertEqual(Appointment.objects.count(), 1)

    # -- scoped surfaces: answered, and empty ------------------------------

    def test_the_booking_list_is_empty_rather_than_everyone_elses(self):
        response = self.client.get('/api/bookings/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['results'], [])
        self.assertEqual(response.data['viewpoint'], 'none')

    def test_one_booking_by_id_is_not_found(self):
        self.assertEqual(
            self.client.get(f'/api/bookings/{self.booking_id}/').status_code, 404)
        self.assertEqual(
            self.client.post(f'/api/bookings/{self.booking_id}/approve/').status_code,
            404)

    def test_the_reports_carry_no_figures(self):
        response = self.client.get('/api/bookings/analytics/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['viewpoint'], 'none')
        self.assertEqual(response.data['headline']['bookings'], 0)
        self.assertEqual(response.data['headline']['revenue'], '0.00')
        self.assertEqual(response.data['by_staff'], [])

    def test_the_reviews_list_is_empty_and_one_review_is_not_found(self):
        response = self.client.get('/api/reviews/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['results'], [])
        self.assertEqual(
            self.client.post(f'/api/reviews/booking/{self.booking_id}/',
                             {'rating': 5}, format='json').status_code, 404)

    # -- and the salon's own booking is untouched throughout ---------------

    def test_nothing_the_admin_did_changed_the_salons_data(self):
        self.assertEqual(Appointment.objects.count(), 1)
        appointment = Appointment.objects.get(pk=self.booking_id)
        self.assertEqual(appointment.tenant_id, self.tenant.pk)
