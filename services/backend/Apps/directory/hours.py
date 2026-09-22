"""Is this place open, and what does its week look like?

Opening hours are stored as naive local times — "10:00" means ten in the
morning where the salon is, not ten UTC. `settings.TIME_ZONE` is UTC because
that is the right thing for timestamps, so "open now" needs the *business*
timezone instead, which is what `BUSINESS_TIME_ZONE` is for.
"""

from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

from django.conf import settings

from Apps.schedules.models import WEEKDAYS, Weekday


def business_now() -> datetime:
    return datetime.now(ZoneInfo(getattr(settings, 'BUSINESS_TIME_ZONE', 'Asia/Dhaka')))


def week_payload(days) -> list[dict]:
    """The stored week as the app reads it: seven entries, Sunday first, each
    shut or open for one or more stretches."""
    by_weekday = {day.weekday: day for day in days}
    out = []
    for index, key in enumerate(WEEKDAYS):
        day = by_weekday.get(index)
        if day is None or day.is_closed:
            out.append({'day': key, 'is_closed': True, 'intervals': []})
            continue
        intervals = [
            {'start': interval.start.strftime('%H:%M'), 'end': interval.end.strftime('%H:%M')}
            for interval in day.intervals.all()
        ]
        out.append({'day': key, 'is_closed': not intervals, 'intervals': intervals})
    return out


def is_open_at(week: list[dict], moment: datetime | None = None) -> bool:
    """True when some stretch of today covers this minute.

    Multiple stretches are the whole point: a salon that shuts for lunch is
    closed at one o'clock and open again at four, and a single open/close pair
    cannot say that.
    """
    moment = moment or business_now()
    # Python's Monday-first weekday() is not the app's Sunday-first week.
    key = WEEKDAYS[(moment.weekday() + 1) % 7]
    today = next((day for day in week if day['day'] == key), None)
    if today is None or today['is_closed']:
        return False
    now = moment.time()
    return any(
        _parse(stretch['start']) <= now < _parse(stretch['end'])
        for stretch in today['intervals']
    )


def _parse(value: str) -> time:
    hours, minutes = value.split(':')[:2]
    return time(int(hours), int(minutes))


def weekday_index(moment: datetime | None = None) -> int:
    moment = moment or business_now()
    return (moment.weekday() + 1) % 7


__all__ = ['business_now', 'week_payload', 'is_open_at', 'weekday_index', 'Weekday']
