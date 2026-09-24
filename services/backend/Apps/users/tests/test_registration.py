"""Public sign-up: three roles may, two may not."""

from __future__ import annotations

from Apps.users.models import BarberProfile, CustomerProfile, Role, Salon, User

from .base import BARBER_PAYLOAD, CUSTOMER_PAYLOAD, OWNER_PAYLOAD, AuthTestCase


class RegistrationTests(AuthTestCase):
    def test_customer_registration_creates_an_unverified_account(self):
        response = self.register('customer', CUSTOMER_PAYLOAD)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['verification_required'])
        # No session yet: the phone is still unproved.
        self.assertNotIn('access', response.data)

        user = User.objects.get(phone='+8801712345678')
        self.assertEqual(user.role, Role.CUSTOMER)
        self.assertFalse(user.is_phone_verified)
        self.assertTrue(CustomerProfile.objects.filter(user=user).exists())
        self.assertEqual(user.customer_profile.hair_type, 'wavy')

    def test_a_customer_can_register_with_the_account_alone(self):
        """The body the app's trimmed sign-up sends, exactly.

        Since FR2 the customer sign-up is one screen — phone, name, password,
        an optional email, the terms — because a customer now arrives from a
        salon's QR code with somebody waiting. It sends no hair profile and no
        location at all, and `gender` as the empty string it always sent. Every
        other test here posts the full payload, so this is the one that proves
        the serializer's `required=False` defaults hold for a real request.
        """
        response = self.client.post('/api/auth/register/customer/', {
            'phone': '+8801712345678',
            'name': 'Ahmed Hassan',
            'email': '',
            'password': 'chairside2026',
            'accepted_terms': True,
            'gender': '',
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['verification_required'])

        profile = User.objects.get(phone='+8801712345678').customer_profile
        self.assertEqual(profile.gender, '')
        self.assertEqual(profile.hair_type, '')
        self.assertEqual(profile.hair_length, '')
        self.assertEqual(profile.area, '')
        self.assertIsNone(profile.latitude)
        self.assertIsNone(profile.longitude)

    def test_password_is_hashed_and_never_returned(self):
        self.register('customer', CUSTOMER_PAYLOAD)
        user = User.objects.get(phone='+8801712345678')

        self.assertNotEqual(user.password, CUSTOMER_PAYLOAD['password'])
        self.assertTrue(user.check_password(CUSTOMER_PAYLOAD['password']))

        response = self.register('barber', BARBER_PAYLOAD)
        self.assertNotIn('password', str(response.data))

    def test_barber_registration_keeps_one_role_for_every_audience(self):
        for audience in ('men', 'women', 'unisex'):
            with self.subTest(audience=audience):
                User.objects.all().delete()
                session = self.make_barber(audience=audience)
                # A women's hairstylist is a barber whose clients are women.
                self.assertRole(session, Role.BARBER)
                self.assertEqual(session['user']['profile']['barber']['audience'], audience)

    def test_barber_profile_stores_the_trade(self):
        session = self.make_barber()
        profile = BarberProfile.objects.get(user_id=session['user']['id'])
        self.assertEqual(profile.experience_years, 7)
        self.assertEqual(profile.service_ids, ['cut', 'fade'])
        self.assertEqual(profile.area, 'Mirpur')

    def test_salon_owner_registration_creates_the_salon(self):
        session = self.make_owner()
        self.assertRole(session, Role.SALON_OWNER)

        salon = Salon.objects.get(owner_id=session['user']['id'])
        self.assertEqual(salon.name, 'Glow Beauty Parlour')
        # A parlour is a salon whose customers are women, not another role.
        self.assertEqual(salon.business_type, 'salon')
        self.assertEqual(salon.audience, 'women')
        self.assertEqual(salon.address, 'Shop 4, Road 27, Dhanmondi')

    def test_duplicate_phone_is_refused(self):
        self.make_customer()
        response = self.register('customer', CUSTOMER_PAYLOAD)

        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'phone_taken')
        self.assertEqual(User.objects.filter(phone='+8801712345678').count(), 1)

    def test_a_never_verified_registration_can_be_retried(self):
        """An abandoned sign-up must not lock the number out for good."""
        self.register('customer', CUSTOMER_PAYLOAD)
        again = self.register('customer', CUSTOMER_PAYLOAD, name='Ahmed H')

        self.assertEqual(again.status_code, 201, again.data)
        self.assertEqual(User.objects.filter(phone='+8801712345678').count(), 1)
        self.assertEqual(User.objects.get(phone='+8801712345678').name, 'Ahmed H')

    def test_invalid_phone_is_refused(self):
        for phone in ('12345', '01212345678', 'not a phone'):
            with self.subTest(phone=phone):
                response = self.register('customer', CUSTOMER_PAYLOAD, phone=phone)
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(response.data['code'], 'invalid_phone')

    def test_weak_password_is_refused(self):
        for password in ('short', '12345678', 'password'):
            with self.subTest(password=password):
                response = self.register('customer', CUSTOMER_PAYLOAD, password=password)
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(response.data['code'], 'password_invalid')
                self.assertIn('password', response.data['errors'])

    def test_terms_must_be_accepted(self):
        response = self.register('customer', CUSTOMER_PAYLOAD, accepted_terms=False)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'terms_required')

    def test_phone_is_normalised_to_one_form(self):
        self.register('customer', CUSTOMER_PAYLOAD, phone='+8801712345678')
        self.assertTrue(User.objects.filter(phone='+8801712345678').exists())

        # The same number typed differently is the same account, so it clashes.
        clash = self.register('barber', BARBER_PAYLOAD, phone='8801712345678')
        self.assertIn(clash.status_code, (201, 409))
        self.assertEqual(User.objects.filter(phone='+8801712345678').count(), 1)

    def test_there_is_no_public_employee_or_admin_registration(self):
        for path in ('/api/auth/register/salon-employee/', '/api/auth/register/admin/'):
            with self.subTest(path=path):
                response = self.client.post(path, {}, format='json')
                self.assertEqual(response.status_code, 404)

    def test_role_cannot_be_chosen_through_the_payload(self):
        """Posting a role at the customer endpoint must not create an admin."""
        self.register('customer', CUSTOMER_PAYLOAD, role='admin', is_staff=True,
                      is_superuser=True)
        user = User.objects.get(phone='+8801712345678')
        self.assertEqual(user.role, Role.CUSTOMER)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
