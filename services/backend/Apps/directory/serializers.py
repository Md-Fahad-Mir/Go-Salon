"""What a customer sees when they look for somewhere to get their hair cut.

Two kinds of listing come out of one shape: a **salon** (a `Salon` row, with
chairs) and an **independent barber or hairstylist** (a `BarberProfile` whose
account works for itself). A customer does not care which table a place came
out of, so both are serialised the same way and told apart by `kind`.

Nothing here is writable. This is the read side of records their owners
maintain through `/api/profile/me/`, `/api/services/` and `/api/schedule/me/`.
"""

from __future__ import annotations

from Apps.services.models import Service
from Apps.users.models import Salon, SalonEmployee

from .geo import distance_km
from .hours import is_open_at, week_payload


def _location(instance) -> dict:
    return {
        'area': instance.area,
        'city': instance.city,
        'address': instance.address,
        'latitude': instance.latitude,
        'longitude': instance.longitude,
    }


def _gallery(images) -> list[dict]:
    return [
        {'id': image.id, 'image': image.image, 'caption': image.caption}
        for image in images
    ]


def _price_from(services) -> float | None:
    """The cheapest thing on the menu. None when there is no menu yet — which
    is not the same as free, and the card says so."""
    prices = [service.price for service in services if service.is_active]
    return float(min(prices)) if prices else None


def _service(service: Service) -> dict:
    return {
        'id': str(service.id),
        'name': service.name,
        'category': service.category.name if service.category_id else '',
        'description': service.description,
        'price': float(service.price),
        'duration': service.duration_minutes,
        'buffer_minutes': service.buffer_minutes,
        'audience': service.audience,
        'includes': service.includes or [],
        'steps': service.steps or [],
        'popular': service.is_popular,
        'eligible_employee_ids': [str(chair.id) for chair in service.eligible_employees.all()],
    }


def _staff(employment: SalonEmployee, salon_week: list[dict], score=None) -> dict:
    """One chair, including the week it actually works.

    A chair with no hours of its own keeps the salon's — the same inheritance
    `Apps.bookings.availability.chair_hours` applies when it decides what to
    offer. It is reported here because the customer's calendar has to agree
    with what the booking endpoint will say: a stylist who works ten to eight
    at a salon that has never saved a week is bookable, and a calendar reading
    only the salon's hours would grey out every day she is free.
    """
    profile = getattr(employment.user, 'barber_profile', None)
    own = list(employment.working_days.all())
    return {
        'id': str(employment.id),
        'name': employment.user.name,
        'title': employment.title,
        'avatar': profile.avatar if profile else '',
        'specialties': profile.specialties if profile else [],
        'experience_years': profile.experience_years if profile else 0,
        'hours': week_payload(own) if own else salon_week,
        **(score or {'rating': None, 'review_count': 0}),
    }


def _score(scores, listing_id: str) -> dict:
    """The star and the count, or the honest absence of both.

    `scores` is built once per request by `Apps.reviews.ratings.scores_for` and
    handed in, so a page of forty listings is two queries rather than forty.
    A business nobody has reviewed is not in the map, and reports `None` — a
    listing with no score is not a listing scoring zero.
    """
    found = (scores or {}).get(listing_id)
    return found or {'rating': None, 'review_count': 0}


def salon_listing(salon: Salon, *, point=None, detail=False, scores=None,
                  chair_scores=None) -> dict:
    services = [s for s in salon.services.all()]
    week = week_payload(salon.working_days.all())
    latitude, longitude = (point or (None, None))

    payload = {
        'id': f'salon-{salon.id}',
        'kind': 'salon',
        # A barbershop run as a business is still a "salon" row; `type` is what
        # the customer filters on, so it comes from the business type.
        'type': salon.business_type,
        'name': salon.name,
        'tagline': salon.tagline,
        'bio': salon.bio,
        'audience': salon.audience,
        'avatar': salon.avatar,
        'cover_image': salon.cover_image,
        'gallery': _gallery(salon.gallery.all()),
        'location': _location(salon),
        'distance_km': distance_km(latitude, longitude, salon.latitude, salon.longitude),
        'phone': salon.business_phone or salon.owner.phone,
        'email': salon.contact_email,
        'category': '',
        'specialties': [],
        'experience_years': None,
        'verified': salon.verification == 'verified',
        'accepting_clients': True,
        'acceptance': 'auto' if salon.auto_accept else 'manual',
        'amenities': salon.amenities or [],
        'women_only': salon.women_only,
        'private_booth': salon.private_booth,
        'price_from': _price_from(services),
        'service_count': sum(1 for s in services if s.is_active),
        'staff_count': sum(1 for e in salon.employees.all() if e.is_active),
        'hours': week,
        'open_now': is_open_at(week),
        **_score(scores, f'salon-{salon.id}'),
        'joined_at': salon.created_at,
    }

    if detail:
        payload['services'] = [_service(s) for s in services if s.is_active]
        payload['staff'] = [
            _staff(e, week, (chair_scores or {}).get(e.id))
            for e in salon.employees.all() if e.is_active
        ]
    return payload


def barber_listing(profile, *, point=None, detail=False, scores=None) -> dict:
    services = [s for s in profile.services.all()]
    week = week_payload(profile.working_days.all())
    latitude, longitude = (point or (None, None))

    payload = {
        'id': f'barber-{profile.id}',
        'kind': 'barber',
        'type': 'barber',
        'name': profile.business_name or profile.user.name,
        'tagline': profile.title,
        'bio': profile.bio,
        'audience': profile.audience,
        'avatar': profile.avatar,
        'cover_image': profile.cover_image,
        'gallery': _gallery(profile.gallery.all()),
        'location': _location(profile),
        'distance_km': distance_km(latitude, longitude, profile.latitude, profile.longitude),
        'phone': profile.contact_phone or profile.user.phone,
        'email': profile.contact_email,
        'category': profile.category.name if profile.category_id else '',
        'specialties': profile.specialties or [],
        'experience_years': profile.experience_years,
        'experience_range': profile.experience_range,
        # Verification is a salon's standing; a barber working alone has none.
        'verified': False,
        'accepting_clients': profile.accepting_clients,
        'acceptance': 'auto',
        'amenities': [],
        'women_only': profile.audience == 'women',
        'private_booth': False,
        'price_from': _price_from(services),
        'service_count': sum(1 for s in services if s.is_active),
        'staff_count': 0,
        'hours': week,
        'open_now': is_open_at(week),
        **_score(scores, f'barber-{profile.id}'),
        'joined_at': profile.user.date_joined,
    }

    if detail:
        payload['services'] = [_service(s) for s in services if s.is_active]
        payload['staff'] = []
        payload['socials'] = {
            'instagram': profile.instagram,
            'facebook': profile.facebook,
            'tiktok': profile.tiktok,
        }
    return payload
