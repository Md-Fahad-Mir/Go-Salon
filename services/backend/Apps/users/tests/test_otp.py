"""One-time codes: issuing, spending, resending and refusing."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone

from Apps.users.models import OTPCode, OTPPurpose, User
from Apps.users.services import otp as otp_service
from Apps.users.services.sms import LocMemSMSProvider

from .base import CUSTOMER_PAYLOAD, AuthTestCase


class OTPTests(AuthTestCase):
    def register_customer(self) -> User:
        response = self.register('customer', CUSTOMER_PAYLOAD)
        self.assertEqual(response.status_code, 201, response.data)
        return User.objects.get(phone=response.data['phone'])

    def verify(self, phone: str, code: str):
        return self.client.post(
            '/api/auth/otp/verify/',
            {'phone': phone, 'code': code, 'purpose': OTPPurpose.REGISTRATION},
            format='json',
        )

    def test_registration_sends_a_six_digit_code(self):
        user = self.register_customer()

        self.assertEqual(len(LocMemSMSProvider.outbox), 1)
        self.assertEqual(LocMemSMSProvider.outbox[0]['to'], user.phone)
        self.assertEqual(len(self.last_code()), 6)

    def test_code_is_stored_hashed_not_in_the_clear(self):
        user = self.register_customer()
        code = self.last_code()
        otp = OTPCode.objects.get(user=user, purpose=OTPPurpose.REGISTRATION)

        self.assertNotEqual(otp.code_hash, code)
        self.assertNotIn(code, otp.code_hash)
        self.assertTrue(otp.code_hash.startswith('pbkdf2_'))

    def test_codes_are_not_predictable(self):
        """Sequential codes must not come from a seeded generator."""
        codes = set()
        for index in range(8):
            user = User.objects.create_user(
                phone=f'0171234{index:04d}', password='chairside2026', name='Tester'
            )
            otp_service.issue_otp(user, OTPPurpose.REGISTRATION, enforce_rate=False)
            codes.add(self.last_code())
        self.assertGreater(len(codes), 5, 'codes look predictable')

    def test_verification_activates_the_account_and_returns_a_session(self):
        user = self.register_customer()
        response = self.verify(user.phone, self.last_code())

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        user.refresh_from_db()
        self.assertTrue(user.is_phone_verified)

    def test_wrong_code_is_refused(self):
        user = self.register_customer()
        wrong = '000000' if self.last_code() != '000000' else '111111'

        response = self.verify(user.phone, wrong)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'otp_invalid')
        user.refresh_from_db()
        self.assertFalse(user.is_phone_verified)

    def test_expired_code_is_refused(self):
        user = self.register_customer()
        code = self.last_code()
        OTPCode.objects.filter(user=user).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )

        response = self.verify(user.phone, code)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'otp_expired')

    def test_code_expires_after_fifteen_minutes(self):
        user = self.register_customer()
        otp = OTPCode.objects.get(user=user)
        life = (otp.expires_at - otp.created_at).total_seconds()
        self.assertAlmostEqual(life, 15 * 60, delta=5)

    def test_a_spent_code_cannot_be_used_twice(self):
        user = self.register_customer()
        code = self.last_code()

        self.assertEqual(self.verify(user.phone, code).status_code, 200)
        again = self.verify(user.phone, code)
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data['code'], 'otp_missing')

    def test_resend_invalidates_the_previous_code(self):
        user = self.register_customer()
        first = self.last_code()

        # Step past the cooldown rather than sleeping through it.
        OTPCode.objects.filter(user=user).update(
            created_at=timezone.now() - timedelta(minutes=5)
        )
        resend = self.client.post('/api/auth/otp/resend/', {'phone': user.phone},
                                  format='json')
        self.assertEqual(resend.status_code, 200, resend.data)
        second = self.last_code()
        self.assertNotEqual(first, second)

        stale = self.verify(user.phone, first)
        self.assertEqual(stale.status_code, 400)
        self.assertEqual(stale.data['code'], 'otp_invalid')
        self.assertEqual(self.verify(user.phone, second).status_code, 200)

    def test_resend_is_refused_during_the_cooldown(self):
        user = self.register_customer()

        response = self.client.post('/api/auth/otp/resend/', {'phone': user.phone},
                                    format='json')
        self.assertEqual(response.status_code, 429, response.data)
        self.assertEqual(response.data['code'], 'otp_cooldown')
        self.assertGreater(response.data['retry_after'], 0)
        # Nothing new was sent.
        self.assertEqual(len(LocMemSMSProvider.outbox), 1)

    @override_settings(OTP_MAX_SENDS_PER_HOUR=2)
    def test_too_many_sends_in_an_hour_is_refused(self):
        user = self.register_customer()
        for _ in range(4):
            OTPCode.objects.filter(user=user).update(
                created_at=timezone.now() - timedelta(minutes=5)
            )
            response = self.client.post('/api/auth/otp/resend/', {'phone': user.phone},
                                        format='json')
            if response.status_code == 429:
                break
        self.assertEqual(response.status_code, 429, response.data)
        self.assertEqual(response.data['code'], 'otp_send_limit')

    @override_settings(OTP_MAX_VERIFY_ATTEMPTS=3)
    def test_guessing_is_capped(self):
        user = self.register_customer()
        code = self.last_code()
        wrong = '000000' if code != '000000' else '111111'

        for _ in range(3):
            self.verify(user.phone, wrong)

        blocked = self.verify(user.phone, code)
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.data['code'], 'otp_attempts')

    def test_request_for_an_unknown_number_says_so(self):
        response = self.client.post('/api/auth/otp/request/', {'phone': '01999999999'},
                                    format='json')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['code'], 'account_not_found')

    def test_request_for_a_verified_account_is_refused(self):
        session = self.make_customer()
        response = self.client.post(
            '/api/auth/otp/request/', {'phone': session['user']['phone']}, format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'already_verified')

    def test_failed_delivery_does_not_leave_a_live_code(self):
        from Apps.users.services.sms import SMSDeliveryError

        user = User.objects.create_user(phone='01722222222', password='chairside2026',
                                        name='Tester')
        with patch.object(LocMemSMSProvider, 'send', side_effect=SMSDeliveryError('down')):
            with self.assertRaises(Exception):
                otp_service.issue_otp(user, OTPPurpose.REGISTRATION, enforce_rate=False)

        self.assertFalse(OTPCode.objects.live(user, OTPPurpose.REGISTRATION).exists())

    def test_the_code_is_never_in_the_api_response(self):
        response = self.register('customer', CUSTOMER_PAYLOAD)
        code = self.last_code()
        self.assertNotIn(code, str(response.data))
