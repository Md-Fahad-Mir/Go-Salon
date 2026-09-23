"""Reading and writing a week of working hours."""

from __future__ import annotations

from django.db import transaction

from Apps.tenants.provisioning import tenant_for

from .models import WEEKDAYS, Weekday, WorkingDay, WorkingInterval


def days_for(owner: dict):
    """Every stored day for one owner, with its intervals already loaded."""
    return WorkingDay.objects.filter(**owner).prefetch_related('intervals')


def has_schedule(owner: dict) -> bool:
    return WorkingDay.objects.filter(**owner).exists()


@transaction.atomic
def replace_days(owner: dict, days: list[dict]) -> None:
    """Write the days that were sent, leaving the rest of the week alone.

    Each day is rewritten whole — its old intervals go and the new ones are
    written — because a partial update of a list has no sensible meaning: you
    cannot "patch" 9-to-1 into 9-to-1-and-4-to-8 without saying which is which.
    """
    # `owner` is the same three-way key this model's own constraint describes —
    # a salon, a lone barber, or one chair's employment — and the tenant is
    # read off whichever of the three it holds. Resolved once for the whole
    # week rather than per day: every day of one week belongs to one business.
    tenant = tenant_for(owner)

    for entry in days:
        weekday = Weekday.from_key(entry['day'])
        day, _ = WorkingDay.objects.update_or_create(
            weekday=weekday,
            defaults={'is_closed': entry['is_closed'], 'tenant': tenant},
            **owner,
        )
        day.intervals.all().delete()
        WorkingInterval.objects.bulk_create([
            WorkingInterval(day=day, start=interval['start'], end=interval['end'])
            for interval in entry.get('intervals', [])
        ])


@transaction.atomic
def clear_days(owner: dict) -> int:
    """Drop a schedule entirely. For an employee that is how they go back to
    working whatever hours their salon keeps."""
    deleted, _ = WorkingDay.objects.filter(**owner).delete()
    return deleted


DEFAULT_OPEN = '10:00'
DEFAULT_CLOSE = '20:00'
#: Friday is the day off most Dhaka salons keep.
DEFAULT_CLOSED_DAY = 'fri'


def default_week() -> list[dict]:
    """What a business that has never set its hours is shown — a starting
    point to edit, clearly marked as not yet saved by the caller."""
    return [
        {
            'day': key,
            'is_closed': key == DEFAULT_CLOSED_DAY,
            'intervals': ([] if key == DEFAULT_CLOSED_DAY
                          else [{'start': DEFAULT_OPEN, 'end': DEFAULT_CLOSE}]),
        }
        for key in WEEKDAYS
    ]
