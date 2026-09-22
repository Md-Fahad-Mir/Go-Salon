"""Appointments: the chair, the hour, and what happened to it.

An appointment belongs to a **business** — a salon or an independent barber,
the same two kinds the directory lists — and, at a salon, to one **chair**.
Times are the business's own local times, because "ten o'clock" means ten
o'clock where the salon is; `starts_at` is the same instant as an aware
datetime, derived on save so nothing can drift out of step with `date` and
`start_time`.

A booked chair is blocked from `blocked_from` (the start, less whatever prep
the services need) to `ends_at`. Overlap is checked against that range, not
against the customer-visible one, or colour mixing would be double-sold.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


def business_tz() -> ZoneInfo:
    return ZoneInfo(getattr(settings, 'BUSINESS_TIME_ZONE', 'Asia/Dhaka'))


class AppointmentStatus(models.TextChoices):
    """Where an appointment has got to.

    `PENDING` only happens at a business that approves by hand; an auto-accept
    one goes straight to `APPROVED`. `RESCHEDULED` is what the *old* row
    becomes when a new one replaces it, so the history stays readable.
    """

    PENDING = 'pending', 'Waiting for approval'
    APPROVED = 'approved', 'Approved'
    REJECTED = 'rejected', 'Turned down'
    COMPLETED = 'completed', 'Completed'
    CANCELLED = 'cancelled', 'Cancelled'
    RESCHEDULED = 'rescheduled', 'Moved to another time'


#: Statuses that still hold a chair. Everything else has let it go, which is
#: what availability and the double-booking guard both key off.
LIVE_STATUSES = (AppointmentStatus.PENDING, AppointmentStatus.APPROVED)

#: Statuses a customer or a business can still act on.
OPEN_STATUSES = LIVE_STATUSES


class PaymentMethod(models.TextChoices):
    """How the salon was paid, recorded at the counter when the chair is freed.

    Blank is a real answer and the default: an appointment completed before
    this column existed, or completed without anybody saying how, has no method
    — which is not the same as cash, and the screens must not print one.
    """

    CASH = 'cash', 'Cash'
    BKASH = 'bkash', 'bKash'
    NAGAD = 'nagad', 'Nagad'
    ROCKET = 'rocket', 'Rocket'
    CARD = 'card', 'Card'


class CancelledBy(models.TextChoices):
    CUSTOMER = 'customer', 'The customer'
    BUSINESS = 'business', 'The business'


class AppointmentQuerySet(models.QuerySet):
    def live(self):
        return self.filter(status__in=LIVE_STATUSES)

    def for_business(self, *, salon=None, barber=None):
        return self.filter(salon=salon) if salon is not None else self.filter(barber=barber)

    def on(self, date):
        return self.filter(date=date)

    def upcoming(self):
        return self.filter(starts_at__gte=timezone.now())


class Appointment(models.Model):
    #: Null for a walk-in nobody has an account for — see `guest_name`. Every
    #: booking made *through* the app has one.
    customer = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, null=True, blank=True,
        related_name='appointments',
    )
    #: Somebody who came through the door instead of through the app. The
    #: salon writes their name down; a number is a courtesy, not a login, so
    #: no account is made and nothing here has to be unique.
    guest_name = models.CharField(max_length=60, blank=True)
    guest_phone = models.CharField(max_length=20, blank=True)
    #: Added at the counter rather than booked ahead. The chair may already be
    #: busy and the time is whatever the clock says, so this row is exempt from
    #: the slot grid — which is exactly why it has to be marked.
    walk_in = models.BooleanField(default=False)
    #: Exactly one of these, the same shape a `Service` uses for its owner.
    salon = models.ForeignKey(
        'users.Salon', on_delete=models.CASCADE, null=True, blank=True,
        related_name='appointments',
    )
    barber = models.ForeignKey(
        'users.BarberProfile', on_delete=models.CASCADE, null=True, blank=True,
        related_name='appointments',
    )
    #: Which chair is taking it. Null at a salon means nobody is assigned yet;
    #: for an independent barber there is only ever one pair of hands.
    employee = models.ForeignKey(
        'users.SalonEmployee', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='appointments',
    )
    #: The business this row belongs to. Backfilled from the salon/barber
    #: columns above and now required: every row has an owner, so every row
    #: has a tenant.
    #:
    #: CASCADE rather than SET_NULL, which a non-null column cannot use.
    #: A tenant is only ever deleted along with the salon or barber profile
    #: it belongs to (`Tenant.salon` and `Tenant.barber_profile` are both
    #: CASCADE), and that same deletion already takes these rows through
    #: their own owner column — so for every row this project deletes today
    #: the outcome is unchanged. PROTECT would not do: it raises even when
    #: the referencing rows are part of the same deletion, which would break
    #: deleting a salon at all.
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE,
        db_index=True, related_name='appointments',
    )

    status = models.CharField(
        max_length=12, choices=AppointmentStatus.choices,
        default=AppointmentStatus.PENDING, db_index=True,
    )

    #: The business's own local date and time — what everyone says out loud.
    date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    duration_minutes = models.PositiveSmallIntegerField(validators=[MinValueValidator(5)])
    #: Prep the chair needs before the customer sits down. Blocks the diary,
    #: never appears on the bill.
    buffer_minutes = models.PositiveSmallIntegerField(default=0)

    #: The same instants, aware, derived on save. Queried, never authored.
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField()
    blocked_from = models.DateTimeField()

    subtotal = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    platform_fee = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    #: Recorded at the counter. Blank means nobody said — see PaymentMethod.
    paid_with = models.CharField(
        max_length=10, choices=PaymentMethod.choices, blank=True, default='',
    )
    #: The stylist's, in full. Never part of the salon's revenue and never
    #: commissioned — it is money the customer handed to a person, not to a
    #: business, and every screen that reports it says so.
    tip = models.DecimalField(max_digits=9, decimal_places=2, default=0)

    notes = models.TextField(max_length=500, blank=True)
    #: Why it did not happen. Kept apart because they are different events with
    #: different audiences: one the business explains, one the customer does.
    reject_reason = models.CharField(max_length=300, blank=True)
    cancel_reason = models.CharField(max_length=300, blank=True)
    cancelled_by = models.CharField(max_length=10, choices=CancelledBy.choices, blank=True)

    #: The appointment this one replaced. The old row keeps its history and is
    #: marked `rescheduled`, so a customer can see where a booking went.
    rescheduled_from = models.OneToOneField(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='rescheduled_to',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    objects = AppointmentQuerySet.as_manager()

    class Meta:
        ordering = ('-starts_at',)
        indexes = [
            # Tenant-leading, because every business-side read is scoped to one
            # tenant first and narrowed by day, instant or state after it.
            models.Index(fields=('tenant', 'date')),
            models.Index(fields=('tenant', 'starts_at')),
            models.Index(fields=('tenant', 'status', 'date')),
            # Deliberately *not* tenant-leading. A customer's own diary spans
            # every salon they have joined — `access.scoped` answers it with
            # `filter(customer=user)` and no business filter at all — so a
            # tenant prefix here would put a column in front of the query that
            # the query never supplies.
            models.Index(fields=('customer', '-starts_at')),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(salon__isnull=False, barber__isnull=True)
                    | models.Q(salon__isnull=True, barber__isnull=False)
                ),
                name='appointment_has_exactly_one_business',
            ),
            # An appointment is always *somebody's*: an account, or a name
            # written down at the counter. Never neither.
            models.CheckConstraint(
                condition=(
                    models.Q(customer__isnull=False)
                    | ~models.Q(guest_name='')
                ),
                name='appointment_has_a_customer_or_a_name',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.customer_name} at {self.business_name} on {self.date} {self.start_time:%H:%M}'

    @property
    def customer_name(self) -> str:
        """Who this is for, account or not. Every screen wants one answer."""
        return self.customer.name if self.customer_id else self.guest_name

    @property
    def customer_phone(self) -> str:
        return self.customer.phone if self.customer_id else self.guest_phone

    # --- the business behind it -------------------------------------------

    @property
    def business_name(self) -> str:
        if self.salon_id:
            return self.salon.name
        return self.barber.display_name if self.barber_id else 'unassigned'

    @property
    def business_phone(self) -> str:
        """The number a customer rings when they cannot cancel online."""
        if self.salon_id:
            return self.salon.business_phone or self.salon.owner.phone
        if self.barber_id:
            return self.barber.contact_phone or self.barber.user.phone
        return ''

    @property
    def stylist_name(self) -> str:
        if self.employee_id:
            return self.employee.user.name
        if self.barber_id:
            return self.barber.user.name
        return ''

    @property
    def cancellation_window_hours(self) -> int:
        source = self.salon or self.barber
        return getattr(source, 'cancellation_window_hours', 2) if source else 2

    @property
    def cancel_deadline(self):
        return self.starts_at - timedelta(hours=self.cancellation_window_hours)

    def customer_may_cancel(self, now=None) -> bool:
        """Self-service cancellation is a courtesy with an edge: past the
        deadline a chair has been held and somebody should be told out loud."""
        if self.status not in OPEN_STATUSES:
            return False
        return (now or timezone.now()) < self.cancel_deadline

    @property
    def is_open(self) -> bool:
        return self.status in OPEN_STATUSES

    # --- derived times ------------------------------------------------------

    def compute_times(self) -> None:
        """Keeps the aware instants in step with the local date and time.

        The local pair is what a person authored; these three are what queries
        read. Deriving them here means they cannot disagree.
        """
        tz = business_tz()
        start = datetime.combine(self.date, self.start_time).replace(tzinfo=tz)
        self.starts_at = start
        self.ends_at = start + timedelta(minutes=self.duration_minutes)
        self.blocked_from = start - timedelta(minutes=self.buffer_minutes or 0)
        self.end_time = self.ends_at.astimezone(tz).time()

    def clean(self):
        super().clean()
        if bool(self.salon_id) == bool(self.barber_id):
            raise ValidationError('An appointment belongs to a salon or to a barber.')
        if self.salon_id and self.employee_id and self.employee.salon_id != self.salon_id:
            raise ValidationError({'employee': 'That chair belongs to another salon.'})

    def save(self, *args, **kwargs):
        if self.date and self.start_time and self.duration_minutes:
            self.compute_times()
        super().save(*args, **kwargs)


class AppointmentService(models.Model):
    """One line of the bill, copied at the time of booking.

    A salon can reprice or retire a service tomorrow; what a customer agreed to
    today does not change because of it. The link back to `Service` is kept for
    reporting and goes null rather than taking the line with it.
    """

    appointment = models.ForeignKey(
        Appointment, on_delete=models.CASCADE, related_name='items'
    )
    service = models.ForeignKey(
        'services.Service', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='appointment_items',
    )
    name = models.CharField(max_length=60)
    price = models.DecimalField(max_digits=8, decimal_places=2)
    duration_minutes = models.PositiveSmallIntegerField()
    buffer_minutes = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ('id',)

    def __str__(self) -> str:
        return f'{self.name} ({self.price})'


class NotificationKind(models.TextChoices):
    APPROVED = 'approved', 'Booking approved'
    REJECTED = 'rejected', 'Booking turned down'


class NotificationStatus(models.TextChoices):
    PENDING = 'pending', 'Not sent yet'
    SENT = 'sent', 'Handed to the gateway'
    FAILED = 'failed', 'The gateway refused it'


class AppointmentNotification(models.Model):
    """A record that the customer was told — or that telling them failed.

    Delivery is written down rather than assumed. A gateway that is down must
    not take an approval with it, so the send is tried, the outcome is stored,
    and the appointment stands either way.
    """

    appointment = models.ForeignKey(
        Appointment, on_delete=models.CASCADE, related_name='notifications'
    )
    kind = models.CharField(max_length=12, choices=NotificationKind.choices)
    to_phone = models.CharField(max_length=16)
    message = models.TextField()
    status = models.CharField(
        max_length=10, choices=NotificationStatus.choices, default=NotificationStatus.PENDING
    )
    #: Which `SMS_PROVIDER` handled it, so a failure can be traced to a vendor.
    provider = models.CharField(max_length=20, blank=True)
    error = models.CharField(max_length=300, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return f'{self.kind} to {self.to_phone} ({self.status})'
