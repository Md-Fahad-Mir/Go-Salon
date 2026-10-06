"""Phone numbers from any country, through every door an account has.

The Bangladeshi numbers the other suites use still behave exactly as they did;
these prove the same doors open for a number from anywhere else, and that a
number is one account however it is written.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase, override_settings

from Apps.users.models import OTPPurpose, Role, User
from Apps.users.phone import is_valid_phone, normalize_phone
from Apps.users.services.sms import LocMemSMSProvider

from .base import BARBER_PAYLOAD, CUSTOMER_PAYLOAD, OWNER_PAYLOAD, AuthTestCase

UK = '+447400123456'
US = '+12133734253'
INDIA = '+919876543210'
UAE = '+971501234567'


class NormalisingTests(SimpleTestCase):
    def test_every_way_of_writing_a_number_is_one_number(self):
        cases = {
            '+44 7400 123456': UK,
            '+44 (0) 7400-123-456': UK,
            '0044 7400 123456': UK,
            '+1 (213) 373-4253': US,
            '0091 98765 43210': INDIA,
            '+971 50 123 4567': UAE,
            # Bangladesh, as before.
            '+8801712345678': '+8801712345678',
            '01712345678': '+8801712345678',
            '8801712345678': '+8801712345678',
        }
        for written, e164 in cases.items():
            with self.subTest(written=written):
                self.assertEqual(normalize_phone(written), e164)

    def test_only_numbers_that_can_take_a_text_are_accepted(self):
        for number in (
            '+442079460000',      # a London landline
            '+8801212345678',     # not a Bangladeshi operator prefix
            '+44740012',          # too short
            '+4474001234567890',  # too long
            '+12133734253 ext 9',
            '+999123456789',      # no such country code
            'not a phone',
            '',
        ):
            with self.subTest(number=number):
                self.assertFalse(is_valid_phone(number))
                with self.assertRaises(ValidationError):
                    normalize_phone(number)

    @override_settings(PHONE_DEFAULT_REGION='GB')
    def test_a_number_without_its_code_is_read_in_the_default_region(self):
        self.assertEqual(normalize_phone('07400 123456'), UK)
        # A number with its code is that country's, whatever the default.
        self.assertEqual(normalize_phone('+8801712345678'), '+8801712345678')

    @override_settings(PHONE_DEFAULT_REGION='')
    def test_without_a_default_region_every_number_needs_its_code(self):
        self.assertFalse(is_valid_phone('01712345678'))
        self.assertEqual(normalize_phone(UK), UK)


class InternationalSignUpTests(AuthTestCase):
    def test_a_customer_signs_up_verifies_and_signs_in_with_a_foreign_number(self):
        response = self.register('customer', CUSTOMER_PAYLOAD, phone='+44 7400 123456')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['phone'], UK)
        # The code goes to the number in the form a gateway dials.
        self.assertEqual(LocMemSMSProvider.outbox[-1]['to'], UK)

        verify = self.client.post('/api/auth/otp/verify/', {
            'phone': UK, 'code': self.last_code(), 'purpose': OTPPurpose.REGISTRATION,
        }, format='json')
        self.assertEqual(verify.status_code, 200, verify.data)
        self.assertEqual(verify.data['user']['phone'], UK)

        # Written another way, it is still the same account.
        login = self.sign_in('0044 7400 123456')
        self.assertEqual(login.status_code, 200, login.data)
        self.assertEqual(login.data['user']['phone'], UK)

    def test_a_barber_signs_up_with_a_foreign_number(self):
        session = self.make_barber(phone='0091 98765 43210')
        self.assertRole(session, Role.BARBER)
        self.assertEqual(self.user_for(session).phone, INDIA)

    def test_a_salon_signs_up_with_a_foreign_owner_and_business_number(self):
        session = self.make_owner(phone='+1 (213) 373-4253', business_phone='+971 50 123 4567')
        owner = self.user_for(session)
        self.assertEqual(owner.phone, US)
        self.assertEqual(owner.salons.get().business_phone, UAE)

    def test_a_foreign_landline_is_refused(self):
        response = self.register('customer', CUSTOMER_PAYLOAD, phone='+442079460000')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'invalid_phone')

    def test_the_same_foreign_number_cannot_hold_two_accounts(self):
        self.make_customer(phone=UK)
        clash = self.register('barber', BARBER_PAYLOAD, phone='+44 (0)7400 123456')
        self.assertEqual(clash.status_code, 409, clash.data)
        self.assertEqual(clash.data['code'], 'phone_taken')
        self.assertEqual(User.objects.filter(phone=UK).count(), 1)

    def test_a_code_can_be_asked_for_again(self):
        self.register('customer', CUSTOMER_PAYLOAD, phone=UK)
        LocMemSMSProvider.outbox.clear()
        with self.settings(OTP_RESEND_COOLDOWN_SECONDS=0):
            response = self.client.post('/api/auth/otp/resend/', {'phone': '+44 7400 123456'},
                                        format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(LocMemSMSProvider.outbox[-1]['to'], UK)


class InternationalPasswordResetTests(AuthTestCase):
    def test_a_foreign_number_resets_its_password(self):
        self.make_customer(phone=US)
        LocMemSMSProvider.outbox.clear()

        forgot = self.client.post('/api/auth/password/forgot/', {'phone': '+1 213-373-4253'},
                                  format='json')
        self.assertEqual(forgot.status_code, 200, forgot.data)
        self.assertEqual(LocMemSMSProvider.outbox[-1]['to'], US)

        verified = self.client.post('/api/auth/password/verify-otp/',
                                    {'phone': US, 'code': self.last_code()}, format='json')
        self.assertEqual(verified.status_code, 200, verified.data)

        reset = self.client.post('/api/auth/password/reset/', {
            'reset_token': verified.data['reset_token'], 'password': 'a-new-chair-2026',
        }, format='json')
        self.assertEqual(reset.status_code, 200, reset.data)
        self.assertEqual(self.sign_in(US, 'a-new-chair-2026').status_code, 200)


class InternationalStaffAndAdminTests(AuthTestCase):
    def test_an_owner_hires_someone_with_a_foreign_number(self):
        self.as_user(self.make_owner())
        response = self.client.post('/api/salon/employees/', {
            'phone': '+971 50 123 4567', 'name': 'Layla Haddad', 'password': 'chairside2026',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(User.objects.get(phone=UAE).role, Role.SALON_EMPLOYEE)

    def test_an_admin_with_a_foreign_number_signs_in(self):
        self.make_admin(UK)
        response = self.client.post('/api/auth/admin/login/',
                                    {'phone': '+44 7400 123456', 'password': 'chairside2026'},
                                    format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_an_admin_opens_a_salon_for_a_foreign_owner(self):
        self.as_user(self.admin_session())
        response = self.client.post('/api/admin/salons/', {
            'business_name': 'Gulf Cuts', 'business_type': 'barber',
            'owner_name': 'Omar Saeed', 'owner_phone': '+971 50 123 4567',
            'address': 'Shop 3, Al Wasl Road',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['owner']['phone'], UAE)

    def test_an_admin_moves_an_account_to_a_foreign_number(self):
        customer = self.make_customer()
        self.as_user(self.admin_session())
        response = self.client.patch(f'/api/admin/users/{customer["user"]["id"]}/',
                                     {'phone': '+44 7400 123456'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(User.objects.get(pk=customer['user']['id']).phone, UK)
