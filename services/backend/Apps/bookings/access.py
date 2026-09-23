"""Who may see and touch an appointment.

Four roles, four different answers, and two rules underneath all of them.

**A caller only ever sees one tenant at a time.** `scoped` takes the tenant the
request is about and filters every branch by it — the customer branch included.
There is no marketplace and no cross-tenant read to preserve: a customer who
has joined three salons is acting in exactly one of them at any moment, and
their booking list means the bookings they have *there*.

**Belonging to that tenant is checked here, not upstream.** It would be
tempting to leave membership to a permission class, but `scoped` has a caller
with no request behind it at all: `realtime.recipients` runs inside a
`transaction.on_commit` callback and re-runs every broadcast candidate through
this function precisely so that a socket can never deliver a row the API would
answer with a 404. That invariant only holds while this function embodies the
*whole* rule, so the membership test lives here and every caller inherits it.

A caller who does not belong to the tenant gets `none()`, the same answer an
unrecognised role has always got. Not an exception: this is a question about
which rows exist for somebody, and "none of them" is a complete answer.
"""

from __future__ import annotations

# The membership rule lives in `Apps.tenants.context` so that this module
# and the request layer cannot come to disagree about it. Re-exported here
# because `scoped` below is written against it and callers read it from
# this module historically.
from Apps.tenants.context import belongs_to  # noqa: F401
from Apps.users.models import Role

from .models import Appointment




def scoped(user, tenant) -> tuple:
    """The appointments this account may read here, and how it stands to them.

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

    # Before role, before anything: does this account stand in this tenant?
    if not belongs_to(user, tenant):
        return base.none(), 'none'

    # Every branch below is narrowed to the tenant as well as to the caller.
    # The two are not the same question — a salon owner belongs to their own
    # tenant and owns their own salon, but an appointment could in principle
    # carry a tenant that disagrees with its salon, and this is not the place
    # to find out. Filtering on both means neither alone has to be trusted.
    base = base.filter(tenant=tenant)

    if user.role == Role.CUSTOMER:
        return base.filter(customer=user), 'customer'

    if user.role == Role.SALON_OWNER:
        return base.filter(salon__owner=user), 'owner'

    if user.role == Role.BARBER:
        profile = getattr(user, 'barber_profile', None)
        if profile is None:
            return base.none(), 'none'
        # An independent barber sees their own diary. If they have also been
        # hired somewhere, the chair they sit in at that salon is theirs too —
        # though only when *this* tenant is the one they sit in, which the
        # filter above has already settled.
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


def business_of(user, tenant):
    """The salon or barber profile this account takes bookings for, here.

    Read off the tenant rather than off the account, which is the difference
    that matters: `user.salons.first()` picks whichever salon sorts first by
    name, and an owner with two would silently get the wrong one. The tenant
    already names exactly one business, so there is nothing to choose.

    Note this function currently has no callers — it was written for a view
    that never arrived. It is updated rather than deleted so that it cannot be
    picked up later in its old, tenant-blind shape.
    """
    if not belongs_to(user, tenant):
        return None
    if tenant.salon_id and user.role == Role.SALON_OWNER:
        return {'salon': tenant.salon}
    if tenant.barber_profile_id and user.role == Role.BARBER:
        return {'barber': tenant.barber_profile}
    return None
