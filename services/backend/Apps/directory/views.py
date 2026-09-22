"""The customer-facing directory.

    GET /api/directory/          everyone taking clients, filtered and sorted
    GET /api/directory/{id}/     one of them, with its menu and its chairs

Ids are kind-prefixed — `salon-3`, `barber-9` — so two tables share one
namespace and a customer never has to know which one a listing came out of.

Read-only by design: everything here is maintained by its owner through
`/api/profile/me/`, `/api/services/` and `/api/schedule/me/`. There is no
write path, so there is nothing here to duplicate those.
"""

from __future__ import annotations

from django.db.models import Prefetch, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from Apps.reviews.ratings import chair_scores_for, scores_for
from Apps.schedules.models import WorkingDay
from Apps.services.models import Service
from Apps.users.models import BarberProfile, Role, Salon

from .hours import is_open_at
from .serializers import barber_listing, salon_listing

#: A listing is only worth showing when the account behind it is real: active,
#: and with the phone its owner actually proved. A half-finished sign-up is
#: not a salon anyone can walk into — both querysets below say so.

SORTS = {'distance', 'price', 'name'}
DEFAULT_LIMIT = 50
MAX_LIMIT = 100


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, '') else None
    except (TypeError, ValueError):
        return None


def _int(value: str | None, default: int, ceiling: int) -> int:
    try:
        return max(1, min(ceiling, int(value))) if value not in (None, '') else default
    except (TypeError, ValueError):
        return default


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


def _matches_query(listing: dict, needle: str) -> bool:
    """Name, tagline, area, category, specialties and the menu — what someone
    would actually type. Done in Python because a listing is already two
    tables joined and the catalogue is small."""
    haystack = ' '.join([
        listing['name'],
        listing['tagline'],
        listing['bio'][:200],
        listing['location']['area'],
        listing['location']['city'],
        listing['category'],
        listing['type'],
        listing['kind'],
        ' '.join(listing['specialties']),
        ' '.join(service['name'] for service in listing.get('_service_names', [])),
    ]).lower()
    return needle in haystack


class DirectoryListView(APIView):
    """Signed-in customers only, in the sense that everyone signed in may read
    it. It is not open to the world: these rows carry business phone numbers,
    and an anonymous endpoint returning those is a scraping target."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        params = request.query_params
        point = (_float(params.get('lat')), _float(params.get('lng')))
        kind = (params.get('type') or 'all').lower()
        audience = (params.get('audience') or 'all').lower()
        area = (params.get('area') or '').strip()
        needle = (params.get('q') or '').strip().lower()
        open_now = params.get('open_now') in {'1', 'true', 'yes'}
        sort = (params.get('sort') or 'distance').lower()
        limit = _int(params.get('limit'), DEFAULT_LIMIT, MAX_LIMIT)

        listings: list[dict] = []
        salons = list(_salons())
        profiles = [] if kind == 'salon' else list(_barbers())
        # Every score on the page in two queries, before a single card is built.
        scores = scores_for(
            salon_ids=[row.id for row in salons],
            barber_ids=[row.id for row in profiles],
        )

        # `barber` as a *type* means a barbershop as well as a lone barber, so
        # salons whose business type is `barber` belong in that filter too.
        for salon in salons:
            listing = salon_listing(salon, point=point, scores=scores)
            listing['_service_names'] = [{'name': s.name} for s in salon.services.all()]
            listings.append(listing)
        for profile in profiles:
            listing = barber_listing(profile, point=point, scores=scores)
            listing['_service_names'] = [{'name': s.name} for s in profile.services.all()]
            listings.append(listing)

        if kind in {'salon', 'barber'}:
            listings = [row for row in listings if row['type'] == kind]
        if audience in {'men', 'women'}:
            # `unisex` serves everyone, so it belongs in both sides.
            listings = [row for row in listings if row['audience'] in {audience, 'unisex'}]
        if area:
            listings = [row for row in listings
                        if row['location']['area'].lower() == area.lower()]
        if needle:
            listings = [row for row in listings if _matches_query(row, needle)]
        if open_now:
            listings = [row for row in listings if row['open_now']]

        listings = _sorted(listings, sort)
        for row in listings:
            row.pop('_service_names', None)
        return Response({'count': len(listings), 'results': listings[:limit]})


def _sorted(listings: list[dict], sort: str) -> list[dict]:
    """Rows with nothing to sort on go last rather than first — a salon with
    no pin is not the nearest one, and one with no menu is not the cheapest."""
    if sort == 'price':
        return sorted(listings, key=lambda row: (row['price_from'] is None,
                                                 row['price_from'] or 0, row['name']))
    if sort == 'name':
        return sorted(listings, key=lambda row: row['name'].lower())
    return sorted(listings, key=lambda row: (row['distance_km'] is None,
                                             row['distance_km'] or 0, row['name']))


class DirectoryDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, listing_id: str):
        point = (_float(request.query_params.get('lat')),
                 _float(request.query_params.get('lng')))
        kind, _, raw = listing_id.partition('-')
        if not raw.isdigit():
            return _not_found()

        if kind == 'salon':
            salon = _salons().filter(pk=int(raw)).first()
            if salon is None:
                return _not_found()
            scores = scores_for(salon_ids=[salon.id])
            chairs = chair_scores_for([e.id for e in salon.employees.all() if e.is_active])
            return Response(salon_listing(salon, point=point, detail=True,
                                          scores=scores, chair_scores=chairs))

        if kind == 'barber':
            profile = _barbers().filter(pk=int(raw)).first()
            if profile is None:
                return _not_found()
            scores = scores_for(barber_ids=[profile.id])
            return Response(barber_listing(profile, point=point, detail=True, scores=scores))

        return _not_found()


def _not_found() -> Response:
    return Response(
        {'detail': 'We could not find that salon.', 'code': 'not_found', 'errors': {}},
        status=status.HTTP_404_NOT_FOUND,
    )
