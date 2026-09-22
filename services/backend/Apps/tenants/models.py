"""The tenant — one business, one subdomain.

Two kinds of business take bookings in this project, and they always have: a
`Salon` with chairs, and a `BarberProfile` working alone. `Service`,
`GalleryImage`, `WorkingDay` and `Appointment` each carry that pair as two
nullable columns with a check constraint saying exactly one is filled in, so
"whose row is this?" has been answerable since the beginning — it has simply
never had a name.

`Tenant` is that name. It points at one business or the other, the same shape
and the same constraint, and it is the row a subdomain resolves to: everything
under `salon-a.gosalon.com` belongs to the tenant whose `slug` is `salon-a`.
Nothing reads it yet. This step only gives the concept somewhere to live.

Deliberately *not* a column on `Salon`: a lone barber is as much a tenant as a
salon is, and hanging tenancy off the salon table would leave every independent
barber without one.
"""

from __future__ import annotations

import secrets

from django.db import models

#: `secrets.token_urlsafe(32)` is 32 random bytes rendered base64url, which is
#: always 43 characters. Hence `max_length=43`.
JOIN_TOKEN_BYTES = 32


def new_join_token() -> str:
    """A fresh join token.

    A module-level function rather than a lambda or a literal: Django has to
    serialise this into a migration by import path, and a value evaluated once
    at import time would hand every tenant ever created the same token.
    """
    return secrets.token_urlsafe(JOIN_TOKEN_BYTES)


class Tenant(models.Model):
    """One business, addressable by subdomain.

    Exactly one of `salon` and `barber_profile` is set — the check constraint
    is what guarantees a tenant is always *some* business and never two at
    once, the same way `Service` guarantees it for a price-list line.
    """

    salon = models.OneToOneField(
        'users.Salon', on_delete=models.CASCADE, null=True, blank=True,
        related_name='tenant',
    )
    barber_profile = models.OneToOneField(
        'users.BarberProfile', on_delete=models.CASCADE, null=True, blank=True,
        related_name='tenant',
    )

    #: The subdomain label, and therefore a DNS label: 63 characters is the
    #: ceiling the protocol sets, not one we chose.
    slug = models.SlugField(max_length=63, unique=True)
    #: The secret half of an invitation link. Unguessable rather than
    #: sequential, because anyone holding one can act on it.
    join_token = models.CharField(max_length=43, unique=True, default=new_join_token)
    #: Off takes the business off its subdomain without deleting anything.
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('slug',)
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(salon__isnull=False, barber_profile__isnull=True)
                    | models.Q(salon__isnull=True, barber_profile__isnull=False)
                ),
                name='tenant_has_exactly_one_business',
            ),
        ]

    def __str__(self) -> str:
        return self.slug


class CustomerTenantMembership(models.Model):
    """A customer's standing with one business.

    A customer account is not a tenant's property — the same person books at
    several salons, and `Apps.bookings.access.scoped` has always answered their
    booking list across all of them. This row records that they are *known* to
    a particular business, which is a different fact from having an account.

    `is_active` rather than deletion, so a customer a salon has parted ways
    with is a fact the salon keeps rather than a row that disappears.
    """

    customer = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='tenant_memberships',
    )
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='customer_memberships',
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ('-joined_at',)
        constraints = [
            models.UniqueConstraint(
                fields=('customer', 'tenant'), name='unique_customer_tenant_membership'
            ),
        ]

    def __str__(self) -> str:
        return f'{self.customer.phone} at {self.tenant.slug}'
