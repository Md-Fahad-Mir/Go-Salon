"""Telling a customer what happened to their booking.

This is the same SMS abstraction the one-time codes go through — the provider
is whatever `SMS_PROVIDER` names, its credentials come from the environment,
and nothing here knows how a message reaches a phone.

Two rules:

  * **The outcome is written down.** Every attempt becomes an
    `AppointmentNotification` row with its status, the provider that handled
    it and, on failure, why. "We told them" is a claim that has to be checkable.
  * **A failed message never undoes the decision.** An approval is a fact about
    the appointment; a gateway being down does not change it. The send is
    tried, the failure is recorded, and the caller is told delivery failed
    without losing the approval.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.utils import timezone

from Apps.users.services.sms import SMSDeliveryError, get_sms_provider

from .models import AppointmentNotification, NotificationKind, NotificationStatus

logger = logging.getLogger(__name__)


def _money(amount) -> str:
    """Whole taka. Nobody quotes paisa for a haircut."""
    return f'BDT {amount:,.0f}'


def _when(appointment) -> str:
    return f'{appointment.date:%d %b} at {appointment.start_time:%I:%M %p}'.replace(' 0', ' ')


def _services(appointment) -> str:
    names = [item.name for item in appointment.items.all()]
    return ', '.join(names) if names else 'your appointment'


def approved_message(appointment) -> str:
    """Everything a person needs to turn up: where, who, what, when, how much."""
    parts = [
        f'{appointment.business_name}: your booking is confirmed.',
        f'{_services(appointment)}',
    ]
    if appointment.stylist_name:
        parts.append(f'with {appointment.stylist_name}')
    parts.append(_when(appointment))
    parts.append(_money(appointment.total))
    return ' - '.join(parts) + '.'


def rejected_message(appointment) -> str:
    reason = appointment.reject_reason.strip()
    text = (
        f'{appointment.business_name}: sorry, your booking for '
        f'{_services(appointment)} on {_when(appointment)} could not be taken.'
    )
    if reason:
        text += f' Reason: {reason}.'
    phone = appointment.business_phone
    if phone:
        text += f' Call {phone} to find another time.'
    return text


BUILDERS = {
    NotificationKind.APPROVED: approved_message,
    NotificationKind.REJECTED: rejected_message,
}


def notify(appointment, kind: str) -> AppointmentNotification:
    """Builds the message, tries to send it, and records what happened.

    Never raises. The caller has already changed the appointment; this is the
    telling, and a telling that fails is a row that says so.
    """
    phone = appointment.customer_phone
    message = BUILDERS[kind](appointment)
    record = AppointmentNotification.objects.create(
        appointment=appointment,
        kind=kind,
        to_phone=phone,
        message=message,
        provider=settings.SMS_PROVIDER,
        status=NotificationStatus.PENDING,
    )

    # A walk-in who did not leave a number. There is nobody to text, which is
    # a fact to record rather than a gateway call to make with an empty `to`.
    if not phone:
        record.status = NotificationStatus.FAILED
        record.error = 'No number on this walk-in.'
        record.save(update_fields=['status', 'error'])
        return record

    record.attempts = 1
    try:
        get_sms_provider().send(to=phone, message=message)
    except SMSDeliveryError as error:
        record.status = NotificationStatus.FAILED
        record.error = str(error)[:300]
        logger.warning('booking notification %s for %s failed', kind, appointment.pk)
    except Exception as error:  # a misconfigured provider must not lose the decision
        record.status = NotificationStatus.FAILED
        record.error = f'{type(error).__name__}: {error}'[:300]
        logger.exception('booking notification %s for %s could not be sent', kind, appointment.pk)
    else:
        record.status = NotificationStatus.SENT
        record.sent_at = timezone.now()

    record.save(update_fields=['status', 'error', 'attempts', 'sent_at'])
    return record
