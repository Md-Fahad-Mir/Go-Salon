"""One salon, in full, for somebody who belongs to it.

    GET /api/listings/{id}/      its menu, its chairs, its week, its address

Ids are kind-prefixed — `salon-3`, `barber-9` — the same namespace bookings
and reviews already use, so a customer never has to know which table a
listing came out of.

WHAT THIS USED TO BE

A browsable directory: `GET /api/directory/` returned every salon and barber
on the platform, filtered, sorted and searchable, to anybody signed in. The
audit called that out as finding C2 — those rows carry business phone
numbers, staff names, price lists and opening hours — and the detail endpoint
beside it had the same problem in a narrower form, since any signed-in account
could read any salon by guessing `salon-<n>`.

The list is gone rather than locked down, because the product it existed for
is gone: cross-salon search, discovery by hairstyle and post-try-on
suggestions are all withdrawn, and a customer now reaches a salon by scanning
its code. Nothing internal used it — Django's own admin is where staff look
things up — so an admin-gated version would have been a filtering and sorting
machine with no caller, which is dead code wearing a permission class.

What remains is the one read that still has a job: the booking wizard needs a
salon's menu, chairs, address and phone, and there is no other endpoint that
gives a customer any of those. It is now scoped to membership through
`belongs_to`, the same check every other tenant-scoped read uses.

Read-only by design: everything here is maintained by its owner through
`/api/profile/me/`, `/api/services/` and `/api/schedule/me/`. There is no
write path, so there is nothing here to duplicate those.
"""

from __future__ import annotations

from django.db.models import Prefetch
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from Apps.reviews.ratings import chair_scores_for, scores_for
from Apps.schedules.models import WorkingDay
from Apps.services.models import Service
from Apps.tenants.context import belongs_to
from Apps.tenants.models import Tenant
from Apps.users.models import BarberProfile, Role, Salon

from .serializers import barber_listing, salon_listing

#: A listing is only worth showing when the account behind it is real: active,
#: and with the phone its owner actually proved. A half-finished sign-up is
#: not a salon anyone can walk into — both querysets below say so.


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, '') else None
    except (TypeError, ValueError):
        return None


def _salons():
    """Salons whose owner's account is live, with everything a listing reads
    already loaded — one query each rather than one per row."""
    return (
        Salon.objects.filter(owner__is_active=True, owner__is_phone_verified=True)
        .select_related('owner')
        .prefetch_related(
            'gallery',
            'employees__user__barber_profile',
            # A chair's own week, for the chairs that have overridden the
            # salon's. Prefetched with the rest so a salon with six stylists
            # is still one query rather than seven.
            Prefetch('employees__working_days',
                     queryset=WorkingDay.objects.prefetch_related('intervals')),
            Prefetch('services', queryset=Service.objects.select_related('category')
                     .prefetch_related('eligible_employees')),
            Prefetch('working_days', queryset=WorkingDay.objects.prefetch_related('intervals')),
        )
    )


def _barbers():
    """Independent barbers and hairstylists. An employee is somebody's chair,
    not a business of their own, so they are not listed here — their salon is."""
    return (
        BarberProfile.objects.filter(
            user__role=Role.BARBER, user__is_active=True, user__is_phone_verified=True
        )
        .select_related('user', 'category')
        .prefetch_related(
            'gallery',
            Prefetch('services', queryset=Service.objects.select_related('category')
                     .prefetch_related('eligible_employees')),
            Prefetch('working_days', queryset=WorkingDay.objects.prefetch_related('intervals')),
        )
    )


def _tenant_of_listing(kind: str, pk: int):
    """The tenant a listing id names, or None.

    The listing namespace and the tenancy are two views of the same businesses
    — a `salon-3` is the salon a tenant points at — so this is a lookup rather
    than a translation. `is_active=False` answers None: a suspended tenant is
    a 404 at every other door and must not be a way in through this one.
    """
    if kind == 'salon':
        return Tenant.objects.filter(salon_id=pk, is_active=True).first()
    if kind == 'barber':
        return Tenant.objects.filter(barber_profile_id=pk, is_active=True).first()
    return None


class DetailView(APIView):
    """One salon, to somebody who belongs to it.

    NOT a member gets the same 404 as a salon that does not exist, which is
    the convention this codebase already settled on for object-level access:
    `MyTenantView` answers "never a member, already removed, or no such salon"
    identically, and `TenantContext` refuses to tell an unknown id and an
    inactive one apart, both so that nobody can map the platform by guessing.
    The 403 `not_a_member` that `TenantContext` does raise is a different
    question — there the client *asserted* a tenant in a header and has to be
    told the assertion was refused. Here it named an object, and an object it
    may not see is an object that is not there.

    Providers are let through by the same check rather than by a special case,
    and it is worth saying that none of them needs this endpoint: an owner
    reads their salon through `/api/profile/me/`, `/api/services/`,
    `/api/salon/employees/` and `/api/schedule/me/`, and a stylist through
    their own profile and shift. `belongs_to` covers all four roles, so
    excluding them would mean writing a rule to forbid something harmless.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request, listing_id: str):
        point = (_float(request.query_params.get('lat')),
                 _float(request.query_params.get('lng')))
        kind, _, raw = listing_id.partition('-')
        if not raw.isdigit():
            return _not_found()

        # Membership first, before a single row is read. Doing it after the
        # lookup would be the same answer and a wasted query, and it would put
        # the business in a local variable in the branch where nobody may see
        # it — which is how the next person accidentally returns it.
        tenant = _tenant_of_listing(kind, int(raw))
        if tenant is None or not belongs_to(request.user, tenant):
            return _not_found()

        if kind == 'salon':
            salon = _salons().filter(pk=int(raw)).first()
            if salon is None:
                return _not_found()
            scores = scores_for(salon_ids=[salon.id])
            chairs = chair_scores_for([e.id for e in salon.employees.all() if e.is_active])
            return Response(salon_listing(salon, point=point, detail=True,
                                          scores=scores, chair_scores=chairs))

        profile = _barbers().filter(pk=int(raw)).first()
        if profile is None:
            return _not_found()
        scores = scores_for(barber_ids=[profile.id])
        return Response(barber_listing(profile, point=point, detail=True, scores=scores))


def _not_found() -> Response:
    return Response(
        {'detail': 'We could not find that salon.', 'code': 'not_found', 'errors': {}},
        status=status.HTTP_404_NOT_FOUND,
    )
