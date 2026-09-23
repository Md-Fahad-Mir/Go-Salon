"""Making a business's tenant, and finding it again.

A tenant is created **when the business is**, in the same transaction as the
`Salon` or `BarberProfile` it belongs to. Not on first use: the `join_token` is
what a salon's QR code carries, and an owner has to be able to print that the
day they sign up, not the day they get round to adding a price list.

Everything that reads a tenant afterwards therefore only ever *looks it up*.
`tenant_for` does no creation at all — if a salon reaches it without a tenant,
something upstream failed to make one and that is a bug in this codebase, not a
situation for the caller to handle. It is raised as such.

WHO GETS ONE

  * a `Salon` — always, at owner registration;
  * a `BarberProfile` belonging to an independent trade — at barber
    registration;
  * a `BarberProfile` belonging to a hired stylist — **never**. It is the
    personal record every employee is given when they are taken on, so their
    photograph and bio have somewhere to live. It is not a business, and the
    one row that may hang off it without a tenant is their own gallery
    picture. See `tenant_for_optional`.
"""

from __future__ import annotations

from Apps.users.models import Role

from .models import Tenant
from .slugs import unique_slug


class MissingTenant(RuntimeError):
    """A business that must have a tenant does not have one.

    Deliberately **not** a DRF exception. After registration provisions every
    salon and every independent barber, there is no request a client can make
    that reaches this legitimately — so it should surface as a 500 with a
    traceback in the log, where it will be noticed and fixed, rather than as a
    tidy 409 that a client is invited to handle and everyone learns to ignore.

    If this ever fires in production it means a `Salon` or an independent
    `BarberProfile` was created by something that does not provision a tenant.
    The candidates are listed in the Step 6a-2 report: Django admin, and the
    `get_or_create` safety nets in `Apps/users/serializers.py`.
    """


def is_independent_business(profile) -> bool:
    """Whether a barber profile is a business in its own right.

    The same rule `backfill_tenants` classifies by: an account still holding
    the `barber` role, or one registered as an owner that never created a
    salon and so has nothing but this profile to trade under. A hired
    stylist's profile is neither.

    The second case is a historical data anomaly rather than something a fresh
    sign-up can produce — see the report — but the rule is kept whole here so
    that this function and the backfill cannot disagree about an existing row.
    """
    role = profile.user.role
    if role == Role.BARBER:
        return True
    if role == Role.SALON_OWNER:
        return not profile.user.salons.exists()
    return False


def _allocate(**owner) -> Tenant:
    """Create the tenant for a business, or return the one it already has.

    Idempotent on purpose: registration takes over an abandoned, unverified
    sign-up rather than refusing the number, so `build_profile` can run twice
    for the same business and must not produce a second tenant — the one-to-one
    columns would refuse it anyway, and an exception there would fail a
    perfectly ordinary re-registration.
    """
    existing = Tenant.objects.filter(**owner).first()
    if existing is not None:
        return existing

    salon = owner.get('salon')
    profile = owner.get('barber_profile')
    name = salon.name if salon is not None else profile.display_name
    fallback = f'salon-{salon.pk}' if salon is not None else f'barber-{profile.pk}'
    slug, _ = unique_slug(
        name, fallback=fallback,
        taken=set(Tenant.objects.values_list('slug', flat=True)),
    )
    return Tenant.objects.create(slug=slug, **owner)


# -- provisioning, called from registration ------------------------------


def provision_for_salon(salon) -> Tenant:
    """The tenant for a newly registered salon. A salon is always a business."""
    return _allocate(salon=salon)


def provision_for_barber(profile) -> Tenant | None:
    """The tenant for a newly registered barber, if they are a business.

    Returns `None` — rather than raising — for a profile that must not have
    one, so the employee-hiring path can call it without having to know the
    rule. Nothing is created in that case.
    """
    if not is_independent_business(profile):
        return None
    return _allocate(barber_profile=profile)


# -- lookup, called from the write paths ---------------------------------


def _tenant_of(business):
    """The tenant on a salon or barber profile, or None.

    Django makes `RelatedObjectDoesNotExist` a subclass of `AttributeError`
    for a reverse one-to-one, so `getattr` with a default is the idiomatic
    read here — the same shape `getattr(user, 'barber_profile', None)` takes
    everywhere else in this project.
    """
    return getattr(business, 'tenant', None)


def tenant_for(owner: dict) -> Tenant:
    """The tenant for an owner, in the shape the write paths already pass round.

    `{'salon': …}`, `{'barber': …}` or `{'employment': …}` — the same three
    keys `WorkingDay` allows, so one function serves every write path and none
    of them has to know which kind of business it is holding.

    Strictly a lookup. Raises `MissingTenant` rather than creating anything:
    by the time a row is being written, the business has existed since
    registration and so has its tenant.
    """
    salon = owner.get('salon')
    if salon is not None:
        tenant = _tenant_of(salon)
        if tenant is None:
            raise MissingTenant(
                f'Salon {salon.pk} ({salon.name!r}) has no tenant. Every salon '
                f'is given one at registration, so this one was created by '
                f'something that does not.'
            )
        return tenant

    profile = owner.get('barber')
    if profile is not None:
        tenant = _tenant_of(profile)
        if tenant is None:
            raise MissingTenant(
                f'BarberProfile {profile.pk} (user {profile.user_id}, role '
                f'{profile.user.role!r}) has no tenant. An independent barber '
                f'is given one at registration; a hired stylist has none by '
                f'design and must be read with tenant_for_optional().'
            )
        return tenant

    employment = owner.get('employment')
    if employment is not None:
        # A chair's own hours belong to the salon the chair is in. The
        # employment owns the row; the salon is the business.
        return tenant_for({'salon': employment.salon})

    raise MissingTenant(f'No business on this owner to file anything under: {owner!r}')


def tenant_for_optional(owner: dict) -> Tenant | None:
    """`tenant_for`, but `None` for the one owner allowed to have no tenant.

    A hired stylist's own gallery picture. Their portfolio is theirs and not
    the shop's — `gallery_owner` says so, and
    `test_an_employees_gallery_is_theirs_and_not_the_salons` asserts the
    picture must not appear in the salon's gallery — so their profile is not a
    business and has nothing to file the row under.

    `GalleryImage.tenant` is therefore nullable **by design and permanently**,
    not pending a decision. The other three tables have no such case: a
    service, a working day and an appointment always belong to a real
    business, and their tenant is required.
    """
    profile = owner.get('barber')
    if profile is not None and not is_independent_business(profile):
        return None
    return tenant_for(owner)
