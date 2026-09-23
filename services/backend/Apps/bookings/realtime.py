"""Telling the right people, the moment a booking changes.

REST stays the source of truth. Nothing here decides anything: a socket only
carries a copy of a row that has already been written, so a client that misses
an event and re-reads the list is never wrong, only later.

Two rules hold this together.

**Who hears it is decided by the same code that decides who may read it.** The
candidates for an appointment are obvious — the customer, the salon's owner,
the barber whose diary it is, the chair it was given to — but rather than
trusting that list, each candidate is put back through `access.scoped` and
kept only if the row comes back. A broadcast can therefore never reach
somebody the API would answer with a 404, and there is no second copy of the
permission rules to drift out of step with the first.

**An event is sent per recipient, not per room.** The `booking` inside the
payload is the very same serializer the REST endpoints return, rendered once
for each person, because `can` is a statement about the reader: the owner may
approve this booking and the customer may not, and one shared message could
only be wrong for one of them.

Around it the envelope carries what the *delivery* is, rather than what the
row is: `type`, `event`, and `tenant_id` — which business this concerns, so a
client showing one salon at a time can tell whether an arriving event belongs
on the screen in front of it. Every recipient is a verified member of that
tenant before anything is sent, because `recipients` keeps only the people
`scoped` would serve the row to, and `scoped` refuses a non-member outright.
"""

from __future__ import annotations

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

from .access import scoped
from .serializers import AppointmentSerializer

logger = logging.getLogger(__name__)

#: What happened to the row. `created` is a booking that did not exist before;
#: everything else — approved, rejected, cancelled, completed, moved — is the
#: same row in a new state, and the client replaces what it holds.
CREATED = 'created'
UPDATED = 'updated'


def group_for(user_id: int) -> str:
    """One group per account.

    Not per salon and not per chair: an employee promoted, a barber who also
    rents a chair somewhere, an owner with two salons — each of those makes a
    room-shaped group either leak or miss. An account is the one thing that
    maps exactly onto "may this person see it".
    """
    return f'bookings.user.{user_id}'


class _Viewer:
    """Stands in for the request `AppointmentSerializer` expects.

    It reads `context['request'].user` and nothing else, to work out what this
    caller may do next. There is no request behind a broadcast, so the reader
    is supplied directly.
    """

    def __init__(self, user):
        self.user = user


def _candidates(appointment) -> list:
    """Everyone an appointment plausibly concerns, in no particular order."""
    people = [appointment.customer]
    if appointment.salon_id:
        people.append(appointment.salon.owner)
    if appointment.barber_id:
        people.append(appointment.barber.user)
    if appointment.employee_id:
        people.append(appointment.employee.user)

    seen: set[int] = set()
    unique = []
    for person in people:
        if person is not None and person.id not in seen:
            seen.add(person.id)
            unique.append(person)
    return unique


def recipients(appointment) -> list:
    """The candidates who would actually be served this row by the API."""
    allowed = []
    for person in _candidates(appointment):
        # The event carries its own tenant, so this needs no ambient
        # context — and cannot disagree with the row being broadcast.
        query, _ = scoped(person, appointment.tenant)
        if query.filter(pk=appointment.pk).exists():
            allowed.append(person)
    return allowed


def _send(appointment, event: str) -> None:
    layer = get_channel_layer()
    if layer is None:
        return
    for person in recipients(appointment):
        payload = {
            'type': 'booking',
            'event': event,
            # Which business this concerns. On the envelope rather than inside
            # `booking`, because it is a fact about the delivery and not about
            # the row: a client with a salon switcher asks "is this event for
            # the salon I am looking at?", and that question is answered by
            # comparing this against the tenant it last sent in `X-Tenant-Id`.
            #
            # The alternative was to let the client derive it from
            # `booking.listing_id`, and there is no sound way to: the tenant
            # slug is name-derived rather than `salon-<pk>`, `Salon.name` is
            # not unique, and the one payload carrying both keys is the
            # directory, which is being withdrawn. Deriving it would mean
            # guessing which business a row belongs to — the exact bug class
            # `scoped` exists to remove.
            #
            # Never null: `Appointment.tenant` is NOT NULL as of
            # `bookings.0008`, so every row broadcast has one.
            'tenant_id': appointment.tenant_id,
            'booking': dict(
                AppointmentSerializer(appointment, context={'request': _Viewer(person)}).data
            ),
        }
        async_to_sync(layer.group_send)(
            group_for(person.id), {'type': 'booking.event', 'payload': payload}
        )


def publish(appointment, event: str = UPDATED) -> None:
    """Announces a change once the transaction that made it has landed.

    Held until commit so a booking that loses the race for a slot — the write
    rolls back — is never announced as made. And it never raises: a channel
    layer that is down must not take an approval with it, the same rule the
    SMS notifications follow. The row is written either way; the dashboards
    catch up on their next read.
    """

    def announce() -> None:
        try:
            _send(appointment, event)
        except Exception:
            logger.exception('Could not broadcast booking %s (%s)', appointment.pk, event)

    transaction.on_commit(announce)
