"""Who may see and touch an appointment.

Four roles, four different answers, and one rule underneath all of them: an
appointment is only ever reachable through the queryset that already narrows
it to the caller. A detail view looks a row up *with* its ownership filter, so
somebody else's booking is a 404 — not a 403 that confirms it exists.
"""

from __future__ import annotations

from Apps.users.models import Role

from .models import Appointment


def scoped(user) -> tuple:
    """The appointments this account may read, and how it stands to them.

    Returns `(queryset, viewpoint)` where viewpoint is one of `customer`,
    `owner`, `barber`, `employee` or `none`.
    """
    base = Appointment.objects.select_related(
        'customer', 'salon', 'salon__owner', 'barber', 'barber__user',
        'employee', 'employee__user', 'rescheduled_from',
        # The review of the visit, so a list of bookings does not become one
        # extra query per row asking whether it has been rated.
        'review', 'review__replied_by',
    ).prefetch_related('items')

    if user.role == Role.CUSTOMER:
        return base.filter(customer=user), 'customer'

    if user.role == Role.SALON_OWNER:
        return base.filter(salon__owner=user), 'owner'

    if user.role == Role.BARBER:
        profile = getattr(user, 'barber_profile', None)
        if profile is None:
            return base.none(), 'none'
        # An independent barber sees their own diary. If they have also been
        # hired somewhere, the chair they sit in at that salon is theirs too.
        employment = user.employments.filter(is_active=True).first()
        query = base.filter(barber=profile)
        if employment is not None:
            query = base.filter(barber=profile) | base.filter(employee=employment)
        return query.distinct(), 'barber'

    if user.role == Role.SALON_EMPLOYEE:
        employment = user.employments.filter(is_active=True).first()
        if employment is None:
            return base.none(), 'none'
        # Only what is assigned to them. The rest of the salon's diary is the
        # owner's business, not theirs.
        return base.filter(employee=employment), 'employee'

    return base.none(), 'none'


def is_customer_of(appointment: Appointment, user) -> bool:
    return appointment.customer_id == user.id


def runs_business(appointment: Appointment, user) -> bool:
    """True for the people who can approve, reject and complete it.

    The owner of the salon, the barber whose diary it is, or — for a booking
    assigned to them — the person in the chair. An employee managing their own
    appointments is not the same as an employee managing the salon.
    """
    if appointment.salon_id and appointment.salon.owner_id == user.id:
        return True
    if appointment.barber_id and appointment.barber.user_id == user.id:
        return True
    if appointment.employee_id and appointment.employee.user_id == user.id:
        return True
    return False


def business_of(user):
    """The salon or barber profile this account takes bookings for, if any."""
    if user.role == Role.SALON_OWNER:
        salon = user.salons.first()
        return {'salon': salon} if salon else None
    if user.role == Role.BARBER:
        profile = getattr(user, 'barber_profile', None)
        return {'barber': profile} if profile else None
    return None
