"""Signing into the admin dashboard — staff and superuser accounts only."""

from __future__ import annotations

from .base import AuthTestCase


class AdminLoginTests(AuthTestCase):
    def admin_sign_in(self, phone: str, password: str = 'chairside2026'):
        return self.client.post(
            '/api/auth/admin/login/', {'phone': phone, 'password': password}, format='json'
        )

    def test_superuser_can_sign_in(self):
        self.make_admin('01700000000')
        response = self.admin_sign_in('01700000000')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['role'], 'admin')

    def test_staff_without_superuser_can_sign_in(self):
        from Apps.users.models import User

        staffer = User.objects.create_user(
            phone='01700000001', password='chairside2026', name='Staff Member'
        )
        staffer.is_staff = True
        staffer.is_phone_verified = True
        staffer.is_active = True
        staffer.save()

        response = self.admin_sign_in('01700000001')
        self.assertEqual(response.status_code, 200, response.data)

    def test_ordinary_customer_is_rejected(self):
        self.make_customer()
        response = self.admin_sign_in('01712345678')

        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(response.data['code'], 'not_admin')

    def test_wrong_password_is_refused_before_the_role_check(self):
        self.make_admin('01700000000')
        response = self.admin_sign_in('01700000000', 'wrong-password')

        self.assertEqual(response.status_code, 401, response.data)
        self.assertEqual(response.data['code'], 'invalid_credentials')

    def test_regular_login_endpoint_still_accepts_everyone(self):
        """The admin-only gate must not leak onto the shared endpoint."""
        self.make_customer()
        response = self.sign_in('01712345678')
        self.assertEqual(response.status_code, 200, response.data)
