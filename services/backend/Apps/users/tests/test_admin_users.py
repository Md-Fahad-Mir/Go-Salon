"""The admin dashboard's view of every account."""

from __future__ import annotations

from Apps.users.models import User
from Apps.users.tests.base import AuthTestCase

LIST = '/api/admin/users/'


def detail(pk: int) -> str:
    return f'/api/admin/users/{pk}/'


class AdminUserAccessTests(AuthTestCase):
    def test_a_customer_is_refused(self):
        self.as_user(self.make_customer())
        self.assertEqual(self.client.get(LIST).status_code, 403)

    def test_an_anonymous_caller_is_refused(self):
        self.assertEqual(self.client.get(LIST).status_code, 401)


class AdminUserListTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.admin_session())

    def test_lists_every_role(self):
        self.make_customer()
        self.make_barber()
        self.make_owner()
        response = self.client.get(LIST)
        self.assertEqual(response.status_code, 200, response.data)
        # admin + customer + barber + owner
        self.assertEqual(len(response.data), 4)

    def test_search_matches_name_or_phone(self):
        self.make_customer()
        response = self.client.get(LIST, {'q': 'Ahmed'})
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Ahmed Hassan')

    def test_filter_by_role(self):
        self.make_customer()
        self.make_barber()
        response = self.client.get(LIST, {'role': 'barber'})
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['role'], 'barber')

    def test_customer_row_carries_hair_profile(self):
        self.make_customer()
        response = self.client.get(LIST, {'role': 'customer'})
        row = response.data[0]
        self.assertEqual(row['hair_type'], 'wavy')
        self.assertIsNotNone(row['location'])

    def test_non_customer_has_no_hair_profile(self):
        self.make_barber()
        response = self.client.get(LIST, {'role': 'barber'})
        row = response.data[0]
        self.assertIsNone(row['hair_type'])
        self.assertIsNone(row['location'])


class AdminUserDetailTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.admin_session())

    def test_update_subscription_and_status(self):
        session = self.make_customer()
        user_id = session['user']['id']

        response = self.client.patch(
            detail(user_id), {'subscription_tier': 'advanced', 'account_status': 'suspended'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['subscription_tier'], 'advanced')
        self.assertEqual(response.data['account_status'], 'suspended')

        user = User.objects.get(pk=user_id)
        self.assertFalse(user.is_active, 'suspending must also block sign-in')

    def test_reactivating_restores_is_active(self):
        session = self.make_customer()
        user_id = session['user']['id']
        self.client.patch(detail(user_id), {'account_status': 'suspended'}, format='json')
        self.client.patch(detail(user_id), {'account_status': 'active'}, format='json')
        self.assertTrue(User.objects.get(pk=user_id).is_active)

    def test_cannot_reuse_another_accounts_phone(self):
        first = self.make_customer()
        second = self.make_barber()
        response = self.client.patch(
            detail(second['user']['id']), {'phone': first['user']['phone']}, format='json',
        )
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'phone_taken')

    def test_delete_removes_the_account(self):
        session = self.make_customer()
        user_id = session['user']['id']
        response = self.client.delete(detail(user_id))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=user_id).exists())

    def test_an_admin_cannot_delete_themselves(self):
        me = User.objects.get(phone='+8801700000000')
        response = self.client.delete(detail(me.id))
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'cannot_delete_self')

    def test_an_admin_cannot_suspend_themselves(self):
        """Suspending syncs is_active to False — doing it to yourself would
        sign out the very session making the request, with no way back in
        through this UI."""
        me = User.objects.get(phone='+8801700000000')
        response = self.client.patch(detail(me.id), {'account_status': 'suspended'}, format='json')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'cannot_modify_self_status')
        me.refresh_from_db()
        self.assertTrue(me.is_active)

    def test_an_admin_can_set_their_own_status_to_active(self):
        """The guard is specifically against locking yourself out, not
        against touching your own row at all."""
        me = User.objects.get(phone='+8801700000000')
        response = self.client.patch(detail(me.id), {'account_status': 'active'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_an_admin_can_still_edit_their_own_name(self):
        me = User.objects.get(phone='+8801700000000')
        response = self.client.patch(detail(me.id), {'name': 'New Name'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['name'], 'New Name')

    def test_unknown_id_is_a_clean_404(self):
        self.assertEqual(self.client.get(detail(999999)).status_code, 404)


class AdminOverviewStatsTests(AuthTestCase):
    def test_refused_to_non_admins(self):
        self.as_user(self.make_customer())
        self.assertEqual(self.client.get('/api/admin/overview/').status_code, 403)

    def test_shape_for_an_admin(self):
        self.as_user(self.admin_session())
        self.make_customer()
        response = self.client.get('/api/admin/overview/', {'range': '30d'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('active_users', response.data)
        self.assertIn('new_salons', response.data)
        self.assertIn('value', response.data['active_users'])
        self.assertIn('awaiting_approval', response.data['new_salons'])
        # the admin itself plus the one customer just made
        self.assertEqual(response.data['active_users']['value'], 2)


class AdminCreateSalonTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.admin_session())

    def test_creates_an_owner_and_a_salon(self):
        response = self.client.post('/api/admin/salons/', {
            'business_name': 'Elegance Hair Studio',
            'business_type': 'salon',
            'owner_name': 'Farhana Ahmed',
            'owner_phone': '01755555555',
            'owner_email': 'farhana@example.com',
            'city': 'Dhaka',
            'address': 'Road 11, Dhanmondi',
            'bio': 'A full-service salon.',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['salon']['name'], 'Elegance Hair Studio')

        owner = User.objects.get(phone='+8801755555555')
        self.assertEqual(owner.role, 'salon_owner')
        self.assertTrue(owner.is_phone_verified)
        self.assertTrue(owner.is_active)
        self.assertTrue(owner.salons.exists())
        self.assertTrue(owner.salons.first().tenant)

    def test_sets_the_password_the_admin_chose(self):
        response = self.client.post('/api/admin/salons/', {
            'business_name': 'Elegance Hair Studio', 'business_type': 'salon',
            'owner_name': 'Farhana Ahmed', 'owner_phone': '01755555555',
            'owner_password': 'Scissors-and-silk-42',
            'address': 'Road 11, Dhanmondi',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotIn('owner_password', response.data)

        owner = User.objects.get(phone='+8801755555555')
        self.assertTrue(owner.check_password('Scissors-and-silk-42'))

    def test_refuses_a_password_that_fails_the_policy(self):
        response = self.client.post('/api/admin/salons/', {
            'business_name': 'Elegance Hair Studio', 'business_type': 'salon',
            'owner_name': 'Farhana Ahmed', 'owner_phone': '01755555555',
            'owner_password': '12345678',
            'address': 'Road 11, Dhanmondi',
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('owner_password', response.data['errors'])
        self.assertFalse(User.objects.filter(phone='+8801755555555').exists())

    def test_refuses_a_phone_already_in_use(self):
        self.make_customer()
        response = self.client.post('/api/admin/salons/', {
            'business_name': 'Elegance Hair Studio', 'business_type': 'salon',
            'owner_name': 'Farhana Ahmed', 'owner_phone': '01712345678',
            'address': 'Road 11, Dhanmondi',
        }, format='json')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'phone_taken')

    def test_refused_to_non_admins(self):
        self.as_user(self.make_owner())
        response = self.client.post('/api/admin/salons/', {
            'business_name': 'X', 'business_type': 'salon',
            'owner_name': 'Y', 'owner_phone': '01799999999', 'address': 'Somewhere long enough',
        }, format='json')
        self.assertEqual(response.status_code, 403, response.data)
