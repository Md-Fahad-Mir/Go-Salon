"""The tenant — one business, inside one app.

Two kinds of business take bookings in this project, and they always have: a
`Salon` with chairs, and a `BarberProfile` working alone. `Service`,
`GalleryImage`, `WorkingDay` and `Appointment` each carry that pair as two
nullable columns with a check constraint saying exactly one is filled in, so
"whose row is this?" has been answerable since the beginning — it has simply
never had a name. `Tenant` is that name.

THERE ARE NO SUBDOMAINS ANYWHERE IN THIS SYSTEM.

That sentence is here because it is the first thing a reader assumes when they
see a `slug` on a tenant model, and acting on the assumption would be a
security bug. One app is served from one origin — the customer PWA and the
provider dashboard are the same deployment — and no part of this system reads
`Host` to decide anything.

HOW A TENANT IS RESOLVED

Per request, in two halves that both have to agree:

  1. The client states which tenant it means, explicitly — a header on the
     request, not a hostname and not a guess.
  2. The server checks that claim against a membership record it owns:
     `CustomerTenantMembership` for a customer, `SalonEmployee` for staff,
     `Salon.owner` for an owner.

The second half is the security boundary. The first is only a selector: it
says which of the tenants this account already belongs to the request is
about. A stated tenant with no membership behind it is refused — the claim is
never enough on its own, and there is no fallback to "their only tenant" for a
request that names one it may not have.

WHAT `slug` IS AND IS NOT

A human-readable handle. It may appear in a shareable profile link later, and
it is what makes a tenant recognisable in a log or an admin list. **Nothing
about routing or authorisation depends on it.** It is not a hostname, it is
not resolved from anything, and it can be changed without moving a request or
widening an account's reach.

WHAT `join_token` IS

The way a customer gets a tenant in the first place. It is printed in the
salon's QR code; scanning it calls the join endpoint, which creates a
`CustomerTenantMembership`, and from then on that salon is one of the
customer's added salons inside the same single app. So the token is a
capability — holding it is what earns the membership — which is why it is
32 random bytes rather than anything derived from the business.

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
    """One business, as the rest of the app refers to it.

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

    #: A readable handle for this business — for a shareable profile link, and
    #: for recognising a tenant in a log. Never used to route or to authorise;
    #: see the module docstring. The 63-character ceiling is inherited from the
    #: URL-safe label rules it is generated against, not from any hostname.
    slug = models.SlugField(max_length=63, unique=True)
    #: What a salon's QR code carries. Scanning it is what creates a
    #: `CustomerTenantMembership`, so whoever holds this token can join — hence
    #: 32 random bytes rather than anything derived from the business.
    join_token = models.CharField(max_length=43, unique=True, default=new_join_token)
    #: Off closes the business to new activity without deleting anything.
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
