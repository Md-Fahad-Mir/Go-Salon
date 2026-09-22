"""The owner's staff: the only way an employee account comes to exist."""

from __future__ import annotations

from Apps.users.models import BarberProfile, OTPPurpose, Role, Salon, SalonEmployee, User

from .base import BARBER_PAYLOAD, AuthTestCase


class EmployeeManagementTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.salon = Salon.objects.get(owner_id=self.owner['user']['id'])

    def add_employee(self, **data):
        self.as_user(self.owner)
        return self.client.post('/api/salon/employees/', data, format='json')

    # --- creating -------------------------------------------------------

    def test_owner_creates_an_employee_account(self):
        response = self.add_employee(phone='01733333333', name='Hasan Mahmud',
                                     title='Senior barber', password='chairside2026')

        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(phone='+8801733333333')
        self.assertEqual(user.role, Role.SALON_EMPLOYEE)
        self.assertEqual(user.name, 'Hasan Mahmud')
        # The owner vouches for them; the phone is still theirs to prove.
        self.assertFalse(user.is_phone_verified)
        self.assertTrue(SalonEmployee.objects.filter(salon=self.salon, user=user,
                                                     is_active=True).exists())

    def test_new_employee_signs_in_once_they_verify_the_number(self):
        self.add_employee(phone='01733333333', name='Hasan Mahmud',
                          password='chairside2026')
        self.client.credentials()

        blocked = self.sign_in('01733333333')
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.data['code'], 'phone_not_verified')

        self.client.post('/api/auth/otp/request/', {'phone': '01733333333'}, format='json')
        verified = self.client.post(
            '/api/auth/otp/verify/',
            {'phone': '01733333333', 'code': self.last_code(),
             'purpose': OTPPurpose.REGISTRATION},
            format='json',
        )
        self.assertEqual(verified.status_code, 200, verified.data)
        self.assertEqual(verified.data['user']['role'], Role.SALON_EMPLOYEE)
        self.assertEqual(self.sign_in('01733333333').status_code, 200)

    def test_a_new_employee_needs_a_name_and_a_password(self):
        response = self.add_employee(phone='01733333333')

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('name', response.data['errors'])
        self.assertIn('password', response.data['errors'])

    def test_the_employees_password_is_held_to_the_same_policy(self):
        response = self.add_employee(phone='01733333333', name='Hasan', password='123')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'password_invalid')

    # --- associating an existing barber ---------------------------------

    def test_an_existing_barber_is_associated_not_duplicated(self):
        barber = self.make_barber()
        before = User.objects.count()

        response = self.add_employee(phone=BARBER_PAYLOAD['phone'], title='Stylist')
        self.assertEqual(response.status_code, 201, response.data)

        # Same account, no second row for the same number.
        self.assertEqual(User.objects.count(), before)
        self.assertEqual(response.data['user']['id'], barber['user']['id'])

        user = User.objects.get(pk=barber['user']['id'])
        self.assertEqual(user.role, Role.SALON_EMPLOYEE)
        # Their trade is kept, so leaving gives it back.
        self.assertTrue(BarberProfile.objects.filter(user=user).exists())

    def test_an_associated_barber_keeps_their_password(self):
        self.make_barber()
        self.add_employee(phone=BARBER_PAYLOAD['phone'])
        self.client.credentials()

        response = self.sign_in(BARBER_PAYLOAD['phone'])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['user']['role'], Role.SALON_EMPLOYEE)

    def test_nobody_holds_two_chairs(self):
        self.make_barber()
        self.add_employee(phone=BARBER_PAYLOAD['phone'])

        again = self.add_employee(phone=BARBER_PAYLOAD['phone'])
        self.assertEqual(again.status_code, 409, again.data)
        self.assertEqual(again.data['code'], 'already_employed')

    def test_a_customers_number_is_not_quietly_turned_into_staff(self):
        self.make_customer()
        response = self.add_employee(phone='01712345678', name='Ahmed',
                                     password='chairside2026')

        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'phone_is_customer')
        self.assertEqual(User.objects.get(phone='+8801712345678').role, Role.CUSTOMER)

    def test_another_owners_number_is_refused(self):
        response = self.add_employee(phone=self.owner['user']['phone'])
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['code'], 'phone_not_available')

    def test_invalid_phone_is_refused(self):
        response = self.add_employee(phone='nonsense', name='X', password='chairside2026')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_phone')

    # --- removing --------------------------------------------------------

    def test_removing_a_hired_barber_gives_their_trade_back(self):
        self.make_barber()
        created = self.add_employee(phone=BARBER_PAYLOAD['phone'])

        self.as_user(self.owner)
        removed = self.client.delete(f'/api/salon/employees/{created.data["id"]}/')
        self.assertEqual(removed.status_code, 204)

        user = User.objects.get(phone='+8801811111111')
        self.assertEqual(user.role, Role.BARBER)
        self.assertFalse(user.employments.filter(is_active=True).exists())

    def test_a_removed_employee_can_be_hired_again(self):
        self.make_barber()
        created = self.add_employee(phone=BARBER_PAYLOAD['phone'])
        self.as_user(self.owner)
        self.client.delete(f'/api/salon/employees/{created.data["id"]}/')

        rehired = self.add_employee(phone=BARBER_PAYLOAD['phone'])
        self.assertEqual(rehired.status_code, 201, rehired.data)
        self.assertEqual(SalonEmployee.objects.filter(user__phone='+8801811111111').count(), 1)

    def test_an_owner_cannot_touch_another_salons_staff(self):
        created = self.add_employee(phone='01733333333', name='Hasan',
                                    password='chairside2026')
        other = self.register_and_verify('salon-owner', {
            'phone': '01966666666', 'name': 'Other Owner', 'password': 'chairside2026',
            'accepted_terms': True, 'business_name': 'Other Salon',
            'business_type': 'barber', 'audience': 'men', 'address': 'Road 1, Gulshan',
        })

        self.as_user(other)
        self.assertEqual(
            self.client.delete(f'/api/salon/employees/{created.data["id"]}/').status_code,
            404,
        )
        self.assertEqual(self.client.get('/api/salon/employees/').data, [])

    # --- what an employee may not do -------------------------------------

    def test_an_employee_cannot_create_another_employee(self):
        self.add_employee(phone='01733333333', name='Hasan', password='chairside2026')
        employee = self.verify_employee('01733333333')

        self.as_user(employee)
        response = self.client.post('/api/salon/employees/',
                                    {'phone': '01744444444', 'name': 'Another',
                                     'password': 'chairside2026'}, format='json')
        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(User.objects.filter(phone='+8801744444444').exists())

    def test_an_employee_cannot_remove_staff(self):
        created = self.add_employee(phone='01733333333', name='Hasan',
                                    password='chairside2026')
        employee = self.verify_employee('01733333333')

        self.as_user(employee)
        response = self.client.delete(f'/api/salon/employees/{created.data["id"]}/')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(SalonEmployee.objects.get(pk=created.data['id']).is_active)

    def test_an_employee_cannot_elevate_their_own_role(self):
        self.add_employee(phone='01733333333', name='Hasan', password='chairside2026')
        employee = self.verify_employee('01733333333')
        self.as_user(employee)

        # No endpoint accepts a role at all, and registering again with the
        # same number cannot overwrite a verified account.
        for path in ('/api/auth/register/salon-owner/', '/api/auth/register/barber/'):
            with self.subTest(path=path):
                response = self.client.post(path, {
                    'phone': '01733333333', 'name': 'Hasan', 'password': 'chairside2026',
                    'accepted_terms': True, 'business_name': 'Mine',
                    'business_type': 'salon', 'audience': 'unisex',
                    'address': 'Road 9, Dhanmondi', 'experience_years': 1,
                    'service_ids': ['cut'],
                }, format='json')
                self.assertEqual(response.status_code, 409, response.data)

        self.assertEqual(User.objects.get(phone='+8801733333333').role, Role.SALON_EMPLOYEE)

    def test_an_employee_cannot_delete_a_user(self):
        self.add_employee(phone='01733333333', name='Hasan', password='chairside2026')
        employee = self.verify_employee('01733333333')
        self.as_user(employee)

        # There is no user-deletion endpoint to reach in the first place.
        for path in (f'/api/auth/me/', f'/api/users/{self.owner["user"]["id"]}/'):
            with self.subTest(path=path):
                self.assertIn(self.client.delete(path).status_code, (404, 405))
        self.assertTrue(User.objects.filter(pk=self.owner['user']['id']).exists())

    # --- helper ----------------------------------------------------------

    def verify_employee(self, phone: str) -> dict:
        """An owner-made account proving its phone, which is what the employee
        does the first time they sign in."""
        self.client.credentials()
        self.client.post('/api/auth/otp/request/', {'phone': phone}, format='json')
        response = self.client.post(
            '/api/auth/otp/verify/',
            {'phone': phone, 'code': self.last_code(), 'purpose': OTPPurpose.REGISTRATION},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response.data


class EmployeeRecordManagementTests(AuthTestCase):
    """Reading and editing one chair — the half of the roster that is the
    salon's business rather than the person's."""

    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.as_user(self.owner)
        made = self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan Mahmud', 'title': 'Stylist',
            'password': 'chairside2026', 'commission_rate': 35,
        }, format='json')
        self.assertEqual(made.status_code, 201, made.data)
        self.chair = made.data['id']

    def test_a_new_chair_gets_a_trade_record_to_fill_in(self):
        response = self.client.get(f'/api/salon/employees/{self.chair}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNotNone(response.data['profile'])
        self.assertEqual(response.data['profile']['audience'], 'women')
        self.assertEqual(response.data['commission_rate'], 35)
        self.assertFalse(response.data['has_own_schedule'])

    def test_the_owner_sets_the_job_and_the_split(self):
        response = self.client.patch(f'/api/salon/employees/{self.chair}/', {
            'title': 'Senior Stylist', 'commission_rate': 45,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['title'], 'Senior Stylist')
        self.assertEqual(response.data['commission_rate'], 45)
        # Whether a chair is taking work is `is_active` and nothing else;
        # there is no "on a break" any more.
        self.assertNotIn('chair_status', response.data)

    def test_a_chair_can_be_closed_without_being_removed(self):
        response = self.client.patch(f'/api/salon/employees/{self.chair}/',
                                     {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['is_active'])
        # Still on the roster — off is not gone.
        self.assertEqual(len(self.client.get('/api/salon/employees/').data), 1)

    def test_a_split_outside_nought_to_a_hundred_is_refused(self):
        response = self.client.patch(f'/api/salon/employees/{self.chair}/',
                                     {'commission_rate': 140}, format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_the_owner_cannot_rewrite_the_person(self):
        self.client.patch(f'/api/salon/employees/{self.chair}/',
                          {'user': {'name': 'Someone Else'}}, format='json')
        self.assertEqual(User.objects.get(phone='+8801755000004').name,
                         'Hasan Mahmud')

    def test_another_owner_cannot_see_or_touch_the_chair(self):
        self.as_user(self.make_owner(phone='01913333333', business_name='Other Salon'))
        self.assertEqual(
            self.client.get(f'/api/salon/employees/{self.chair}/').status_code, 404)
        self.assertEqual(
            self.client.patch(f'/api/salon/employees/{self.chair}/',
                              {'title': 'Mine'}, format='json').status_code, 404)

    def test_an_existing_barber_joins_without_a_second_account(self):
        barber = self.make_barber()
        before = User.objects.count()

        self.as_user(self.owner)
        response = self.client.post('/api/salon/employees/', {
            'phone': BARBER_PAYLOAD['phone'], 'title': 'Barber',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(User.objects.count(), before)
        self.assertEqual(response.data['user']['id'], barber['user']['id'])
        # Their own trade record came with them, bio and all.
        self.assertIsNotNone(response.data['profile'])
        self.assertEqual(response.data['profile']['experience_years'], 7)
