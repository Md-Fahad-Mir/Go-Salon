"""When can somebody actually sit down?

A slot survives four questions, and all four have to be asked together or the
answer is a lie:

  1. Is the business open then?  — the real week, stretch by stretch
  2. Is there a chair that can do it?  — eligibility, and the chair's own hours
  3. Is that chair free?  — existing appointments, prep time included
  4. Is it still bookable?  — not in the past, and not inside the lead time

`any` is the normal case: the customer does not care which chair, so a time is
offered when *at least one* chair that can perform the services is free. Which
one it turns out to be is decided at booking, not here.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date as Date, datetime, time, timedelta

from django.conf import settings
from django.utils import timezone

from Apps.schedules.models import WorkingDay
from Apps.schedules.services import has_schedule
from Apps.users.models import SalonEmployee

from .models import LIVE_STATUSES, Appointment, business_tz


def slot_step() -> int:
    return getattr(settings, 'BOOKING_SLOT_MINUTES', 15)


def lead_minutes() -> int:
    """How soon is too soon. Nobody can be at a salon in five minutes, and a
    chair needs a moment's warning."""
    return getattr(settings, 'BOOKING_LEAD_MINUTES', 45)


def horizon_days() -> int:
    return getattr(settings, 'BOOKING_HORIZON_DAYS', 60)


@dataclass(frozen=True)
class Chair:
    """Somewhere a booking can land: a salon's employee, or the barber alone."""

    employee: SalonEmployee | None

    @property
    def key(self) -> str:
        return str(self.employee.id) if self.employee else 'self'


def _weekday(day: Date) -> int:
    """The app's Sunday-first week, from Python's Monday-first one."""
    return (day.weekday() + 1) % 7


def _stretches(owner: dict, day: Date) -> list[tuple[time, time]]:
    working = (
        WorkingDay.objects.filter(weekday=_weekday(day), **owner)
        .prefetch_related('intervals')
        .first()
    )
    if working is None or working.is_closed:
        return []
    return [(i.start, i.end) for i in working.intervals.all()]


def chair_hours(*, salon=None, barber=None, employee=None, day: Date) -> list[tuple[time, time]]:
    """The stretches one chair works on one day.

    An employee with no schedule *at all* keeps the salon's; one who has a week
    of their own is held to it, including the days of it they are closed.

    The test is whether the chair has a week, not whether this particular day
    of it produced any stretches. Asking the narrower question conflated "no
    row for Tuesday" with "a row saying Tuesday is shut", so a stylist's day off
    fell back to the salon's hours and sold the whole day — while their own
    profile, which asks the week-level question, showed the day closed. Three
    modules now agree: here, `Apps/schedules` and `Apps/directory`.
    """
    if employee is not None:
        if has_schedule({'employment': employee}):
            return _stretches({'employment': employee}, day)
        return _stretches({'salon': employee.salon}, day)
    if salon is not None:
        return _stretches({'salon': salon}, day)
    return _stretches({'barber': barber}, day)


def chairs_for(*, salon=None, barber=None, services=()) -> list[Chair]:
    """Every chair that could take this booking.

    A service that names nobody is open to all active staff, so the chairs are
    narrowed by *intersection*: a chair has to be cleared for each service in
    the basket, not just one of them.
    """
    if barber is not None:
        return [Chair(None)]

    active = list(salon.employees.filter(is_active=True).select_related('user'))
    if not services:
        return [Chair(employee) for employee in active]

    allowed = None
    for service in services:
        named = set(service.eligible_employees.values_list('id', flat=True))
        cleared = {e.id for e in active} if not named else named & {e.id for e in active}
        allowed = cleared if allowed is None else allowed & cleared
    return [Chair(e) for e in active if e.id in (allowed or set())]


def _busy(chair: Chair, *, salon=None, barber=None, day: Date, exclude_id=None):
    """What already holds this chair on this day, prep time included."""
    query = Appointment.objects.filter(date=day, status__in=LIVE_STATUSES)
    query = query.filter(salon=salon) if salon is not None else query.filter(barber=barber)
    if chair.employee is not None:
        query = query.filter(employee=chair.employee)
    if exclude_id:
        query = query.exclude(pk=exclude_id)
    return [(a.blocked_from, a.ends_at) for a in query]


def _candidate_starts(stretches, day: Date, duration: int, buffer: int) -> list[time]:
    """Every step of the opening stretches where the whole thing could fit.

    The grid runs from the opening time, so a salon that opens at ten offers
    ten, quarter past, half past — not twenty past because the colour needs
    mixing. Whether the prep fits is `_fits`'s job, and it rejects the early
    ones rather than shifting everything off the hour.
    """
    tz = business_tz()
    step = timedelta(minutes=slot_step())
    out: list[time] = []
    for opens, closes in stretches:
        cursor = datetime.combine(day, opens).replace(tzinfo=tz)
        closing = datetime.combine(day, closes).replace(tzinfo=tz)
        while cursor + timedelta(minutes=duration) <= closing:
            out.append(cursor.astimezone(tz).time())
            cursor += step
    return sorted(set(out))


def _free(chair_busy, start_at, end_at, blocked_from) -> bool:
    return not any(
        blocked_from < busy_end and end_at > busy_start
        for busy_start, busy_end in chair_busy
    )


def day_availability(
    *,
    salon=None,
    barber=None,
    day: Date,
    duration: int,
    buffer: int = 0,
    services=(),
    employee: SalonEmployee | None = None,
    exclude_appointment=None,
    now=None,
) -> list[dict]:
    """Every step of the day, said to be free or not, and by whom.

    Unavailable times are returned too rather than filtered out: a calendar
    that shows only what is left cannot show a customer that four o'clock is
    taken, which is the thing they most want to know.
    """
    now = now or timezone.now()
    tz = business_tz()
    cutoff = now + timedelta(minutes=lead_minutes())

    eligible = chairs_for(salon=salon, barber=barber, services=services)
    if employee is not None:
        # Asking for a particular chair does not make it cleared for the work:
        # narrow to it *within* the eligible set, or there is nothing to offer.
        chairs = [c for c in eligible if c.employee is not None and c.employee.id == employee.id]
    else:
        chairs = eligible
    if not chairs:
        return []

    hours_by_chair = {
        chair.key: chair_hours(salon=salon, barber=barber, employee=chair.employee, day=day)
        for chair in chairs
    }
    busy_by_chair = {
        chair.key: _busy(chair, salon=salon, barber=barber, day=day,
                         exclude_id=exclude_appointment)
        for chair in chairs
    }

    # One row per time the business could seat anyone, from every chair's week.
    starts: set[time] = set()
    for chair in chairs:
        starts.update(_candidate_starts(hours_by_chair[chair.key], day, duration, buffer))

    slots = []
    for start in sorted(starts):
        start_at = datetime.combine(day, start).replace(tzinfo=tz)
        end_at = start_at + timedelta(minutes=duration)
        blocked_from = start_at - timedelta(minutes=buffer)

        if start_at < cutoff:
            slots.append({'time': start.strftime('%H:%M'), 'available': False,
                          'employee_ids': [], 'reason': 'too_soon'})
            continue

        # Two different noes. A chair that does not work then was never going
        # to take this booking; a chair that is busy might tomorrow. Saying
        # "taken" for both told customers somebody had booked a time the salon
        # simply is not open for.
        fitting = [
            chair for chair in chairs
            if _fits(hours_by_chair[chair.key], start, end_at.astimezone(tz).time(), buffer, start_at, tz, day)
        ]
        free = [
            chair for chair in fitting
            if _free(busy_by_chair[chair.key], start_at, end_at, blocked_from)
        ]
        slots.append({
            'time': start.strftime('%H:%M'),
            'available': bool(free),
            'employee_ids': [c.employee.id for c in free if c.employee is not None],
            'reason': '' if free else ('taken' if fitting else 'outside_hours'),
        })
    return slots


def _fits(stretches, start: time, end: time, buffer: int, start_at, tz, day: Date) -> bool:
    """Does the whole block — prep and all — sit inside one opening stretch?

    One stretch, not two: a chair is not open across the lunch break it closes
    for, so a cut cannot straddle it.
    """
    blocked_from = (start_at - timedelta(minutes=buffer)).astimezone(tz).time()
    return any(opens <= blocked_from and end <= closes for opens, closes in stretches)


def first_free_chair(
    *, salon=None, barber=None, day: Date, start: time, duration: int, buffer: int,
    services=(), employee=None, exclude_appointment=None, now=None,
) -> tuple[bool, Chair | None, str]:
    """Can this exact time be booked, by which chair — and if not, why not?

    The booking endpoint asks this again at the moment of writing, because the
    slot list a customer is looking at was true when it was fetched and two
    people can want four o'clock at once.

    The reason matters as much as the answer. Every refusal used to come back
    as "that time has just been taken", including a time nobody had booked and
    no salon had ever offered, which is how a customer ends up believing a slot
    is permanently held.
    """
    slots = day_availability(
        salon=salon, barber=barber, day=day, duration=duration, buffer=buffer,
        services=services, employee=employee, exclude_appointment=exclude_appointment,
        now=now,
    )
    if not slots:
        # An empty day has two different causes and they need different words:
        # nobody here can do this work, versus nobody works this day.
        eligible = chairs_for(salon=salon, barber=barber, services=services)
        if employee is not None:
            eligible = [c for c in eligible
                        if c.employee is not None and c.employee.id == employee.id]
        return False, None, ('closed' if eligible else 'nobody_available')

    wanted = start.strftime('%H:%M')
    match = next((slot for slot in slots if slot['time'] == wanted), None)
    if match is None:
        # A time the grid never offered — 14:07 on a quarter-hour grid, or a
        # start too late in the day for this basket to finish.
        return False, None, 'off_grid'
    if not match['available']:
        return False, None, match['reason'] or 'taken'

    if employee is not None:
        return True, Chair(employee), ''
    if barber is not None:
        return True, Chair(None), ''
    chair_id = match['employee_ids'][0]
    return True, Chair(SalonEmployee.objects.get(pk=chair_id)), ''
