"""The admin dashboard's view of every account."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from unittest import mock

from django.utils import timezone

from Apps.bookings.models import business_tz
from Apps.tryon import ai_service
from Apps.tryon.models import TryOnVideo, VideoStatus
from Apps.users.models import Role, Salon, SalonEmployee, User
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


class AdminUserAccountTypeTests(AuthTestCase):
    """`account_type` splits salon owners and employees into salon and
    parlour by the place's audience; every other role passes through."""

    def setUp(self):
        super().setUp()
        self.as_user(self.admin_session())

    def row(self, session_or_user) -> dict:
        user = session_or_user if isinstance(session_or_user, User) else self.user_for(session_or_user)
        response = self.client.get(detail(user.pk))
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def hire(self, salon: Salon, phone: str = '01755000004', *, active: bool = True) -> User:
        staff = User.objects.create_user(phone=phone, name='Hasan Mahmud',
                                         role=Role.SALON_EMPLOYEE, is_phone_verified=True)
        SalonEmployee.objects.create(salon=salon, user=staff, title='Stylist', is_active=active)
        return staff

    def test_roles_without_a_parlour_variant_pass_through(self):
        self.assertEqual(self.row(self.make_customer())['account_type'], 'customer')
        self.assertEqual(self.row(self.make_barber())['account_type'], 'barber')
        admin = User.objects.get(role=Role.ADMIN)
        self.assertEqual(self.row(admin)['account_type'], 'admin')

    def test_owner_of_a_womens_salon_is_a_parlour_owner(self):
        row = self.row(self.make_owner(audience='women'))
        self.assertEqual(row['role'], 'salon_owner')
        self.assertEqual(row['account_type'], 'parlour_owner')
        self.assertEqual([salon['name'] for salon in row['salons']], ['Glow Beauty Parlour'])
        self.assertEqual(row['salons'][0]['audience'], 'women')

    def test_owner_of_a_unisex_salon_is_a_salon_owner(self):
        row = self.row(self.make_owner(audience='unisex'))
        self.assertEqual(row['account_type'], 'salon_owner')

    def test_owner_of_a_parlour_and_a_gents_salon_is_a_salon_owner(self):
        owner = self.user_for(self.make_owner(audience='women'))
        Salon.objects.create(owner=owner, name='Gents Corner', audience='men')
        row = self.row(owner)
        self.assertEqual(row['account_type'], 'salon_owner')
        self.assertEqual(len(row['salons']), 2)

    def test_employee_follows_the_salon_they_work_at(self):
        parlour = self.user_for(self.make_owner(audience='women')).salons.get()
        staff = self.hire(parlour)
        row = self.row(staff)
        self.assertEqual(row['account_type'], 'parlour_employee')
        self.assertEqual(row['employment']['title'], 'Stylist')
        self.assertEqual(row['employment']['salon']['name'], 'Glow Beauty Parlour')

        parlour.audience = 'unisex'
        parlour.save(update_fields=['audience'])
        self.assertEqual(self.row(staff)['account_type'], 'salon_employee')

    def test_employee_whose_job_ended_is_a_salon_employee_with_no_employment(self):
        parlour = self.user_for(self.make_owner(audience='women')).salons.get()
        row = self.row(self.hire(parlour, active=False))
        self.assertEqual(row['account_type'], 'salon_employee')
        self.assertIsNone(row['employment'])

    def test_non_providers_carry_no_business(self):
        row = self.row(self.make_customer())
        self.assertEqual(row['salons'], [])
        self.assertIsNone(row['employment'])

    def test_list_rows_carry_account_type(self):
        self.make_owner(audience='women')
        response = self.client.get(LIST, {'role': 'salon_owner'})
        self.assertEqual([row['account_type'] for row in response.data], ['parlour_owner'])


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
        self.assertEqual(response.data['tryon_videos']['value'], 0)

    def test_counts_every_completed_try_on_video(self):
        self.as_user(self.admin_session())
        customer = User.objects.get(pk=self.make_customer()['user']['id'])
        now = timezone.now()

        def video(job_id: str, status: str, completed_at=None) -> None:
            TryOnVideo.objects.create(
                user=customer, hairstyle_name='Textured crop', job_id=job_id,
                status=status, completed_at=completed_at,
            )

        video('recent', VideoStatus.COMPLETED, now - timedelta(days=2))
        video('older', VideoStatus.COMPLETED, now - timedelta(days=45))
        video('rendering', VideoStatus.PROCESSING)
        video('broken', VideoStatus.FAILED)

        catalogue = {'default_model': 'm', 'models': [{'id': 'm', 'price_per_video_usd': 0.25}]}
        with mock.patch.object(ai_service, 'video_models', return_value=catalogue):
            response = self.client.get('/api/admin/overview/', {'range': '30d'})
        self.assertEqual(response.status_code, 200, response.data)
        # spend and revenue cover the same two videos
        self.assertEqual(response.data['ai_spend']['videos'], 2)
        self.assertEqual(response.data['ai_spend']['revenue_bdt'], 2 * 15)
        # both finished videos, whenever they finished; nothing still in flight or failed
        self.assertEqual(response.data['tryon_videos']['value'], 2)
        # one this period against one the period before
        self.assertEqual(response.data['tryon_videos']['change_pct'], 0.0)
        self.assertEqual(response.data['tryon_videos']['tone'], 'neutral')

    def test_videos_per_day_covers_every_day_of_the_range(self):
        self.as_user(self.admin_session())
        customer = User.objects.get(pk=self.make_customer()['user']['id'])
        tz = business_tz()
        today = timezone.now().astimezone(tz).date()

        def video(job_id: str, day, status=VideoStatus.COMPLETED) -> None:
            # Midday on the salon's clock, so the day is the same in UTC.
            completed_at = datetime.combine(day, time(12), tzinfo=tz)
            TryOnVideo.objects.create(
                user=customer, hairstyle_name='Textured crop', job_id=job_id,
                status=status, completed_at=completed_at,
            )

        video('today-1', today)
        video('today-2', today)
        video('week-ago', today - timedelta(days=7))
        video('too-old', today - timedelta(days=30))
        video('broken', today, status=VideoStatus.FAILED)

        with mock.patch.object(ai_service, 'video_models', return_value={'models': []}):
            response = self.client.get('/api/admin/overview/', {'range': '30d'})
        self.assertEqual(response.status_code, 200, response.data)
        daily = response.data['tryon_videos_daily']
        # thirty days ending today, oldest first, empty days kept at zero
        self.assertEqual(len(daily), 30)
        self.assertEqual(daily[0]['date'], (today - timedelta(days=29)).isoformat())
        self.assertEqual(daily[-1], {'date': today.isoformat(), 'count': 2})
        self.assertEqual(daily[-8], {'date': (today - timedelta(days=7)).isoformat(), 'count': 1})
        # the 31-day-old video and the failed one are left out
        self.assertEqual(sum(entry['count'] for entry in daily), 3)


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
