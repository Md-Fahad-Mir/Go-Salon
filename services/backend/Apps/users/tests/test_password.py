"""Forgetting a password, resetting one, and changing one."""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from Apps.users.models import OTPCode, OTPPurpose, User

from .base import AuthTestCase


class ForgotPasswordTests(AuthTestCase):
    def forgot(self, phone: str = '01712345678'):
        return self.client.post('/api/auth/password/forgot/', {'phone': phone},
                                format='json')

    def verify(self, phone: str, code: str):
        return self.client.post('/api/auth/password/verify-otp/',
                                {'phone': phone, 'code': code}, format='json')

    def reset(self, token: str, password: str = 'brand-new-2026', **extra):
        return self.client.post('/api/auth/password/reset/',
                                {'reset_token': token, 'password': password, **extra},
                                format='json')

    def test_full_reset_flow(self):
        self.make_customer()

        self.assertEqual(self.forgot().status_code, 200)
        verified = self.verify('01712345678', self.last_code())
        self.assertEqual(verified.status_code, 200, verified.data)

        done = self.reset(verified.data['reset_token'])
        self.assertEqual(done.status_code, 200, done.data)

        self.assertEqual(self.sign_in('01712345678', 'brand-new-2026').status_code, 200)
        self.assertEqual(self.sign_in('01712345678', 'chairside2026').status_code, 401)

    def test_reset_uses_its_own_purpose(self):
        """A registration code must not open a password reset."""
        self.register('customer', {
            'phone': '01712345678', 'name': 'Ahmed Hassan', 'password': 'chairside2026',
            'accepted_terms': True,
        })
        registration_code = self.last_code()

        response = self.verify('01712345678', registration_code)
        self.assertEqual(response.status_code, 400, response.data)

    def test_unknown_phone_gets_the_same_answer(self):
        known = self.forgot('01999999999')
        self.assertEqual(known.status_code, 200)
        # Nothing was sent, and the response gives that away to nobody.
        self.assertEqual(len(__import__(
            'Apps.users.services.sms', fromlist=['LocMemSMSProvider']
        ).LocMemSMSProvider.outbox), 0)

    def test_wrong_code_is_refused(self):
        self.make_customer()
        self.forgot()
        code = self.last_code()
        wrong = '000000' if code != '000000' else '111111'

        response = self.verify('01712345678', wrong)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'otp_invalid')

    def test_expired_code_is_refused(self):
        self.make_customer()
        self.forgot()
        code = self.last_code()
        OTPCode.objects.filter(purpose=OTPPurpose.PASSWORD_RESET).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )

        response = self.verify('01712345678', code)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'otp_expired')

    def test_a_reset_code_cannot_be_spent_twice(self):
        self.make_customer()
        self.forgot()
        code = self.last_code()

        self.assertEqual(self.verify('01712345678', code).status_code, 200)
        self.assertEqual(self.verify('01712345678', code).status_code, 400)

    def test_reset_needs_a_token_from_a_verified_code(self):
        self.make_customer()
        response = self.reset('made-up-token')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'reset_token_invalid')
        self.assertEqual(self.sign_in('01712345678').status_code, 200)

    def test_new_password_must_pass_the_policy(self):
        self.make_customer()
        self.forgot()
        verified = self.verify('01712345678', self.last_code())

        response = self.reset(verified.data['reset_token'], password='123')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'password_invalid')

    def test_mismatched_confirmation_is_refused(self):
        self.make_customer()
        self.forgot()
        verified = self.verify('01712345678', self.last_code())

        response = self.reset(verified.data['reset_token'],
                              confirm_password='something-else')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'password_mismatch')

    def test_reset_revokes_existing_sessions(self):
        session = self.make_customer()
        self.forgot()
        verified = self.verify('01712345678', self.last_code())
        self.reset(verified.data['reset_token'])

        response = self.client.post('/api/auth/token/refresh/',
                                    {'refresh': session['refresh']}, format='json')
        self.assertEqual(response.status_code, 401, response.data)

    def test_reset_never_returns_the_password(self):
        self.make_customer()
        self.forgot()
        verified = self.verify('01712345678', self.last_code())
        done = self.reset(verified.data['reset_token'])
        self.assertNotIn('brand-new-2026', str(done.data))


class ChangePasswordTests(AuthTestCase):
    def change(self, **data):
        return self.client.post('/api/auth/password/change/', data, format='json')

    def test_signed_in_user_can_change_their_password(self):
        session = self.make_customer()
        self.as_user(session)

        response = self.change(current_password='chairside2026',
                               new_password='brand-new-2026',
                               confirm_password='brand-new-2026')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('access', response.data)

        self.client.credentials()
        self.assertEqual(self.sign_in('01712345678', 'brand-new-2026').status_code, 200)

    def test_current_password_must_be_right(self):
        session = self.make_customer()
        self.as_user(session)

        response = self.change(current_password='not-it', new_password='brand-new-2026')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'invalid_password')

    def test_new_password_must_pass_the_policy(self):
        session = self.make_customer()
        self.as_user(session)

        response = self.change(current_password='chairside2026', new_password='123')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'password_invalid')

    def test_change_revokes_other_sessions(self):
        session = self.make_customer()
        self.as_user(session)

        self.change(current_password='chairside2026', new_password='brand-new-2026')
        response = self.client.post('/api/auth/token/refresh/',
                                    {'refresh': session['refresh']}, format='json')
        self.assertEqual(response.status_code, 401)

    def test_signing_in_is_required(self):
        self.make_customer()
        response = self.change(current_password='chairside2026',
                               new_password='brand-new-2026')
        self.assertEqual(response.status_code, 401)
