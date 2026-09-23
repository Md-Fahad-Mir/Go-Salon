"""Shared scaffolding for the authentication tests."""

from __future__ import annotations

import re

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from Apps.users.models import OTPPurpose, Role, User
from Apps.users.services.sms import LocMemSMSProvider

CODE_RE = re.compile(r'\b(\d{6})\b')

CUSTOMER_PAYLOAD = {
    'phone': '01712345678',
    'name': 'Ahmed Hassan',
    'email': 'ahmed@example.com',
    'password': 'chairside2026',
    'accepted_terms': True,
    'gender': 'male',
    'hair_type': 'wavy',
    'hair_length': 'medium',
    'location': {'area': 'Dhanmondi', 'city': 'Dhaka', 'address': 'Road 27',
                 'latitude': 23.74, 'longitude': 90.37},
}

BARBER_PAYLOAD = {
    'phone': '01811111111',
    'name': 'Rafiqul Karim',
    'email': 'rafiq@example.com',
    'password': 'chairside2026',
    'accepted_terms': True,
    'audience': 'men',
    'business_name': "Rafiq's Chair",
    'experience_years': 7,
    'service_ids': ['cut', 'fade'],
    'location': {'area': 'Mirpur', 'city': 'Dhaka'},
}

OWNER_PAYLOAD = {
    'phone': '01912345678',
    'name': 'Shirin Akter',
    'email': 'shirin@example.com',
    'password': 'chairside2026',
    'accepted_terms': True,
    'business_name': 'Glow Beauty Parlour',
    'business_type': 'salon',
    'audience': 'women',
    'address': 'Shop 4, Road 27, Dhanmondi',
    'location': {'area': 'Dhanmondi', 'city': 'Dhaka'},
}


# Codes go to an in-memory outbox the tests read, the way a phone would.
#
# Throttle counters live in the cache and are cleared between tests, so the
# real rates from settings stay in force without one test's requests counting
# against the next. (DRF binds throttle classes and rates at import time, so
# override_settings cannot reach them anyway — the throttling test patches the
# rate table itself.)
@override_settings(SMS_PROVIDER='locmem')
class AuthTestCase(APITestCase):
    def setUp(self):
        super().setUp()
        LocMemSMSProvider.outbox.clear()
        cache.clear()

    # --- helpers ----------------------------------------------------------

    def last_code(self) -> str:
        """The code as a phone would read it, out of the sent message."""
        self.assertTrue(LocMemSMSProvider.outbox, 'no SMS was sent')
        match = CODE_RE.search(LocMemSMSProvider.outbox[-1]['message'])
        self.assertIsNotNone(match, 'no code in the message')
        return match.group(1)

    def register(self, url_name: str, payload: dict, **overrides):
        data = {**payload, **overrides}
        return self.client.post(f'/api/auth/register/{url_name}/', data, format='json')

    def register_and_verify(self, url_name: str, payload: dict, **overrides) -> dict:
        """Sign up and pass the code — the state every other flow starts from."""
        response = self.register(url_name, payload, **overrides)
        self.assertEqual(response.status_code, 201, response.data)
        verify = self.client.post(
            '/api/auth/otp/verify/',
            {'phone': response.data['phone'], 'code': self.last_code(),
             'purpose': OTPPurpose.REGISTRATION},
            format='json',
        )
        self.assertEqual(verify.status_code, 200, verify.data)
        return verify.data

    def make_customer(self, **overrides) -> dict:
        return self.register_and_verify('customer', CUSTOMER_PAYLOAD, **overrides)

    def make_barber(self, **overrides) -> dict:
        return self.register_and_verify('barber', BARBER_PAYLOAD, **overrides)

    def make_owner(self, **overrides) -> dict:
        return self.register_and_verify('salon-owner', OWNER_PAYLOAD, **overrides)

    def make_admin(self, phone: str = '01700000000') -> User:
        return User.objects.create_superuser(phone=phone, password='chairside2026',
                                             name='Platform Admin')

    def as_user(self, session: dict, tenant=None) -> None:
        """Sign in, optionally naming which tenant the requests are about.

        `tenant` is only needed when the account belongs to more than one
        and the fallback in `tenant_of_request` therefore cannot choose.
        """
        headers = {'HTTP_AUTHORIZATION': f'Bearer {session["access"]}'}
        if tenant is not None:
            headers['HTTP_X_TENANT_ID'] = str(tenant.pk)
        self.client.credentials(**headers)

    def sign_in(self, phone: str, password: str = 'chairside2026'):
        return self.client.post('/api/auth/login/', {'phone': phone, 'password': password},
                                format='json')

    def user_for(self, session: dict) -> User:
        return User.objects.get(pk=session['user']['id'])

    def assertRole(self, session: dict, role: str) -> None:
        self.assertEqual(session['user']['role'], role)

