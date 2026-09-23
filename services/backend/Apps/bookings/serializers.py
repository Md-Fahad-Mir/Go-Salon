"""Appointments, in and out."""

from __future__ import annotations

from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from Apps.services.models import Service
from Apps.tenants.context import business_of_tenant, tenant_of_request
from Apps.users.models import BarberProfile, Role, Salon, SalonEmployee, User
from Apps.users.phone import normalize_phone

from .models import Appointment, AppointmentStatus, business_tz


def horizon_days() -> int:
    return getattr(settings, 'BOOKING_HORIZON_DAYS', 60)


def business_today():
    """Today where the salon is, not where the server is."""
    return timezone.now().astimezone(business_tz()).date()


class SlotTimeField(serializers.TimeField):
    """A start time on the booking grid.

    Seconds are dropped rather than honoured. The grid is built and matched at
    minute resolution, so 14:00:30 passed the '%H:%M' check as "14:00" and was
    then stored with its seconds — which pushed the booking's end past 15:00
    and quietly swallowed the next slot for everybody else.
    """

    def __init__(self, **kwargs):
        kwargs.setdefault('input_formats', ['%H:%M', '%H:%M:%S'])
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        return value.replace(second=0, microsecond=0)


def platform_fee() -> int:
    return getattr(settings, 'BOOKING_PLATFORM_FEE', 20)


def parse_listing(value: str, tenant):
    """`salon-3` / `barber-9` — the same ids the directory hands out, so a
    customer books the listing they were looking at.

    The id is a bare primary key supplied by the client, and nothing used to
    check that it named a business the caller had any business with: anyone
    signed in could read any salon's slot-by-slot occupancy, chair ids and all
    (audit finding H1). `tenant` is what closes that — a listing outside it is
    a 403, not a lookup.

    The check lives here, in the one function both availability and booking
    creation already share, rather than being written twice and kept in step
    by hand.

    **A `None` tenant refuses everything.** It used to mean "do not check",
    which read as harmless while every caller had a tenant — and stopped being
    harmless the moment an account with *no* tenant could reach this. A
    platform admin, or a customer who has joined nowhere, could name any salon
    and be handed its whole week. No tenant is not permission to see
    everything; it is permission to see nothing.
    """
    kind, _, raw = (value or '').partition('-')
    if not raw.isdigit():
        return None

    if kind == 'salon':
        business = Salon.objects.filter(pk=int(raw)).select_related('owner').first()
    elif kind == 'barber':
        business = BarberProfile.objects.filter(pk=int(raw)).select_related('user').first()
    else:
        return None

    if business is None:
        return None

    # Not found-then-refused as two different answers: a listing outside the
    # caller's tenant is refused whether or not it exists, so this cannot be
    # used to discover which ids are real.
    if (tenant is None
            or getattr(business, 'tenant', None) is None
            or business.tenant.pk != tenant.pk):
        raise PermissionDenied(
            'That salon is not the one you are signed in to.',
            code='wrong_tenant',
        )
    return business


def listing_id(appointment: Appointment) -> str:
    return f'salon-{appointment.salon_id}' if appointment.salon_id else f'barber-{appointment.barber_id}'


class AppointmentItemSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    service_id = serializers.IntegerField(source='service_id', read_only=True)
    name = serializers.CharField(read_only=True)
    price = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    duration_minutes = serializers.IntegerField(read_only=True)


class AppointmentSerializer(serializers.ModelSerializer):
    """One appointment as every role reads it.

    The same shape for a customer and for the salon, because they are looking
    at the same fact; what differs is which actions the server says are open,
    and that is `can_*` rather than a different payload.
    """

    listing_id = serializers.SerializerMethodField()
    business_name = serializers.CharField(read_only=True)
    business_phone = serializers.CharField(read_only=True)
    stylist_name = serializers.CharField(read_only=True)
    #: The model answers this for an account and for a walk-in alike.
    customer_name = serializers.CharField(read_only=True)
    customer_phone = serializers.CharField(read_only=True)
    employee_id = serializers.IntegerField(read_only=True, allow_null=True)
    items = serializers.SerializerMethodField()
    can = serializers.SerializerMethodField()
    cancel_deadline = serializers.DateTimeField(read_only=True)
    rescheduled_from_id = serializers.IntegerField(read_only=True, allow_null=True)
    rescheduled_to_id = serializers.SerializerMethodField()
    review = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = (
            'id', 'status', 'listing_id', 'business_name', 'business_phone',
            'stylist_name', 'employee_id', 'customer_name', 'customer_phone',
            'walk_in',
            'date', 'start_time', 'end_time', 'duration_minutes', 'buffer_minutes',
            'starts_at', 'subtotal', 'platform_fee', 'total',
            # What the counter recorded when the work was closed off. Both are
            # written by `/complete/` and were missing from the payload, so a
            # second device — or the owner watching the salon queue — never
            # learned how a booking was paid, and the value was lost on
            # sign-out. A blank `paid_with` is "nobody said", never cash.
            'paid_with', 'tip',
            'notes',
            'reject_reason', 'cancel_reason', 'cancelled_by',
            'cancellation_window_hours', 'cancel_deadline',
            'rescheduled_from_id', 'rescheduled_to_id',
            'items', 'can', 'review', 'created_at', 'approved_at', 'completed_at',
        )
        read_only_fields = fields

    def get_listing_id(self, appointment) -> str:
        return listing_id(appointment)

    def get_items(self, appointment) -> list[dict]:
        return [
            {
                'id': item.id,
                'service_id': item.service_id,
                'name': item.name,
                'price': float(item.price),
                'duration_minutes': item.duration_minutes,
            }
            for item in appointment.items.all()
        ]

    def get_review(self, appointment):
        """The review of this visit, if there is one — for both sides of it.

        The customer needs it so the screen stops inviting them to write a
        second one; the salon needs it so it can answer. It lives on the
        appointment rather than in a list of its own because that is the only
        place either screen already has the row.
        """
        from Apps.reviews.serializers import ReviewSerializer

        review = getattr(appointment, 'review', None)
        if review is None:
            return None
        # Context carried through so the review's own `can_reply` is answered
        # for whoever is reading the booking, not left False by default.
        return ReviewSerializer(review, context=self.context).data

    def get_rescheduled_to_id(self, appointment):
        moved = getattr(appointment, 'rescheduled_to', None)
        return moved.id if moved else None

    def get_can(self, appointment) -> dict:
        """What this caller may do next.

        Worked out on the server so a screen never has to reimplement the
        rules — and never offers a button the API would refuse.
        """
        from .access import is_customer_of, runs_business

        user = self.context['request'].user
        mine = is_customer_of(appointment, user)
        business = runs_business(appointment, user)
        open_now = appointment.is_open

        return {
            'approve': bool(business and appointment.status == AppointmentStatus.PENDING),
            'reject': bool(business and appointment.status == AppointmentStatus.PENDING),
            'complete': bool(business and appointment.status == AppointmentStatus.APPROVED),
            'cancel': bool(open_now and (business or (mine and appointment.customer_may_cancel()))),
            'reschedule': bool(open_now and (mine or business)),
            # Past the deadline a customer rings instead, and the number is
            # already on the record so the screen has something to dial.
            'call_to_cancel': bool(mine and open_now and not appointment.customer_may_cancel()),
            # Only the person who sat in the chair, only once the work is
            # done, and only once. The screen reads this instead of keeping a
            # local flag that a refresh would wipe.
            'review': bool(
                mine
                and appointment.status == AppointmentStatus.COMPLETED
                and getattr(appointment, 'review', None) is None
            ),
        }


class AvailabilityQuerySerializer(serializers.Serializer):
    listing = serializers.CharField()
    date = serializers.DateField()
    service_ids = serializers.CharField(required=False, allow_blank=True)
    employee = serializers.IntegerField(required=False, allow_null=True)
    #: Set when moving an existing booking, so its own slot is not reported
    #: as taken by itself.
    exclude = serializers.IntegerField(required=False, allow_null=True)

    def validate_listing(self, value: str):
        business = parse_listing(
            value, tenant_of_request(self.context.get('request')))
        if business is None:
            raise serializers.ValidationError(
                [serializers.ErrorDetail('No such salon or barber.', code='not_found')]
            )
        return business

    def validate_service_ids(self, value: str) -> list[int]:
        if not value:
            return []
        try:
            return [int(part) for part in value.split(',') if part.strip()]
        except ValueError:
            raise serializers.ValidationError(
                [serializers.ErrorDetail('Service ids must be numbers.', code='invalid')]
            ) from None


class BookingCreateSerializer(serializers.Serializer):
    listing = serializers.CharField()
    date = serializers.DateField()
    time = SlotTimeField()
    service_ids = serializers.ListField(
        child=serializers.IntegerField(), allow_empty=False, max_length=10
    )
    #: Which chair. Left out means "any" — the server picks a free one.
    employee = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')
    #: Set when this booking replaces one the customer already had.
    reschedule_of = serializers.IntegerField(required=False, allow_null=True)

    def validate_listing(self, value: str):
        business = parse_listing(
            value, tenant_of_request(self.context.get('request')))
        if business is None:
            raise serializers.ValidationError(
                [serializers.ErrorDetail('No such salon or barber.', code='not_found')]
            )
        return business

    def validate(self, attrs: dict) -> dict:
        business = attrs['listing']
        salon = business if isinstance(business, Salon) else None
        barber = business if isinstance(business, BarberProfile) else None

        # The same horizon the calendar advertises. Availability refused to
        # *offer* a date past it while create happily took one, so a booking
        # four hundred days out was accepted against a week nobody has planned.
        horizon = business_today() + timedelta(days=horizon_days())
        if attrs['date'] > horizon:
            raise serializers.ValidationError(
                {'date': [serializers.ErrorDetail(
                    f'Bookings open {horizon_days()} days ahead.', code='beyond_horizon')]}
            )
        if attrs['date'] < business_today():
            raise serializers.ValidationError(
                {'date': [serializers.ErrorDetail(
                    'That day has already been.', code='in_the_past')]}
            )

        services = list(
            Service.objects.filter(id__in=attrs['service_ids'], is_active=True)
            .filter(salon=salon) if salon is not None
            else Service.objects.filter(id__in=attrs['service_ids'], is_active=True, barber=barber)
        )
        if len(services) != len(set(attrs['service_ids'])):
            raise serializers.ValidationError(
                {'service_ids': [serializers.ErrorDetail(
                    'One of those services is not on this menu.', code='service_unavailable')]}
            )

        chair = None
        if attrs.get('employee'):
            if salon is None:
                raise serializers.ValidationError(
                    {'employee': [serializers.ErrorDetail(
                        'A barber working alone has no other chairs.', code='invalid')]}
                )
            chair = SalonEmployee.objects.filter(
                pk=attrs['employee'], salon=salon, is_active=True
            ).first()
            if chair is None:
                raise serializers.ValidationError(
                    {'employee': [serializers.ErrorDetail(
                        'That chair is not taking bookings here.', code='invalid')]}
                )

        attrs['salon'] = salon
        attrs['barber'] = barber
        attrs['services'] = services
        attrs['chair'] = chair
        return attrs


class WalkInCreateSerializer(serializers.Serializer):
    """Adding somebody who came through the door.

    The business is taken from *who is asking*, never from the request body —
    a walk-in is always for the salon the caller works in, and letting the
    caller name one would be letting them write into somebody else's diary.

    Which chair follows from the same question. An owner may put the walk-in
    at any chair or leave it for the floor to sort out; an employee can only
    ever add to their own, which is also what keeps it off their colleagues'
    screens.
    """

    customer_name = serializers.CharField(max_length=60)
    customer_phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    service_ids = serializers.ListField(
        child=serializers.IntegerField(), allow_empty=False, max_length=10
    )
    employee = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')

    def validate_customer_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError(
                [serializers.ErrorDetail('Write the name down.', code='required')]
            )
        return name

    def validate_customer_phone(self, value: str) -> str:
        number = (value or '').strip()
        if not number:
            return ''
        try:
            return normalize_phone(number)
        except DjangoValidationError as error:
            raise serializers.ValidationError(
                [serializers.ErrorDetail(str(error.messages[0]), code='invalid')]
            ) from error

    def validate(self, attrs: dict) -> dict:
        user = self.context['request'].user
        salon = barber = None
        forced_chair = None

        if user.role == Role.SALON_OWNER:
            # The salon whose counter this is, from the request's tenant —
            # not whichever of the owner's shops sorts first by name.
            business = business_of_tenant(
                tenant_of_request(self.context.get('request')))
            salon = (business or {}).get('salon')
            if salon is not None and salon.owner_id != user.id:
                salon = None
        elif user.role == Role.SALON_EMPLOYEE:
            forced_chair = (
                SalonEmployee.objects.filter(user=user, is_active=True)
                .select_related('salon').first()
            )
            salon = forced_chair.salon if forced_chair else None
        elif user.role == Role.BARBER:
            barber = getattr(user, 'barber_profile', None)
            # A barber the salon hired keeps their own trade record, but the
            # walk-in belongs to the room they are standing in.
            employment = (
                SalonEmployee.objects.filter(user=user, is_active=True)
                .select_related('salon').first()
            )
            if employment is not None:
                forced_chair, salon, barber = employment, employment.salon, None

        if salon is None and barber is None:
            raise serializers.ValidationError(
                {'detail': [serializers.ErrorDetail(
                    'Set your business up before adding a walk-in.', code='no_business')]}
            )

        services = list(
            Service.objects.filter(id__in=attrs['service_ids'], is_active=True, salon=salon)
            if salon is not None
            else Service.objects.filter(id__in=attrs['service_ids'], is_active=True, barber=barber)
        )
        if len(services) != len(set(attrs['service_ids'])):
            raise serializers.ValidationError(
                {'service_ids': [serializers.ErrorDetail(
                    'One of those services is not on this menu.', code='service_unavailable')]}
            )

        chair = forced_chair
        if chair is None and attrs.get('employee') and salon is not None:
            chair = SalonEmployee.objects.filter(
                pk=attrs['employee'], salon=salon, is_active=True
            ).first()
            if chair is None:
                raise serializers.ValidationError(
                    {'employee': [serializers.ErrorDetail(
                        'That chair is not taking bookings here.', code='invalid')]}
                )

        # A number the salon already knows belongs to somebody with an account,
        # so the visit lands in their own bookings rather than beside them.
        known = None
        if attrs['customer_phone']:
            known = User.objects.filter(
                phone=attrs['customer_phone'], role=Role.CUSTOMER
            ).first()

        attrs['salon'] = salon
        attrs['barber'] = barber
        attrs['services'] = services
        attrs['chair'] = chair
        attrs['customer'] = known
        return attrs


class RejectSerializer(serializers.Serializer):
    """A rejection without a reason is a door closed in someone's face; the
    customer is told this verbatim, so it is required."""

    reason = serializers.CharField(max_length=300, min_length=3)


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')


class RescheduleSerializer(serializers.Serializer):
    date = serializers.DateField()
    time = SlotTimeField()
    employee = serializers.IntegerField(required=False, allow_null=True)
