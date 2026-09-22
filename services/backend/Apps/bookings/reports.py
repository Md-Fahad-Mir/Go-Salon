"""What the business made, answered by the database rather than by the phone.

Both screens these serve — the owner's Analytics and an employee's Performance
— used to sum rows the client had already downloaded. That was wrong in three
ways at once, and each of them failed quietly:

  - The diary list is `query[:200]` ordered `-starts_at`, so the rows a client
    holds are the *furthest future* ones. A busy salon's completed history is
    the first thing to fall off the end, and every total on the screen was too
    low with nothing to say so.
  - The window was built from the device clock. The project runs `TIME_ZONE`
    UTC with `BUSINESS_TIME_ZONE` Asia/Dhaka, so a phone anywhere else shifted
    the whole week by a day.
  - It could only ever report on what the client was allowed to download, which
    is not the same question as what the business took.

So the aggregation lives here, every query starts from `access.scoped(user)`,
and no caller can widen what a role may see by asking a different question.

WHICH DAY A COMPLETED APPOINTMENT COUNTS ON

`date` is the day the chair was booked; `completed_at` is the moment somebody
marked the work done and took the money. They are not the same day, and in this
database they are routinely weeks apart. Revenue is bucketed by
**`completed_at`, converted to the salon's own clock** — money is taken on the
day it is taken. Bucketing by `date` would let a completed appointment booked
for next month land in a window before it had happened, and would make "this
week's takings" a statement about the diary rather than about the till.

WHAT THE MONEY MEANS

  revenue       `Sum(subtotal)` — the services, at the salon's own prices.
  platform_fees `Sum(platform_fee)` — the fee actually charged on each row, not
                recomputed from a setting that may since have moved.
  tips          `Sum(tip)` — reported, never added to revenue and never
                commissioned. A tip is the stylist's.

`total` (subtotal + fee) is deliberately not the revenue basis: the fee is the
platform's, and an owner counting it as theirs is being told they earned money
they never received — and then charged commission on it.
"""

from __future__ import annotations

from datetime import date as date_cls, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate

from Apps.users.serializers import active_employment

from .access import scoped
from .models import Appointment, AppointmentStatus, PaymentMethod, business_tz

#: Every money sum needs the same zero: `Sum` over no rows is NULL, and a
#: screen showing "—" where it should show ৳0 reads as broken rather than quiet.
_MONEY = DecimalField(max_digits=12, decimal_places=2)


def _zero(expression):
    return Coalesce(expression, Value(Decimal('0')), output_field=_MONEY)


def _taka(value) -> str:
    """A money figure as a decimal string, always at two places.

    Django quantizes a decimal it reads straight off a column and leaves one an
    expression computed exactly as the database returned it, so `Sum` came back
    as `900` while the `Coalesce` zero came back as `0.00`. One series then
    carried two spellings of a taka, and a screen printing what it was handed
    showed "৳900" under "৳0.00". The numbers were right; the contract was not.
    """
    return str(Decimal(value).quantize(Decimal('0.01')))


def business_now():
    """Now, on the salon's clock."""
    from django.utils import timezone

    return timezone.now().astimezone(business_tz())


def window(period: str, today: date_cls | None = None) -> tuple[date_cls, date_cls]:
    """The first and last business day a period covers, inclusive.

    A week is the trailing seven days ending today, because that is what an
    owner glancing at "this week" means — not a calendar week that resets to
    almost nothing every Sunday morning. A month runs from the 1st to today,
    for the same reason: a month-to-date figure is the one you can act on.
    """
    today = today or business_now().date()
    if period == 'month':
        return today.replace(day=1), today
    return today - timedelta(days=6), today


def _completed(user, start: date_cls, end: date_cls):
    """Completed work in the window, already narrowed to what this account may
    see. The bucket is `completed_at` on the salon's clock — see the module
    docstring — so the filter has to be a datetime range, not a date range."""
    query, viewpoint = scoped(user)
    from datetime import datetime, time

    tz = business_tz()

    first = datetime.combine(start, time.min, tzinfo=tz)
    last = datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz)
    return (
        query.filter(
            status=AppointmentStatus.COMPLETED,
            completed_at__gte=first,
            completed_at__lt=last,
        ),
        viewpoint,
    )


def _series(rows, start: date_cls, end: date_cls) -> list[dict]:
    """One entry per day in the window, zeros included.

    A chart that only carries the days something happened on is a chart with a
    different x-axis every time you look at it.
    """
    tz = business_tz()
    taken = {
        entry['day']: entry
        for entry in rows.annotate(day=TruncDate('completed_at', tzinfo=tz))
        .values('day')
        .annotate(revenue=_zero(Sum('subtotal')), bookings=Count('id'))
    }
    out = []
    day = start
    while day <= end:
        hit = taken.get(day)
        out.append({
            'date': day.isoformat(),
            'revenue': _taka(hit['revenue']) if hit else '0.00',
            'bookings': hit['bookings'] if hit else 0,
        })
        day += timedelta(days=1)
    return out


def _headline(rows) -> dict:
    totals = rows.aggregate(
        revenue=_zero(Sum('subtotal')),
        fees=_zero(Sum('platform_fee')),
        tips=_zero(Sum('tip')),
        bookings=Count('id'),
    )
    bookings = totals['bookings']
    average = (totals['revenue'] / bookings) if bookings else Decimal('0')
    return {
        'revenue': _taka(totals['revenue']),
        'platform_fees': _taka(totals['fees']),
        'tips': _taka(totals['tips']),
        'bookings': bookings,
        #: To the whole taka on purpose: a ticket is not priced in poisha.
        'average_ticket': str(average.quantize(Decimal('1'))),
    }


def _repeat(rows) -> dict:
    """How many of these were someone who had been here before.

    "Before" means an earlier *completed* appointment at the same business, by
    the same identity — a signed-in customer by account, a walk-in by the phone
    number taken at the counter. Ordered by `starts_at` with the primary key as
    the tiebreak, so two appointments at the same minute still have an order.

    The business match has to be the pair, never `salon_id` alone: a barber
    working alone has `salon_id IS NULL` on every row, and matching on that
    would make every barber's customers each other's regulars.
    """
    known = 0
    # No `.only()` here: `scoped()` hands back a select_related queryset, and
    # Django refuses a field that is both deferred and traversed.
    for appointment in rows:
        same_business = Q(salon_id=appointment.salon_id, salon_id__isnull=False) | Q(
            barber_id=appointment.barber_id, barber_id__isnull=False,
        )
        if appointment.customer_id:
            who = Q(customer_id=appointment.customer_id)
        elif appointment.guest_phone:
            who = Q(guest_phone=appointment.guest_phone)
        else:
            continue  # No identity to match on — counts as neither.
        earlier = (
            Q(starts_at__lt=appointment.starts_at)
            | Q(starts_at=appointment.starts_at, pk__lt=appointment.pk)
        )
        if (
            Appointment.objects.filter(same_business)
            .filter(who)
            .filter(earlier)
            .filter(status=AppointmentStatus.COMPLETED)
            .exists()
        ):
            known += 1
    total = rows.count()
    return {
        'repeat': known,
        'first_time': total - known,
        'repeat_share': round(known / total * 100) if total else 0,
    }


def _by_payment(rows) -> list[dict]:
    """Split by how it was paid, with what nobody recorded kept separate.

    A blank method is not cash. Reporting it as cash would invent a fact about
    the till, so it comes back under its own id and the screens label it.

    The unknown ones are folded together *after* the grouping, not relabelled
    row by row: a blank and a method since retired from the menu are two
    different strings in the column and one fact on the screen, and leaving
    them apart put two rows called "unrecorded" in the same list.
    """
    grouped = (
        rows.values('paid_with')
        .annotate(revenue=_zero(Sum('subtotal')), bookings=Count('id'))
        .order_by('-revenue')
    )
    known = {method for method, _ in PaymentMethod.choices}
    named: list[dict] = []
    unrecorded = {'method': 'unrecorded', 'revenue': Decimal('0'), 'bookings': 0}
    for entry in grouped:
        if entry['paid_with'] in known:
            named.append({
                'method': entry['paid_with'],
                'revenue': entry['revenue'],
                'bookings': entry['bookings'],
            })
        else:
            unrecorded['revenue'] += entry['revenue']
            unrecorded['bookings'] += entry['bookings']

    if unrecorded['bookings']:
        named.append(unrecorded)
    named.sort(key=lambda row: row['revenue'], reverse=True)
    return [
        {'method': row['method'], 'revenue': _taka(row['revenue']), 'bookings': row['bookings']}
        for row in named
    ]


def _by_service(rows) -> list[dict]:
    """Revenue per service, from the line items rather than the appointment.

    The name is the one frozen on the line, so a service that has since been
    renamed or deleted still reports under what it was sold as.
    """
    from .models import AppointmentService

    lines = AppointmentService.objects.filter(appointment__in=rows)
    grouped = (
        lines.values('name')
        .annotate(revenue=_zero(Sum('price')), bookings=Count('id'))
        .order_by('-revenue')
    )
    return [
        {'name': entry['name'], 'revenue': _taka(entry['revenue']), 'bookings': entry['bookings']}
        for entry in grouped
    ]


def _by_staff(rows) -> tuple[list[dict], dict]:
    """Revenue per chair, and what was taken with no chair assigned.

    The unassigned bucket comes back on its own rather than as a row in the
    ranking: it is not a person, it must not take the top slot, and the
    arithmetic has to reconcile with the headline.

    Commission is computed at the rate on the employment *today*, and the rate
    is returned with each row so the screen can say so. Nothing records what the
    split was when the work was done, so presenting it as history would be a
    claim this database cannot support.
    """
    grouped = (
        rows.filter(employee__isnull=False)
        .values(
            'employee_id',
            name=F('employee__user__name'),
            rate=F('employee__commission_rate'),
        )
        .annotate(revenue=_zero(Sum('subtotal')), bookings=Count('id'))
        .order_by('-revenue')
    )
    staff = []
    for entry in grouped:
        revenue = entry['revenue']
        rate = entry['rate'] or 0
        staff.append({
            'employee_id': str(entry['employee_id']),
            'name': entry['name'] or '',
            'revenue': _taka(revenue),
            'bookings': entry['bookings'],
            'commission_rate': rate,
            'commission': str((revenue * Decimal(rate) / Decimal(100)).quantize(Decimal('1'))),
        })

    loose = rows.filter(employee__isnull=True).aggregate(
        revenue=_zero(Sum('subtotal')), bookings=Count('id'),
    )
    return staff, {'revenue': _taka(loose['revenue']), 'bookings': loose['bookings']}


def analytics(user, period: str) -> dict:
    """Everything the owner's Analytics screen shows, for one period."""
    start, end = window(period)
    rows, viewpoint = _completed(user, start, end)
    staff, unassigned = _by_staff(rows)
    return {
        'viewpoint': viewpoint,
        'period': period,
        'from': start.isoformat(),
        'to': end.isoformat(),
        'headline': _headline(rows),
        'returning': _repeat(rows),
        'series': _series(rows, start, end),
        'by_staff': staff,
        'unassigned': unassigned,
        'by_service': _by_service(rows),
        'by_payment': _by_payment(rows),
    }


def performance(user, period: str) -> dict:
    """Everything an employee's Performance screen shows, for one period.

    `scoped()` has already narrowed this to the employee's own chair, so there
    is nothing here to widen: the same call for an owner would return the whole
    salon, which is why the view refuses any viewpoint but `employee`.
    """
    start, end = window(period)
    rows, viewpoint = _completed(user, start, end)
    employment = active_employment(user)
    rate = employment.commission_rate if employment else None

    head = _headline(rows)
    revenue = Decimal(head['revenue'])
    share = (
        (revenue * Decimal(rate) / Decimal(100)).quantize(Decimal('1'))
        if rate is not None
        else None
    )
    return {
        'viewpoint': viewpoint,
        'period': period,
        'from': start.isoformat(),
        'to': end.isoformat(),
        'headline': head,
        'series': _series(rows, start, end),
        'by_service': _by_service(rows),
        'commission_rate': rate,
        #: At today's rate, not the rate on the day — see `_by_staff`.
        'commission': str(share) if share is not None else None,
        'salon': employment.salon.name if employment else None,
    }
