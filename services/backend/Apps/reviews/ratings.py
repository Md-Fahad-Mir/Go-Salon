"""The score under a business's name, for the screens that list many at once.

The directory draws a star and a count on every card. Asking the database once
per card is how a search results page becomes forty queries, so this answers for
a whole page in two: one for salons, one for lone barbers.

A business with no reviews gets `rating: None`, not `0`. Nobody has rated it
badly; nobody has rated it at all, and the two are different sentences.
"""

from __future__ import annotations

from django.db.models import Avg, Count

from .models import Review


def _group(field: str, prefix: str, ids) -> dict:
    ids = [i for i in ids if i]
    if not ids:
        return {}
    rows = (
        Review.objects.filter(**{f'appointment__{field}__in': ids})
        .values(f'appointment__{field}')
        .annotate(average=Avg('rating'), count=Count('id'))
    )
    return {
        f'{prefix}-{row[f"appointment__{field}"]}': {
            'rating': round(row['average'], 1),
            'review_count': row['count'],
        }
        for row in rows
    }


def chair_scores_for(employment_ids) -> dict:
    """`{employment_id: {'rating': 4.8, 'review_count': 6}, …}` in one query.

    A chair's score is the reviews of the work done *in that chair*, which is
    what a customer choosing a stylist is asking about. A stylist nobody has
    reviewed is absent, for the same reason a business is — `0.0 (0)` under a
    new colleague's name is a verdict, and no one has passed one.
    """
    ids = [i for i in employment_ids if i]
    if not ids:
        return {}
    rows = (
        Review.objects.filter(appointment__employee_id__in=ids)
        .values('appointment__employee_id')
        .annotate(average=Avg('rating'), count=Count('id'))
    )
    return {
        row['appointment__employee_id']: {
            'rating': round(row['average'], 1),
            'review_count': row['count'],
        }
        for row in rows
    }


def scores_for(*, salon_ids=(), barber_ids=()) -> dict:
    """`{'salon-3': {'rating': 4.7, 'review_count': 12}, …}`.

    Keyed by the directory's own listing id so a caller can look a row up with
    the id it already has, and businesses with no reviews are simply absent.
    """
    scores = _group('salon_id', 'salon', salon_ids)
    scores.update(_group('barber_id', 'barber', barber_ids))
    return scores
