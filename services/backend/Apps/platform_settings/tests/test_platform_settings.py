"""The .env settings an administrator may override from the dashboard: what
the endpoint shows and accepts, and that a saved change is what the running
server then uses — no restart in between."""

from __future__ import annotations

from datetime import timedelta

import jwt
from django.conf import settings
from django.test import override_settings
from django.utils import timezone

from Apps.platform_settings import runtime
from Apps.platform_settings.models import PlatformSettings
from Apps.tenants.models import Tenant
from Apps.tenants.views import join_url
from Apps.users.models import OTPCode, OTPPurpose
from Apps.users.services.sms import HTTPSMSProvider, LocMemSMSProvider, get_sms_provider
from Apps.users.tests.base import CUSTOMER_PAYLOAD, AuthTestCase

SETTINGS = '/api/admin/settings/platform/'


class PlatformSettingsTestCase(AuthTestCase):
    def setUp(self):
        super().setUp()
        # Overrides are cached; a test's must not outlive its rolled-back row.
        self.addCleanup(runtime.forget)

    def sign_in_admin(self) -> None:
        self.as_user(self.admin_session())

    def patch(self, **values):
        return self.client.patch(SETTINGS, values, format='json')

    def override(self, **values) -> None:
        """Change settings as an admin would, then sign out again."""
        if not hasattr(self, '_admin'):
            self._admin = self.admin_session(phone='01700000099')
        self.as_user(self._admin)
        response = self.patch(**values)
        self.assertEqual(response.status_code, 200, response.data)
        self.client.credentials()


class AccessTests(PlatformSettingsTestCase):
    def test_an_anonymous_caller_is_refused(self):
        self.assertEqual(self.client.get(SETTINGS).status_code, 401)

    def test_a_customer_is_refused(self):
        self.as_user(self.make_customer())
        self.assertEqual(self.client.get(SETTINGS).status_code, 403)
        self.assertEqual(self.patch(otp_expiration_minutes=5).status_code, 403)
        self.assertFalse(PlatformSettings.objects.exclude(otp_expiration_minutes=None).exists())


class ReadTests(PlatformSettingsTestCase):
    def setUp(self):
        super().setUp()
        self.sign_in_admin()

    def test_untouched_settings_are_the_environments(self):
        data = self.client.get(SETTINGS).data['settings']

        self.assertEqual(set(data), set(runtime.FIELDS))
        self.assertEqual(data['otp_expiration_minutes'], {
            'value': settings.OTP_EXPIRATION_MINUTES,
            'default': settings.OTP_EXPIRATION_MINUTES,
            'overridden': False,
        })
        self.assertEqual(data['throttle_login']['value'], settings.THROTTLE_LOGIN)
        self.assertEqual(data['join_url_base']['value'], settings.JOIN_URL_BASE)

    @override_settings(SMS_API_KEY='sk-live-123456', SMS_API_SECRET='shh-secret-789',
                       JWT_SIGNING_KEY='jwt-signing-key-000')
    def test_secrets_are_never_sent_only_whether_they_are_set(self):
        response = self.client.get(SETTINGS)
        body = response.content.decode()

        for secret in ('sk-live-123456', 'shh-secret-789', 'jwt-signing-key-000', settings.SECRET_KEY):
            self.assertNotIn(secret, body)
        for name in ('sms_api_key', 'sms_api_secret', 'jwt_signing_key', 'django_secret_key', 'otp_length'):
            self.assertNotIn(name, response.data['settings'])
        self.assertEqual(response.data['sms']['api_key_configured'], True)
        self.assertEqual(response.data['sms']['api_secret_configured'], True)


class WriteTests(PlatformSettingsTestCase):
    def setUp(self):
        super().setUp()
        self.sign_in_admin()

    def test_a_change_is_saved_and_shown_as_an_override(self):
        response = self.patch(otp_expiration_minutes=5, jwt_refresh_token_lifetime_days=7)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['settings']['otp_expiration_minutes'], {
            'value': 5, 'default': settings.OTP_EXPIRATION_MINUTES, 'overridden': True,
        })
        row = PlatformSettings.load()
        self.assertEqual((row.otp_expiration_minutes, row.jwt_refresh_token_lifetime_days), (5, 7))
        self.assertIsNotNone(row.updated_by)

    def test_null_hands_a_setting_back_to_the_environment(self):
        self.patch(otp_expiration_minutes=5, otp_max_verify_attempts=3)

        response = self.patch(otp_expiration_minutes=None)

        entry = response.data['settings']['otp_expiration_minutes']
        self.assertEqual((entry['value'], entry['overridden']), (settings.OTP_EXPIRATION_MINUTES, False))
        # The other one is left as it was.
        self.assertEqual(response.data['settings']['otp_max_verify_attempts']['value'], 3)

    def test_out_of_range_values_are_refused(self):
        for field, value in (
            ('otp_expiration_minutes', 0),
            ('otp_max_verify_attempts', 11),
            ('password_min_length', 6),
            ('jwt_access_token_lifetime_minutes', 1441),
            ('sms_timeout_seconds', 'soon'),
        ):
            with self.subTest(field=field):
                response = self.patch(**{field: value})
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data['errors'])
        self.assertEqual(PlatformSettings.load().overrides(), {})

    def test_a_name_that_is_not_a_setting_is_refused(self):
        for name in ('sms_api_key', 'django_secret_key', 'otp_length', 'debug'):
            with self.subTest(name=name):
                response = self.patch(**{name: 'x', 'otp_expiration_minutes': 5})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data['code'], 'unknown_setting')
        self.assertEqual(PlatformSettings.load().overrides(), {})

    def test_rates_are_read_loosely_and_written_back_plainly(self):
        response = self.patch(throttle_login='30 / Minute', throttle_register='5/h')

        self.assertEqual(response.data['settings']['throttle_login']['value'], '30/min')
        self.assertEqual(response.data['settings']['throttle_register']['value'], '5/hour')

    def test_a_rate_that_is_not_one_is_refused(self):
        for rate in ('60', 'sixty/min', '60/fortnight', '-5/min'):
            with self.subTest(rate=rate):
                response = self.patch(throttle_anon=rate)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data['code'], 'invalid_rate')

    def test_a_rate_that_could_lock_everyone_out_is_refused(self):
        """The dashboard is a signed-in client too: 1/day would lock its own admin out."""
        for field, rate in (('throttle_user', '1/day'), ('throttle_anon', '5/min'), ('throttle_login', '1/hour')):
            with self.subTest(field=field):
                response = self.patch(**{field: rate})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data['code'], 'rate_too_low')

    def test_the_join_url_is_kept_bare(self):
        response = self.patch(join_url_base='https://qa.gosalon.com/')
        self.assertEqual(response.data['settings']['join_url_base']['value'], 'https://qa.gosalon.com')

        for base in ('https://qa.gosalon.com/?ref=qr', 'ftp://qa.gosalon.com', 'qa.gosalon.com'):
            with self.subTest(base=base):
                self.assertEqual(self.patch(join_url_base=base).status_code, 400)

    @override_settings(DEBUG=False)
    def test_the_console_provider_is_refused_without_debug(self):
        response = self.patch(sms_provider='console')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'sms_console_in_production')

    @override_settings(SMS_API_KEY='', SMS_BASE_URL='', SMS_SENDER_ID='')
    def test_the_http_gateway_needs_a_key_url_and_sender(self):
        response = self.patch(sms_provider='http')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data['errors']), {'sms_provider', 'sms_base_url', 'sms_sender_id'})
        self.assertIn('SMS_API_KEY', response.data['errors']['sms_provider'][0])

    def test_locmem_is_not_on_offer(self):
        self.assertEqual(self.patch(sms_provider='locmem').status_code, 400)


class AppliedTests(PlatformSettingsTestCase):
    """A saved change is what the running server uses."""

    def register_customer(self, **overrides):
        return self.client.post('/api/auth/register/customer/', {**CUSTOMER_PAYLOAD, **overrides},
                                format='json')

    def test_otp_expiry_and_resend_cooldown(self):
        self.override(otp_expiration_minutes=5, otp_resend_cooldown_seconds=120)

        response = self.register_customer()

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['expires_in_minutes'], 5)
        self.assertEqual(response.data['resend_in'], 120)
        self.assertIn('expires in 5 minutes', LocMemSMSProvider.outbox[-1]['message'])
        otp = OTPCode.objects.get()
        self.assertAlmostEqual((otp.expires_at - otp.created_at).total_seconds(), 300, delta=2)

    def test_otp_guess_limit(self):
        self.override(otp_max_verify_attempts=1)
        phone = self.register_customer().data['phone']
        code = self.last_code()

        def verify(guess):
            return self.client.post('/api/auth/otp/verify/',
                                    {'phone': phone, 'code': guess, 'purpose': OTPPurpose.REGISTRATION},
                                    format='json')

        self.assertEqual(verify('000000' if code != '000000' else '111111').data['code'], 'otp_invalid')
        self.assertEqual(verify(code).data['code'], 'otp_attempts')

    def test_otp_sends_per_hour(self):
        self.override(otp_max_sends_per_hour=1)
        phone = self.register_customer().data['phone']
        OTPCode.objects.update(created_at=timezone.now() - timedelta(minutes=5))

        response = self.client.post('/api/auth/otp/resend/', {'phone': phone}, format='json')

        self.assertEqual(response.status_code, 429, response.data)
        self.assertEqual(response.data['code'], 'otp_send_limit')

    def test_password_minimum_length(self):
        self.override(password_min_length=14)

        refused = self.register_customer(password='chairside2026')
        self.assertEqual(refused.status_code, 400)
        self.assertIn('password', refused.data['errors'])
        self.assertIn('14 characters', refused.data['detail'])

        self.assertEqual(self.register_customer(password='chairside-2026!').status_code, 201)

    def test_password_reset_window(self):
        self.make_customer()
        self.override(password_reset_token_max_age_seconds=120)
        self.client.post('/api/auth/password/forgot/', {'phone': CUSTOMER_PAYLOAD['phone']}, format='json')

        response = self.client.post('/api/auth/password/verify-otp/',
                                    {'phone': CUSTOMER_PAYLOAD['phone'], 'code': self.last_code()},
                                    format='json')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['expires_in_seconds'], 120)

    def test_jwt_lifetimes_apply_to_sign_in_and_refresh(self):
        self.make_customer()
        self.override(jwt_access_token_lifetime_minutes=5, jwt_refresh_token_lifetime_days=2)

        def lifetime(token: str) -> int:
            payload = jwt.decode(token, settings.SIMPLE_JWT['SIGNING_KEY'], algorithms=['HS256'])
            return payload['exp'] - payload['iat']

        # An access token's expiry counts from its refresh token's clock, its
        # `iat` from its own — a second apart when they straddle one.
        session = self.sign_in(CUSTOMER_PAYLOAD['phone']).data
        self.assertAlmostEqual(lifetime(session['access']), 5 * 60, delta=1)
        self.assertEqual(lifetime(session['refresh']), 2 * 86400)

        rotated = self.client.post('/api/auth/token/refresh/', {'refresh': session['refresh']}, format='json')
        self.assertEqual(rotated.status_code, 200, rotated.data)
        self.assertAlmostEqual(lifetime(rotated.data['access']), 5 * 60, delta=1)
        self.assertEqual(lifetime(rotated.data['refresh']), 2 * 86400)

    def test_rate_limits(self):
        self.override(throttle_otp='3/hour')

        statuses = [
            self.client.post('/api/auth/otp/request/', {'phone': '01999999999'}, format='json').status_code
            for _ in range(4)
        ]

        self.assertEqual(statuses, [404, 404, 404, 429])

    def test_join_url_base(self):
        self.override(join_url_base='https://qa.gosalon.com/')

        self.assertEqual(join_url(Tenant(join_token='abc123')), 'https://qa.gosalon.com/join/abc123')

    @override_settings(SMS_API_KEY='sk-test')
    def test_sms_gateway(self):
        self.override(sms_provider='http', sms_base_url='https://sms.example.com/send',
                      sms_sender_id='GoSalon', sms_timeout_seconds=4)

        provider = get_sms_provider()
        self.assertIsInstance(provider, HTTPSMSProvider)
        self.assertEqual((provider.base_url, provider.sender_id, provider.timeout),
                         ('https://sms.example.com/send', 'GoSalon', 4))

        # Reset, and the environment's provider is back for the next message.
        self.override(sms_provider=None)
        self.assertIsInstance(get_sms_provider(), LocMemSMSProvider)
