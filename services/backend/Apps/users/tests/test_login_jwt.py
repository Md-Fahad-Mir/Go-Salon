"""Signing in, staying signed in, and signing out for good."""

from __future__ import annotations

from unittest.mock import patch

from rest_framework.throttling import SimpleRateThrottle

from Apps.users.models import Role, User

from .base import CUSTOMER_PAYLOAD, AuthTestCase


class LoginTests(AuthTestCase):
    def test_login_with_phone_and_password(self):
        self.make_customer()
        response = self.sign_in('01712345678')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['role'], Role.CUSTOMER)
        self.assertEqual(response.data['user']['phone'], '+8801712345678')
        self.assertNotIn('password', str(response.data))

    def test_login_does_not_ask_for_a_code(self):
        self.make_customer()
        self.assertEqual(len(self.client.post(
            '/api/auth/login/', {'phone': '01712345678', 'password': 'chairside2026'},
            format='json').data.keys()), 3)

    def test_login_accepts_any_form_of_the_number(self):
        self.make_customer()
        for phone in ('01712345678', '+8801712345678', '8801712345678'):
            with self.subTest(phone=phone):
                self.assertEqual(self.sign_in(phone).status_code, 200)

    def test_wrong_password_is_refused(self):
        self.make_customer()
        response = self.sign_in('01712345678', 'wrong-password')

        self.assertEqual(response.status_code, 401, response.data)
        self.assertEqual(response.data['code'], 'invalid_credentials')

    def test_unknown_phone_is_refused_the_same_way(self):
        response = self.sign_in('01999999999')

        self.assertEqual(response.status_code, 401)
        # The same answer as a wrong password: this must not tell a stranger
        # which numbers have accounts.
        self.assertEqual(response.data['code'], 'invalid_credentials')

    def test_unverified_phone_cannot_sign_in(self):
        self.register('customer', CUSTOMER_PAYLOAD)
        response = self.sign_in('01712345678')

        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(response.data['code'], 'phone_not_verified')

    def test_disabled_account_cannot_sign_in(self):
        self.make_customer()
        User.objects.filter(phone='+8801712345678').update(is_active=False)

        response = self.sign_in('01712345678')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['code'], 'account_disabled')

    def test_every_role_signs_in_through_the_same_endpoint_and_shape(self):
        sessions = [self.make_customer(), self.make_barber(), self.make_owner()]
        for session in sessions:
            with self.subTest(role=session['user']['role']):
                response = self.sign_in(session['user']['phone'])
                self.assertEqual(response.status_code, 200)
                self.assertEqual(set(response.data), {'access', 'refresh', 'user'})

    def test_repeated_password_guesses_are_throttled(self):
        """Guessing a password has to cost something."""
        self.make_customer()
        # DRF reads its rate table onto the throttle class at import, so this
        # patches the table rather than the setting.
        rates = {**SimpleRateThrottle.THROTTLE_RATES, 'login': '3/min'}
        with patch.object(SimpleRateThrottle, 'THROTTLE_RATES', rates):
            statuses = [self.sign_in('01712345678', 'wrong-password').status_code
                        for _ in range(5)]

        self.assertEqual(statuses[:3], [401, 401, 401])
        self.assertIn(429, statuses)


class JWTTests(AuthTestCase):
    def test_tokens_are_signed_with_a_real_key(self):
        """A blank JWT_SIGNING_KEY in a .env file must not reach the encoder:
        an empty HMAC key is a 500 on every sign-in."""
        from django.conf import settings

        self.assertTrue(settings.SIMPLE_JWT['SIGNING_KEY'])

    def test_access_token_reaches_a_protected_endpoint(self):
        session = self.make_customer()
        self.as_user(session)

        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['phone'], '+8801712345678')

    def test_no_token_is_refused(self):
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, 401)

    def test_garbage_token_is_refused(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-token')
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)

    def test_refresh_returns_a_new_access_token(self):
        session = self.make_customer()
        response = self.client.post('/api/auth/token/refresh/',
                                    {'refresh': session['refresh']}, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('access', response.data)
        self.as_user({'access': response.data['access']})
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)

    def test_a_rotated_refresh_token_cannot_be_used_again(self):
        session = self.make_customer()
        first = self.client.post('/api/auth/token/refresh/',
                                 {'refresh': session['refresh']}, format='json')
        self.assertEqual(first.status_code, 200)

        replay = self.client.post('/api/auth/token/refresh/',
                                  {'refresh': session['refresh']}, format='json')
        self.assertEqual(replay.status_code, 401, replay.data)

    def test_invalid_refresh_token_is_refused(self):
        response = self.client.post('/api/auth/token/refresh/',
                                    {'refresh': 'nonsense'}, format='json')
        self.assertEqual(response.status_code, 401)

    def test_logout_blacklists_the_refresh_token(self):
        session = self.make_customer()
        self.as_user(session)

        logout = self.client.post('/api/auth/logout/', {'refresh': session['refresh']},
                                  format='json')
        self.assertEqual(logout.status_code, 205, getattr(logout, 'data', None))

        # The whole point: the old refresh token buys nothing afterwards.
        refresh = self.client.post('/api/auth/token/refresh/',
                                   {'refresh': session['refresh']}, format='json')
        self.assertEqual(refresh.status_code, 401, refresh.data)

    def test_logout_needs_a_session(self):
        session = self.make_customer()
        response = self.client.post('/api/auth/logout/', {'refresh': session['refresh']},
                                    format='json')
        self.assertEqual(response.status_code, 401)

    def test_token_carries_role_but_not_secrets(self):
        import jwt
        from django.conf import settings

        session = self.make_barber()
        payload = jwt.decode(session['access'], settings.SIMPLE_JWT['SIGNING_KEY'],
                             algorithms=['HS256'])

        self.assertEqual(payload['role'], Role.BARBER)
        for leaked in ('password', 'code', 'email', 'phone'):
            self.assertNotIn(leaked, payload)
