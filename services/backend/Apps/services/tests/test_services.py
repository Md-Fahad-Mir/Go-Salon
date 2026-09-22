"""The price list: who may read it, who may change it, and who may perform it."""

from __future__ import annotations

from Apps.services.models import Service, ServiceCategory
from Apps.users.models import SalonEmployee, User
from Apps.users.tests.base import AuthTestCase

SERVICES = '/api/services/'
CATEGORIES = '/api/services/categories/'


def haircut() -> ServiceCategory:
    return ServiceCategory.objects.get(owner=None, name='Haircut')


class CategoryTests(AuthTestCase):
    def test_everyone_signed_in_sees_the_shared_catalogue(self):
        self.as_user(self.make_customer())
        response = self.client.get(CATEGORIES)
        self.assertEqual(response.status_code, 200, response.data)
        names = {row['name'] for row in response.data}
        self.assertIn('Haircut', names)
        self.assertIn('Bridal', names)
        self.assertTrue(all(row['is_shared'] for row in response.data))

    def test_a_professional_can_add_a_heading_of_their_own(self):
        self.as_user(self.make_barber())
        response = self.client.post(CATEGORIES, {
            'name': 'Hot towel', 'icon': 'droplet',
            'description': 'Steam and a straight razor.',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(response.data['is_shared'])

    def test_a_customer_cannot(self):
        self.as_user(self.make_customer())
        response = self.client.post(CATEGORIES, {'name': 'Mine'}, format='json')
        self.assertEqual(response.status_code, 403, response.data)

    def test_one_professional_never_sees_anothers_private_heading(self):
        barber = self.make_barber()
        self.as_user(barber)
        self.client.post(CATEGORIES, {'name': 'Hot towel'}, format='json')

        self.as_user(self.make_owner())
        names = {row['name'] for row in self.client.get(CATEGORIES).data}
        self.assertNotIn('Hot towel', names)

    def test_a_shared_heading_cannot_be_renamed_by_a_professional(self):
        self.as_user(self.make_barber())
        response = self.client.patch(f'{CATEGORIES}{haircut().pk}/',
                                     {'name': 'Mine now'}, format='json')
        self.assertEqual(response.status_code, 404, response.data)
        self.assertEqual(haircut().name, 'Haircut')

    def test_duplicate_names_are_refused(self):
        self.as_user(self.make_barber())
        self.client.post(CATEGORIES, {'name': 'Hot towel'}, format='json')
        again = self.client.post(CATEGORIES, {'name': 'hot towel'}, format='json')
        self.assertEqual(again.status_code, 400, again.data)
        self.assertEqual(again.data['code'], 'category_exists')


class BarberServiceTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.session = self.make_barber()
        self.as_user(self.session)

    def create(self, **overrides):
        payload = {
            'name': 'Skin fade', 'price': '650.00', 'duration_minutes': 30,
            'description': 'Clipper work, washed and styled.',
            'audience': 'male', 'category_id': haircut().pk,
            'includes': ['Consultation', 'Wash'],
            **overrides,
        }
        return self.client.post(SERVICES, payload, format='json')

    def test_creates_with_a_price_a_length_and_an_audience(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['name'], 'Skin fade')
        self.assertEqual(response.data['audience'], 'male')
        self.assertEqual(response.data['duration_minutes'], 30)
        self.assertEqual(response.data['category_name'], 'Haircut')
        self.assertTrue(response.data['is_active'])

        service = Service.objects.get(pk=response.data['id'])
        self.assertIsNotNone(service.barber_id)
        self.assertIsNone(service.salon_id)

    def test_targets_women(self):
        response = self.create(name='Layer cut', audience='female')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['audience'], 'female')

    def test_refuses_a_nonsense_audience(self):
        self.assertEqual(self.create(audience='everyone').status_code, 400)

    def test_refuses_a_missing_price_or_length(self):
        self.assertEqual(self.create(price=None).status_code, 400)
        self.assertEqual(self.create(duration_minutes=0).status_code, 400)

    def test_edits_and_hides_without_deleting(self):
        created = self.create()
        url = f'{SERVICES}{created.data["id"]}/'

        edited = self.client.patch(url, {'price': '750.00', 'is_active': False},
                                   format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data['price'], '750.00')
        self.assertFalse(edited.data['is_active'])
        # Hidden, not gone: it still comes back in the barber's own list.
        self.assertEqual(len(self.client.get(SERVICES).data), 1)

    def test_deletes(self):
        created = self.create()
        response = self.client.delete(f'{SERVICES}{created.data["id"]}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Service.objects.count(), 0)

    def test_never_sees_another_professionals_list(self):
        self.create()
        self.as_user(self.make_owner())
        self.assertEqual(self.client.get(SERVICES).data, [])

    def test_cannot_edit_another_professionals_service(self):
        created = self.create()
        self.as_user(self.make_owner())
        response = self.client.patch(f'{SERVICES}{created.data["id"]}/',
                                     {'price': '1.00'}, format='json')
        self.assertEqual(response.status_code, 404, response.data)

    def test_cannot_pin_a_service_to_staff(self):
        owner = self.make_owner()
        self.as_user(owner)
        made = self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan', 'password': 'chairside2026',
        }, format='json')
        self.as_user(self.session)
        response = self.create(eligible_employee_ids=[made.data['id']])
        self.assertEqual(response.status_code, 400, response.data)

    def test_a_customer_is_refused_outright(self):
        self.as_user(self.make_customer())
        self.assertEqual(self.client.get(SERVICES).status_code, 403)
        self.assertEqual(self.create().status_code, 403)


class SalonServiceTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.as_user(self.owner)
        self.chair_a = self.hire('01755000004', 'Hasan Mahmud')
        self.chair_b = self.hire('01755000005', 'Nadia Sultana')

    def hire(self, phone: str, name: str) -> int:
        response = self.client.post('/api/salon/employees/', {
            'phone': phone, 'name': name, 'password': 'chairside2026',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['id']

    def create(self, **overrides):
        payload = {'name': 'Balayage', 'price': '4500.00', 'duration_minutes': 120,
                   'buffer_minutes': 20, **overrides}
        return self.client.post(SERVICES, payload, format='json')

    def test_a_service_with_no_names_is_open_to_every_active_chair(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['available_to_all_staff'])
        self.assertEqual(response.data['eligible_employee_ids'], [])

        service = Service.objects.get(pk=response.data['id'])
        for pk in (self.chair_a, self.chair_b):
            self.assertTrue(service.performable_by(SalonEmployee.objects.get(pk=pk)))

    def test_a_service_can_be_pinned_to_one_chair(self):
        response = self.create(eligible_employee_ids=[self.chair_a])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(response.data['available_to_all_staff'])

        service = Service.objects.get(pk=response.data['id'])
        self.assertTrue(service.performable_by(SalonEmployee.objects.get(pk=self.chair_a)))
        self.assertFalse(service.performable_by(SalonEmployee.objects.get(pk=self.chair_b)))

    def test_eligibility_can_be_cleared_back_to_everyone(self):
        created = self.create(eligible_employee_ids=[self.chair_a])
        response = self.client.patch(f'{SERVICES}{created.data["id"]}/',
                                     {'eligible_employee_ids': []}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['available_to_all_staff'])

    def test_a_chair_that_is_off_cannot_perform_an_open_service(self):
        service = Service.objects.get(pk=self.create().data['id'])
        chair = SalonEmployee.objects.get(pk=self.chair_a)
        chair.is_active = False
        chair.save(update_fields=['is_active'])
        self.assertFalse(service.performable_by(chair))

    def test_cannot_name_another_salons_chair(self):
        stranger = SalonEmployee.objects.get(pk=self.chair_a)
        other = self.make_barber()
        self.as_user(other)
        response = self.client.post(SERVICES, {
            'name': 'Trim', 'price': '300.00', 'duration_minutes': 20,
            'eligible_employee_ids': [stranger.pk],
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)


class EmployeeServiceAccessTests(AuthTestCase):
    """An employee reads the price list. They do not set it."""

    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.as_user(self.owner)
        self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan', 'password': 'chairside2026',
        }, format='json')
        self.created = self.client.post(SERVICES, {
            'name': 'Blow dry', 'price': '800.00', 'duration_minutes': 40,
        }, format='json')

        user = User.objects.get(phone='+8801755000004')
        user.is_phone_verified = True
        user.save(update_fields=['is_phone_verified'])
        self.as_user(self.sign_in(user.phone).data)

    def test_sees_the_salons_services(self):
        response = self.client.get(SERVICES)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Blow dry')

    def test_cannot_add_one(self):
        response = self.client.post(SERVICES, {
            'name': 'Mine', 'price': '10.00', 'duration_minutes': 10,
        }, format='json')
        self.assertEqual(response.status_code, 403, response.data)

    def test_cannot_reprice_one(self):
        response = self.client.patch(f'{SERVICES}{self.created.data["id"]}/',
                                     {'price': '1.00'}, format='json')
        self.assertEqual(response.status_code, 403, response.data)

    def test_cannot_delete_one(self):
        response = self.client.delete(f'{SERVICES}{self.created.data["id"]}/')
        self.assertEqual(response.status_code, 403, response.data)


class TreatmentStepTests(AuthTestCase):
    """A treatment is a service with an order of work: colour, keratin, bridal.
    The stylist screen asks for the steps, so they have to survive a save."""

    def setUp(self):
        super().setUp()
        self.as_user(self.make_barber(audience='women'))

    def test_steps_are_stored_and_read_back(self):
        response = self.client.post(SERVICES, {
            'name': 'Balayage', 'price': '4500.00', 'duration_minutes': 150,
            'audience': 'female',
            'steps': ['Consultation and strand test', 'Lighten mid-lengths',
                      'Tone at the basin', '  ', 'Blow-dry and finish'],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        # Blanks are dropped, the order is kept.
        self.assertEqual(response.data['steps'], [
            'Consultation and strand test', 'Lighten mid-lengths',
            'Tone at the basin', 'Blow-dry and finish',
        ])

        listed = self.client.get(SERVICES).data[0]
        self.assertEqual(len(listed['steps']), 4)

    def test_a_service_without_steps_has_an_empty_list(self):
        response = self.client.post(SERVICES, {
            'name': 'Trim', 'price': '400.00', 'duration_minutes': 20,
        }, format='json')
        self.assertEqual(response.data['steps'], [])
