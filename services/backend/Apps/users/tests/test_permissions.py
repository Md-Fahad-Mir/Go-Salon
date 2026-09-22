"""Role permissions. The server is the boundary, not the frontend."""

from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.test import APIRequestFactory

from Apps.users.models import Role, User
from Apps.users.permissions import (
    IsAdmin,
    IsBarberOrHairstylist,
    IsCustomer,
    IsPhoneVerified,
    IsProvider,
    IsSalonOrParlorEmployee,
    IsSalonOrParlorOwner,
)

from .base import AuthTestCase


class PermissionMatrixTests(AuthTestCase):
    """Every class, against every role, in one table."""

    def setUp(self):
        super().setUp()
        self.factory = APIRequestFactory()
        self.users = {
            Role.CUSTOMER: User.objects.create_user(
                phone='01711111111', password='chairside2026', name='Customer',
                role=Role.CUSTOMER, is_phone_verified=True),
            Role.BARBER: User.objects.create_user(
                phone='01711111112', password='chairside2026', name='Barber',
                role=Role.BARBER, is_phone_verified=True),
            Role.SALON_OWNER: User.objects.create_user(
                phone='01711111113', password='chairside2026', name='Owner',
                role=Role.SALON_OWNER, is_phone_verified=True),
            Role.SALON_EMPLOYEE: User.objects.create_user(
                phone='01711111114', password='chairside2026', name='Employee',
                role=Role.SALON_EMPLOYEE, is_phone_verified=True),
            Role.ADMIN: User.objects.create_superuser(
                phone='01711111115', password='chairside2026', name='Admin'),
        }

    def allows(self, permission: BasePermission, user) -> bool:
        request = self.factory.get('/')
        request.user = user
        return bool(permission().has_permission(request, None))

    def test_each_permission_admits_only_its_own_role(self):
        expected = {
            IsCustomer: {Role.CUSTOMER},
            IsBarberOrHairstylist: {Role.BARBER},
            IsSalonOrParlorOwner: {Role.SALON_OWNER},
            IsSalonOrParlorEmployee: {Role.SALON_EMPLOYEE},
            IsAdmin: {Role.ADMIN},
            IsProvider: {Role.BARBER, Role.SALON_OWNER, Role.SALON_EMPLOYEE},
        }
        for permission, allowed in expected.items():
            for role, user in self.users.items():
                with self.subTest(permission=permission.__name__, role=role):
                    self.assertEqual(self.allows(permission, user), role in allowed)

    def test_anonymous_is_admitted_by_none_of_them(self):
        from django.contrib.auth.models import AnonymousUser

        for permission in (IsCustomer, IsBarberOrHairstylist, IsSalonOrParlorOwner,
                           IsSalonOrParlorEmployee, IsAdmin, IsProvider, IsPhoneVerified):
            with self.subTest(permission=permission.__name__):
                self.assertFalse(self.allows(permission, AnonymousUser()))

    def test_unverified_phone_fails_the_verification_permission(self):
        user = User.objects.create_user(phone='01711111116', password='chairside2026',
                                        name='Unverified', role=Role.CUSTOMER)
        self.assertFalse(self.allows(IsPhoneVerified, user))


class EndpointPermissionTests(AuthTestCase):
    def test_me_needs_a_session_and_is_read_only(self):
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)

        session = self.make_customer()
        self.as_user(session)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)
        # Nothing about the account — least of all its role — is editable here.
        self.assertEqual(self.client.patch('/api/auth/me/', {'role': 'admin'},
                                           format='json').status_code, 405)

    def test_only_an_owner_reaches_employee_management(self):
        owner = self.make_owner()
        customer = self.make_customer()
        barber = self.make_barber()

        self.as_user(owner)
        self.assertEqual(self.client.get('/api/salon/employees/').status_code, 200)

        for session in (customer, barber):
            with self.subTest(role=session['user']['role']):
                self.as_user(session)
                self.assertEqual(self.client.get('/api/salon/employees/').status_code, 403)
                self.assertEqual(
                    self.client.post('/api/salon/employees/',
                                     {'phone': '01755555555', 'name': 'X',
                                      'password': 'chairside2026'},
                                     format='json').status_code,
                    403,
                )

    def test_a_signed_out_caller_reaches_nothing(self):
        for method, path in (('get', '/api/salon/employees/'), ('get', '/api/auth/me/')):
            with self.subTest(path=path):
                self.assertEqual(getattr(self.client, method)(path).status_code, 401)
