"""The AI try-on catalogue: admin-only, end to end."""

from __future__ import annotations

from Apps.hairstyles.models import Hairstyle
from Apps.users.tests.base import AuthTestCase

LIST = '/api/hairstyles/'


def detail(pk: int) -> str:
    return f'/api/hairstyles/{pk}/'


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
