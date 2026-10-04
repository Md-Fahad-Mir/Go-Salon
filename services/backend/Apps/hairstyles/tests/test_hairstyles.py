"""The AI try-on catalogue: curated by admins, read by the app."""

from __future__ import annotations

from Apps.hairstyles.models import Hairstyle
from Apps.hairstyles.serializers import MAX_PROMPT_LENGTH
from Apps.users.tests.base import AuthTestCase

LIST = '/api/hairstyles/'
CATALOGUE = '/api/hairstyles/catalogue/'


def detail(pk: int) -> str:
    return f'/api/hairstyles/{pk}/'


def catalogue_style(pk: int) -> str:
    return f'/api/hairstyles/catalogue/{pk}/'


class HairstyleAccessTests(AuthTestCase):
    def test_a_customer_is_refused(self):
        self.as_user(self.make_customer())
        self.assertEqual(self.client.get(LIST).status_code, 403)

    def test_a_salon_owner_is_refused(self):
        self.as_user(self.make_owner())
        self.assertEqual(self.client.get(LIST).status_code, 403)

    def test_an_anonymous_caller_is_refused(self):
        self.assertEqual(self.client.get(LIST).status_code, 401)

    def test_an_admin_sees_the_list(self):
        self.as_user(self.admin_session())
        response = self.client.get(LIST)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data, [])


class HairstyleCrudTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.admin_session())

    def test_create_and_read_back(self):
        response = self.client.post(LIST, {
            'name': 'Textured crop', 'category': 'Haircut',
            'description': 'Short on the sides, tousled on top.',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['name'], 'Textured crop')
        self.assertEqual(response.data['status'], 'active')
        self.assertEqual(response.data['generation_count'], 0)

        listed = self.client.get(LIST)
        self.assertEqual(len(listed.data), 1)

    def test_name_is_required(self):
        response = self.client.post(LIST, {'name': '', 'category': 'Haircut'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('name', response.data['errors'])

    def test_search_matches_name_or_category(self):
        self.client.post(LIST, {'name': 'Skin fade', 'category': 'Haircut'}, format='json')
        self.client.post(LIST, {'name': 'Balayage', 'category': 'Coloring'}, format='json')

        by_name = self.client.get(LIST, {'q': 'fade'})
        self.assertEqual([row['name'] for row in by_name.data], ['Skin fade'])

        by_category = self.client.get(LIST, {'q': 'coloring'})
        self.assertEqual([row['name'] for row in by_category.data], ['Balayage'])

    def test_patch_toggles_active_status(self):
        created = self.client.post(LIST, {'name': 'Buzz cut', 'category': 'Haircut'}, format='json').data
        response = self.client.patch(detail(created['id']), {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], 'inactive')

    def test_delete_removes_it(self):
        created = self.client.post(LIST, {'name': 'Pompadour', 'category': 'Styling'}, format='json').data
        response = self.client.delete(detail(created['id']))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Hairstyle.objects.filter(pk=created['id']).exists())

    def test_unknown_id_is_a_clean_404(self):
        self.assertEqual(self.client.get(detail(999999)).status_code, 404)
        self.assertEqual(self.client.patch(detail(999999), {}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(detail(999999)).status_code, 404)

    def test_a_prompt_longer_than_the_generator_reads_is_refused(self):
        response = self.client.post(LIST, {
            'name': 'Long prompt', 'category': 'Haircut',
            'description': 'x' * (MAX_PROMPT_LENGTH + 1),
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('description', response.data['errors'])

        at_limit = self.client.post(LIST, {
            'name': 'Long prompt', 'category': 'Haircut',
            'description': 'x' * MAX_PROMPT_LENGTH,
        }, format='json')
        self.assertEqual(at_limit.status_code, 201, at_limit.data)


class HairstyleCatalogueTests(AuthTestCase):
    """What the app's try-on picker reads: the admin's active styles, and
    nothing else."""

    IMAGE = 'data:image/png;base64,iVBORw0KGgo='

    def setUp(self):
        super().setUp()
        self.active = Hairstyle.objects.create(
            name='Textured crop', category='Haircut',
            description='A textured crop, short on the sides, tousled on top.',
            image=self.IMAGE,
        )
        self.inactive = Hairstyle.objects.create(
            name='Mullet', category='Haircut', description='Business up front.', is_active=False,
        )

    def test_an_anonymous_caller_is_refused(self):
        self.assertEqual(self.client.get(CATALOGUE).status_code, 401)
        self.assertEqual(self.client.get(catalogue_style(self.active.pk)).status_code, 401)

    def test_a_customer_and_a_salon_owner_both_read_it(self):
        for user in (self.make_customer(), self.make_owner()):
            self.as_user(user)
            response = self.client.get(CATALOGUE)
            self.assertEqual(response.status_code, 200, response.data)

    def test_only_active_styles_are_listed(self):
        self.as_user(self.make_customer())
        response = self.client.get(CATALOGUE)
        self.assertEqual([row['id'] for row in response.data], [self.active.pk])

    def test_a_row_carries_the_card_and_the_admin_prompt_only(self):
        self.as_user(self.make_customer())
        row = self.client.get(CATALOGUE).data[0]
        self.assertEqual(row, {
            'id': self.active.pk,
            'name': 'Textured crop',
            'category': 'Haircut',
            'prompt': 'A textured crop, short on the sides, tousled on top.',
            'image': self.IMAGE,
        })

    def test_a_style_the_admin_adds_appears_without_anything_else_changing(self):
        admin, customer = self.admin_session(), self.make_customer()
        self.as_user(admin)
        created = self.client.post(LIST, {'name': 'Buzz cut', 'category': 'Haircut'}, format='json').data

        self.as_user(customer)
        names = [row['name'] for row in self.client.get(CATALOGUE).data]
        self.assertIn('Buzz cut', names)
        self.assertEqual(self.client.get(catalogue_style(created['id'])).status_code, 200)

    def test_deactivating_or_deleting_takes_a_style_out(self):
        admin, customer = self.admin_session(), self.make_customer()
        self.as_user(admin)
        self.client.patch(detail(self.active.pk), {'is_active': False}, format='json')

        self.as_user(customer)
        self.assertEqual(self.client.get(CATALOGUE).data, [])
        self.assertEqual(self.client.get(catalogue_style(self.active.pk)).status_code, 404)

        self.as_user(admin)
        self.client.patch(detail(self.active.pk), {'is_active': True}, format='json')
        self.client.delete(detail(self.active.pk))

        self.as_user(customer)
        self.assertEqual(self.client.get(CATALOGUE).data, [])
        self.assertEqual(self.client.get(catalogue_style(self.active.pk)).status_code, 404)

    def test_an_inactive_style_is_a_404_not_a_403(self):
        self.as_user(self.make_customer())
        response = self.client.get(catalogue_style(self.inactive.pk))
        self.assertEqual(response.status_code, 404, response.data)

    def test_the_catalogue_is_read_only(self):
        self.as_user(self.admin_session())
        self.assertEqual(self.client.post(CATALOGUE, {'name': 'x', 'category': 'y'}, format='json').status_code, 405)
        self.assertEqual(self.client.delete(catalogue_style(self.active.pk)).status_code, 405)
