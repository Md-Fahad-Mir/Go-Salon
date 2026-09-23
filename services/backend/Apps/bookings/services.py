"""Creating and moving appointments.

The double-booking guard lives here rather than in a view, because it has to
happen inside the same transaction as the write. A slot list is true when it
is fetched and two people can want four o'clock at once; the only honest place
to decide is at the moment of writing, with the row locked.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from Apps.tenants.provisioning import tenant_for
from Apps.users.exceptions import Conflict

from .availability import first_free_chair
from .models import (
    Appointment,
    AppointmentService,
    AppointmentStatus,
    CancelledBy,
    business_tz,
)
from .realtime import CREATED, UPDATED, publish
from .serializers import platform_fee


class SlotTaken(Conflict):
    default_code = 'slot_taken'


class NotBookable(Conflict):
    default_code = 'not_bookable'


class NotOnOffer(APIException):
    """A time the business never offered — not a clash with anybody.

    400 rather than 409: nothing is in conflict, the request simply named a
    start time that is not on the grid, or one outside the hours worked.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'not_on_offer'


#: Why a time could not be booked, in words the customer can act on. Answering
#: every one of these with "that time has just been taken" is what made a slot
#: nobody had booked look permanently held.
REFUSALS = {
    'off_grid': (NotOnOffer, 'off_grid',
                 'That is not one of the start times on offer. Pick a time from the list.'),
    'outside_hours': (NotOnOffer, 'outside_hours',
                      'Nobody is working then. Pick a time inside opening hours.'),
    'nobody_available': (NotOnOffer, 'nobody_available',
                         'Nobody here can do all of those together. Try fewer services, '
                         'or a different stylist.'),
    'closed': (NotOnOffer, 'closed',
               'They are not open then. Pick another day.'),
    'too_soon': (NotOnOffer, 'too_soon',
                 'That is too soon. Pick a later time so they can be ready for you.'),
    'taken': (SlotTaken, 'slot_taken',
              'That time has just been taken. Pick another one.'),
}


def _refuse(reason: str):
    # The code goes in through the constructor: DRF stamps it onto the
    # ErrorDetail there, and that is what the error handler reads back.
    kind, code, detail = REFUSALS.get(reason, REFUSALS['taken'])
    return kind(detail, code)


@dataclass(frozen=True)
class Line:
    """One line of a booking, at the price and length it was agreed for.

    A fresh booking's lines come off the live menu; a move's come off the rows
    already written. The two are the same shape on purpose — everything
    downstream prices and times a booking from lines, so neither path can read
    a number the customer never saw.
    """

    service: object | None
    name: str
    price: object
    duration_minutes: int
    buffer_minutes: int

    @classmethod
    def of(cls, service) -> 'Line':
        return cls(service, service.name, service.price,
                   service.duration_minutes, service.buffer_minutes)

    @classmethod
    def frozen(cls, item) -> 'Line':
        """From an `AppointmentService` row — what was agreed, not what the
        menu says today."""
        return cls(item.service, item.name, item.price,
                   item.duration_minutes, item.buffer_minutes)


def totals(lines) -> tuple:
    subtotal = sum((line.price for line in lines), start=0)
    fee = platform_fee()
    return subtotal, fee, subtotal + fee


def basket_minutes(lines) -> tuple[int, int]:
    """Time in the chair, and the prep that has to happen before it."""
    return (
        sum(line.duration_minutes for line in lines),
        sum(line.buffer_minutes for line in lines),
    )


def _accepts_automatically(*, salon=None, barber=None) -> bool:
    source = salon or barber
    return bool(getattr(source, 'auto_accept', True))


def _open_for_business(*, salon=None, barber=None) -> None:
    if barber is not None and not barber.accepting_clients:
        raise NotBookable('This barber is not taking new clients right now.',
                          code='not_accepting')


@transaction.atomic
def create_appointment(
    *, customer, salon=None, barber=None, services=(), day, start, chair=None,
    notes='', reschedule_of=None, lines=None,
) -> Appointment:
    """Books a slot, or refuses because somebody else just took it.

    `lines` is for a move, which carries its own agreed prices; leaving it out
    prices the basket off the live menu, which is right for a new booking.
    """
    _open_for_business(salon=salon, barber=barber)

    lines = list(lines) if lines is not None else [Line.of(s) for s in services]
    duration, buffer = basket_minutes(lines)
    if duration <= 0:
        raise NotBookable('Pick at least one service.', code='no_services')

    # Eligibility is a fact about the service today, so it reads the live rows
    # even when the money and the minutes come from the frozen ones.
    eligible = [line.service for line in lines if line.service is not None]

    # The business this booking is for, under its other name. Resolved before
    # the diary is consulted, because the diary is now read per tenant too.
    #
    # A move copies the tenant off the row it replaces rather than resolving
    # it again: the new row is the same booking at a different hour, and
    # `reschedule` below has already fixed its salon/barber to the old row's,
    # so re-deriving here could only ever introduce a disagreement.
    tenant = (
        reschedule_of.tenant if reschedule_of is not None
        else tenant_for({'salon': salon} if salon is not None else {'barber': barber})
    )

    # Re-checked here, under the transaction, against the live diary.
    free, picked, why = first_free_chair(
        tenant=tenant, salon=salon, barber=barber, day=day, start=start, duration=duration,
        buffer=buffer, services=eligible, employee=chair,
        exclude_appointment=reschedule_of.pk if reschedule_of else None,
    )
    if not free:
        raise _refuse(why)

    subtotal, fee, total = totals(lines)
    appointment = Appointment(
        customer=customer,
        salon=salon,
        barber=barber,
        tenant=tenant,
        employee=picked.employee if picked else None,
        status=(
            AppointmentStatus.APPROVED
            if _accepts_automatically(salon=salon, barber=barber)
            else AppointmentStatus.PENDING
        ),
        date=day,
        start_time=start,
        end_time=start,
        duration_minutes=duration,
        buffer_minutes=buffer,
        subtotal=subtotal,
        platform_fee=fee,
        total=total,
        notes=(notes or '').strip(),
        rescheduled_from=reschedule_of,
    )
    if appointment.status == AppointmentStatus.APPROVED:
        appointment.approved_at = timezone.now()
    appointment.save()

    AppointmentService.objects.bulk_create([
        AppointmentService(
            appointment=appointment,
            service=line.service,
            name=line.name,
            price=line.price,
            duration_minutes=line.duration_minutes,
            buffer_minutes=line.buffer_minutes,
        )
        for line in lines
    ])

    if reschedule_of is not None:
        reschedule_of.status = AppointmentStatus.RESCHEDULED
        reschedule_of.closed_at = timezone.now()
        reschedule_of.save(update_fields=['status', 'closed_at', 'updated_at'])
        # Two events, because a move is two facts: a slot given back and a
        # slot taken. A diary showing only the new one would keep the old
        # time on screen until somebody reloaded.
        publish(reschedule_of, UPDATED)

    publish(appointment, CREATED)
    return appointment


@transaction.atomic
def create_walk_in(
    *, salon=None, barber=None, services, chair=None,
    guest_name='', guest_phone='', customer=None, notes='',
) -> Appointment:
    """Somebody who came through the door, written down at the counter.

    Deliberately *not* `create_appointment`. That function's whole job is to
    defend the slot grid — is it far enough ahead, does it land on a boundary,
    is the chair free — and none of it applies to a person already standing in
    the shop. Refusing a walk-in because the grid says 14:07 is not a slot
    would be the app arguing with the room.

    What the two do share is the money and the minutes, so those helpers are
    reused and the rest is not. It lands approved: nobody needs to accept a
    customer who is already here.
    """
    _open_for_business(salon=salon, barber=barber)

    lines = [Line.of(s) for s in services]
    duration, buffer = basket_minutes(lines)
    if duration <= 0:
        raise NotBookable('Pick at least one service.', code='no_services')

    # The business's clock, not the server's. `timezone.localtime()` resolves
    # against Django's TIME_ZONE (UTC here), while `compute_times()` reads the
    # stored wall clock back as BUSINESS_TIME_ZONE — so localtime() baked the
    # whole offset in and filed every walk-in six hours in the past.
    now = timezone.now().astimezone(business_tz())
    subtotal, fee, total = totals(lines)
    appointment = Appointment(
        customer=customer,
        guest_name='' if customer else guest_name.strip(),
        guest_phone='' if customer else guest_phone.strip(),
        walk_in=True,
        salon=salon,
        barber=barber,
        # Same business, same resolution as a booked appointment. The walk-in
        # path takes its salon/barber from whoever is at the counter rather
        # than from the request, so this inherits that.
        tenant=tenant_for({'salon': salon} if salon is not None else {'barber': barber}),
        employee=chair,
        status=AppointmentStatus.APPROVED,
        approved_at=timezone.now(),
        date=now.date(),
        start_time=now.time().replace(second=0, microsecond=0),
        end_time=now.time(),
        duration_minutes=duration,
        # The prep never happened — they are in the chair now — so blocking the
        # diary before this minute would be inventing history.
        buffer_minutes=0,
        subtotal=subtotal,
        platform_fee=fee,
        total=total,
        notes=(notes or '').strip(),
    )
    appointment.full_clean(exclude=['end_time', 'starts_at', 'ends_at', 'blocked_from'])
    appointment.save()

    AppointmentService.objects.bulk_create([
        AppointmentService(
            appointment=appointment,
            service=line.service,
            name=line.name,
            price=line.price,
            duration_minutes=line.duration_minutes,
            buffer_minutes=line.buffer_minutes,
        )
        for line in lines
    ])

    publish(appointment, CREATED)
    return appointment


@transaction.atomic
def reschedule(appointment: Appointment, *, day, start, chair=None, by_customer: bool) -> Appointment:
    """Moves a booking by making a new one and linking the two.

    A new row rather than an edited one: the old time is a thing that happened,
    and a customer who asks "when was it before?" deserves an answer.
    """
    if not appointment.is_open:
        raise NotBookable('That booking can no longer be moved.', code='not_open')

    items = list(appointment.items.all())
    # Any line whose service has been retired, not just all of them: dropping
    # the gone ones and moving the rest silently shortened the appointment and
    # refunded work the customer still expected — and said 201 while doing it.
    if not items or any(item.service_id is None for item in items):
        raise NotBookable(
            'One of the services on this booking is no longer offered. '
            'Book again to pick from the current menu.',
            code='service_gone',
        )

    moved = create_appointment(
        customer=appointment.customer,
        salon=appointment.salon,
        barber=appointment.barber,
        lines=[Line.frozen(item) for item in items],
        day=day,
        start=start,
        chair=chair if chair is not None else (appointment.employee if not by_customer else None),
        notes=appointment.notes,
        reschedule_of=appointment,
    )

    # A move never changes business — the salon and barber above are copied
    # straight off the old row — so the new row's tenant has to be the old
    # row's too. `create_appointment` copies it rather than re-deriving it;
    # this checks the result rather than trusting the argument, because the
    # two ways of getting here silently disagreeing is exactly the kind of
    # drift a denormalised column invites.
    if moved.tenant_id != appointment.tenant_id:
        raise AssertionError(
            f'rescheduling appointment {appointment.pk} produced '
            f'{moved.pk} under tenant {moved.tenant_id}, but the booking it '
            f'replaces belongs to tenant {appointment.tenant_id}'
        )
    return moved


def cancel(appointment: Appointment, *, by_customer: bool, reason: str = '') -> Appointment:
    """Calls it off. A customer past the deadline never reaches here — the view
    turns that into a "ring them" answer instead."""
    if not appointment.is_open:
        raise NotBookable('That booking is already closed.', code='not_open')

    appointment.status = AppointmentStatus.CANCELLED
    appointment.cancel_reason = (reason or '').strip()[:300]
    appointment.cancelled_by = CancelledBy.CUSTOMER if by_customer else CancelledBy.BUSINESS
    appointment.closed_at = timezone.now()
    appointment.save(update_fields=[
        'status', 'cancel_reason', 'cancelled_by', 'closed_at', 'updated_at',
    ])
    publish(appointment, UPDATED)
    return appointment
