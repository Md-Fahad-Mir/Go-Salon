"""Which tenant a request is about.

**This is a stand-in, and it is replaced in Step 6d.** The real answer is an
explicit identifier the client sends — a header — resolved and verified by
request-layer plumbing that does not exist yet. What is here is the smallest
thing that lets the filtering in `Apps/bookings/access.py` be written and
tested a step early, without pretending to be the transport.

It answers in two ways, in order:

  1. `request.tenant`, if something upstream has already set it. That is the
     shape 6d will fill in, so every caller is written against it now and
     nothing has to change when it arrives.

  2. Otherwise, the one tenant the account belongs to. Almost every account in
     this system belongs to exactly one — an owner owns a salon, a barber is
     one, a stylist works at one — and a customer has however many salons they
     have scanned into.

**Why the fallback is not a security hole, and why it still has to go.** It
never widens anything: it can only ever return a tenant the account already
belongs to, and `access.scoped` re-checks membership regardless of where the
tenant came from. What it does do is *choose* for the caller, and for a
customer who has joined several salons there is nothing to choose from — so it
returns `None` rather than guessing, and the request sees an empty result until
a real identifier arrives. That is the hole 6d closes: not a leak, a shrug.
"""

from __future__ import annotations

from Apps.users.models import Role, SalonEmployee

from .models import CustomerTenantMembership, Tenant


def tenants_of(user, limit: int = 2) -> list:
    """The tenants this account belongs to, up to `limit`.

    Capped because every caller only wants to know *none*, *one* or *several*
    — and "several" is answered by the second row, so there is no reason to
    fetch a customer's whole list of salons to find out.
    """
    if user is None or not user.is_authenticated:
        return []

    if user.role == Role.SALON_OWNER:
        found = list(Tenant.objects.filter(salon__owner=user)[:limit])
    elif user.role == Role.BARBER:
        found = list(Tenant.objects.filter(barber_profile__user=user)[:limit])
    elif user.role == Role.SALON_EMPLOYEE:
        found = list(Tenant.objects.filter(
            salon__employees__user=user, salon__employees__is_active=True,
        )[:limit])
    elif user.role == Role.CUSTOMER:
        ids = list(
            CustomerTenantMembership.objects
            .filter(customer=user, is_active=True)
            .values_list('tenant_id', flat=True)[:limit]
        )
        found = list(Tenant.objects.filter(pk__in=ids)[:limit])
    else:
        return []

    return found


def sole_tenant_of(user) -> Tenant | None:
    """The single tenant this account belongs to, or None if it is not one.

    None collapses "belongs to none" and "belongs to several", which is right
    for a caller that just wants something to scope to — both leave it with
    nothing. Callers that need to tell the two apart ask `tenants_of`, because
    they are different conversations: one person has a choice to make, the
    other has nothing to choose from.
    """
    found = tenants_of(user)
    return found[0] if len(found) == 1 else None


def tenant_of_request(request) -> Tenant | None:
    """The tenant this request is about, or None when it cannot be settled."""
    if request is None:
        return None
    explicit = getattr(request, 'tenant', None)
    if explicit is not None:
        return explicit
    return sole_tenant_of(getattr(request, 'user', None))


def business_of_tenant(tenant) -> dict | None:
    """`{'salon': …}` or `{'barber': …}` — the tenant's business, keyed the way
    the write paths already pass an owner around.

    The inverse of `provisioning.tenant_for`, and the replacement for every
    `user.salons.first()` in this project. The difference is not cosmetic:
    `Salon.owner` is a plain ForeignKey with no uniqueness behind it and
    `Salon.Meta.ordering` is `('name',)`, so `.first()` means *the
    alphabetically first salon this person owns* — which is a coincidence, not
    an answer. A tenant names exactly one business, so there is nothing to
    pick.

    Says nothing about whether the caller may use it. Each site pairs this
    with its own role test, because they genuinely differ: a salon's price
    list belongs to the salon, but a stylist's portfolio belongs to the
    stylist even while they stand in someone else's shop.
    """
    if tenant is None:
        return None
    if tenant.salon_id:
        return {'salon': tenant.salon}
    if tenant.barber_profile_id:
        return {'barber': tenant.barber_profile}
    return None


def belongs_to(user, tenant) -> bool:
    """Whether this account may act inside this tenant at all.

    One question per role, each answered against the record that grants the
    standing rather than against anything the caller sent:

      * a customer has joined the salon — a `CustomerTenantMembership`, which
        the join endpoint creates when they scan the shop's QR code;
      * an owner owns the salon the tenant is;
      * an employee currently works at it;
      * a barber *is* it.
    """
    if tenant is None:
        return False

    if user.role == Role.CUSTOMER:
        return CustomerTenantMembership.objects.filter(
            customer=user, tenant=tenant, is_active=True
        ).exists()

    if user.role == Role.SALON_OWNER:
        return bool(tenant.salon_id) and tenant.salon.owner_id == user.id

    if user.role == Role.SALON_EMPLOYEE:
        if not tenant.salon_id:
            return False
        return SalonEmployee.objects.filter(
            user=user, salon=tenant.salon, is_active=True
        ).exists()

    if user.role == Role.BARBER:
        profile = getattr(user, 'barber_profile', None)
        return profile is not None and tenant.barber_profile_id == profile.id

    return False
