"""Who may do what.

These are the security boundary. The frontend hides what a role cannot use,
but hiding a button is a courtesy — the server is what refuses.
"""

from __future__ import annotations

from rest_framework.permissions import BasePermission

from .models import PROVIDER_ROLES, Role


class _RolePermission(BasePermission):
    role: str

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.role == self.role)


class IsCustomer(_RolePermission):
    role = Role.CUSTOMER
    message = 'Only a customer account can do that.'


class IsBarberOrHairstylist(_RolePermission):
    role = Role.BARBER
    message = 'Only a barber or hairstylist account can do that.'


class IsSalonOrParlorOwner(_RolePermission):
    role = Role.SALON_OWNER
    message = 'Only a salon or parlour owner can do that.'


class IsSalonOrParlorEmployee(_RolePermission):
    role = Role.SALON_EMPLOYEE
    message = 'Only a salon or parlour employee can do that.'


class IsAdmin(BasePermission):
    message = 'Only an administrator can do that.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin)


class IsProvider(BasePermission):
    """Any account that runs a business rather than books one."""

    message = 'Only a professional account can do that.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.role in PROVIDER_ROLES)


class IsPhoneVerified(BasePermission):
    message = 'Verify your phone number first.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_phone_verified)
