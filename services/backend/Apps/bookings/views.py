"""The booking endpoints.

Every view starts from `access.scoped(request.user, tenant)` — the queryset
already narrowed to what this account may see, in the tenant it is asking
about. A detail lookup filters *through* it, so
another customer's appointment or another salon's diary is a 404 rather than a
403 that confirms the row exists.
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from Apps.tenants.context import tenant_of_request
from Apps.tenants.permissions import TenantContext
from Apps.users.models import Role, SalonEmployee
from Apps.users.permissions import IsCustomer

from . import services as booking_service
from .access import business_of, is_customer_of, runs_business, scoped
from .availability import day_availability, horizon_days
from decimal import Decimal, InvalidOperation

from . import reports
from .models import Appointment, AppointmentStatus, NotificationKind, PaymentMethod
from .notifications import notify
from .realtime import publish
from .serializers import (
    AppointmentSerializer,
    AvailabilityQuerySerializer,
    BookingCreateSerializer,
    CancelSerializer,
    WalkInCreateSerializer,
    RejectSerializer,
    RescheduleSerializer,
)


def _serialize(appointment, request, code: int = status.HTTP_200_OK) -> Response:
    return Response(
        AppointmentSerializer(appointment, context={'request': request}).data, status=code
    )


def _not_found() -> Response:
    return Response(
        {'detail': 'No such booking.', 'code': 'not_found', 'errors': {}},
        status=status.HTTP_404_NOT_FOUND,
    )


def _forbidden(detail: str, code: str = 'permission_denied') -> Response:
    return Response({'detail': detail, 'code': code, 'errors': {}},
                    status=status.HTTP_403_FORBIDDEN)


class AvailabilityView(GenericAPIView):
    """Free slots for one day.

    Unavailable times come back too, marked. A calendar that lists only what is
    left cannot tell a customer that four o'clock is *taken*, which is the one
    thing they most want to know.
    """

    permission_classes = (IsAuthenticated, TenantContext)
    serializer_class = AvailabilityQuerySerializer

    def get(self, request):
        serializer = self.get_serializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = data['listing']
        day = data['date']

        from Apps.services.models import Service
        from Apps.users.models import Salon

        salon = business if isinstance(business, Salon) else None
        barber = None if salon else business

        horizon = timezone.localdate() + timedelta(days=horizon_days())
        if day > horizon:
            return Response({
                'date': day, 'duration_minutes': 0, 'slots': [],
                'detail': f'Bookings open {horizon_days()} days ahead.',
            })

        wanted = data.get('service_ids') or []
        services = list(
            Service.objects.filter(id__in=wanted, is_active=True).filter(
                salon=salon
            ) if salon is not None
            else Service.objects.filter(id__in=wanted, is_active=True, barber=barber)
        )
        duration, buffer = booking_service.basket_minutes(services)
        # Nothing chosen yet: show the shape of the day at a sensible default so
        # the calendar is not blank while they decide — but say so. A bare 30
        # was indistinguishable from a real half-hour basket, and every slot it
        # offered past the real basket's last start became "somebody took it"
        # at the moment of booking.
        assumed = duration <= 0
        if assumed:
            duration, buffer = 30, 0

        chair = None
        if data.get('employee') and salon is not None:
            chair = SalonEmployee.objects.filter(
                pk=data['employee'], salon=salon, is_active=True
            ).first()

        slots = day_availability(
            tenant=tenant_of_request(request),
            salon=salon, barber=barber, day=day, duration=duration, buffer=buffer,
            services=services, employee=chair,
            exclude_appointment=data.get('exclude'),
        )
        return Response({
            'date': day,
            'duration_minutes': duration,
            'buffer_minutes': buffer,
            #: True when no services were named, so `duration_minutes` is this
            #: endpoint's guess rather than the caller's basket. A client must
            #: not let anyone book off a guessed grid.
            'assumed_duration': assumed,
            'slots': slots,
        })


class BookingListCreateView(GenericAPIView):
    permission_classes = (IsAuthenticated, TenantContext)
    serializer_class = AppointmentSerializer

    def get(self, request):
        query, viewpoint = scoped(request.user, tenant_of_request(request))

        wanted = request.query_params.get('status')
        if wanted:
            query = query.filter(status__in=[s.strip() for s in wanted.split(',') if s.strip()])
        on = request.query_params.get('date')
        if on:
            query = query.filter(date=on)
        if request.query_params.get('upcoming') in {'1', 'true', 'yes'}:
            query = query.filter(starts_at__gte=timezone.now())

        return Response({
            'viewpoint': viewpoint,
            'results': AppointmentSerializer(
                query[:200], many=True, context={'request': request}
            ).data,
        })

    def post(self, request):
        """Only a customer books ahead. A business adding somebody already in
        the shop uses `WalkInView` — a different thing with different rules."""
        if request.user.role != Role.CUSTOMER:
            return _forbidden('Only a customer account can make a booking.')

        serializer = BookingCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        moving = None
        if data.get('reschedule_of'):
            moving = Appointment.objects.filter(
                pk=data['reschedule_of'], customer=request.user
            ).first()
            if moving is None:
                return _not_found()

        appointment = booking_service.create_appointment(
            customer=request.user,
            salon=data['salon'],
            barber=data['barber'],
            services=data['services'],
            day=data['date'],
            start=data['time'],
            chair=data['chair'],
            notes=data['notes'],
            reschedule_of=moving,
        )
        return _serialize(appointment, request, status.HTTP_201_CREATED)


class WalkInView(GenericAPIView):
    """Adding somebody who is already in the shop.

    Separate from booking ahead because almost every rule differs: there is no
    slot to reserve, no approval to wait for, and often no account — the salon
    writes a name on the row and that is the whole record of who it is.

    Who it lands with is the point. The salon owns it, so the owner sees it;
    the chair is the employee who took them, so that employee sees it and
    their colleagues do not. Both fall out of the existing scoping rather than
    being re-decided here.
    """

    permission_classes = (IsAuthenticated, TenantContext)
    serializer_class = WalkInCreateSerializer

    def post(self, request):
        if request.user.role not in {Role.BARBER, Role.SALON_OWNER, Role.SALON_EMPLOYEE}:
            return _forbidden('Only a business can add a walk-in.')

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        appointment = booking_service.create_walk_in(
            salon=data['salon'],
            barber=data['barber'],
            services=data['services'],
            chair=data['chair'],
            customer=data['customer'],
            guest_name=data['customer_name'],
            guest_phone=data['customer_phone'],
            notes=data['notes'],
        )
        return _serialize(appointment, request, status.HTTP_201_CREATED)


class BookingActionView(APIView):
    """Shared lookup: the row, through the caller's own queryset."""

    permission_classes = (IsAuthenticated, TenantContext)

    def appointment(self, request, pk: int):
        query, _ = scoped(request.user, tenant_of_request(request))
        return query.filter(pk=pk).first()


class BookingDetailView(BookingActionView):
    def get(self, request, pk: int):
        appointment = self.appointment(request, pk)
        if appointment is None:
            return _not_found()
        return _serialize(appointment, request)


class ApproveView(BookingActionView):
    """Says yes, and tells the customer. The message is sent through the same
    SMS provider the one-time codes use; whether it arrived is recorded."""

    def post(self, request, pk: int):
        appointment = self.appointment(request, pk)
        if appointment is None:
            return _not_found()
        if not runs_business(appointment, request.user):
            return _forbidden('Only the business can approve a booking.')
        if appointment.status != AppointmentStatus.PENDING:
            return Response(
                {'detail': 'That booking is not waiting for approval.',
                 'code': 'not_pending', 'errors': {}},
                status=status.HTTP_409_CONFLICT,
            )

        appointment.status = AppointmentStatus.APPROVED
        appointment.approved_at = timezone.now()
        appointment.save(update_fields=['status', 'approved_at', 'updated_at'])
        publish(appointment)

        record = notify(appointment, NotificationKind.APPROVED)
        payload = AppointmentSerializer(appointment, context={'request': request}).data
        payload['notification'] = {'status': record.status, 'error': record.error}
        return Response(payload)


class RejectView(BookingActionView):
    def post(self, request, pk: int):
        appointment = self.appointment(request, pk)
        if appointment is None:
            return _not_found()
        if not runs_business(appointment, request.user):
            return _forbidden('Only the business can turn a booking down.')
        if appointment.status != AppointmentStatus.PENDING:
            return Response(
                {'detail': 'That booking is not waiting for approval.',
                 'code': 'not_pending', 'errors': {}},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = RejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        appointment.status = AppointmentStatus.REJECTED
        appointment.reject_reason = serializer.validated_data['reason'].strip()
        appointment.closed_at = timezone.now()
        appointment.save(update_fields=[
            'status', 'reject_reason', 'closed_at', 'updated_at',
        ])
        publish(appointment)

        record = notify(appointment, NotificationKind.REJECTED)
        payload = AppointmentSerializer(appointment, context={'request': request}).data
        payload['notification'] = {'status': record.status, 'error': record.error}
        return Response(payload)


class CompleteView(BookingActionView):
    def post(self, request, pk: int):
        appointment = self.appointment(request, pk)
        if appointment is None:
            return _not_found()
        if not runs_business(appointment, request.user):
            return _forbidden('Only the business can close a booking off.')
        if appointment.status != AppointmentStatus.APPROVED:
            return Response(
                {'detail': 'Only an approved booking can be completed.',
                 'code': 'not_approved', 'errors': {}},
                status=status.HTTP_409_CONFLICT,
            )
        appointment.status = AppointmentStatus.COMPLETED
        appointment.completed_at = timezone.now()
        appointment.closed_at = appointment.completed_at

        # How it was paid, and anything left on top. Both optional: a business
        # that closes a booking without saying leaves `paid_with` blank, which
        # the reports keep as its own bucket rather than calling it cash.
        saved = ['status', 'completed_at', 'closed_at', 'updated_at']
        method = str(request.data.get('paid_with') or '').strip()
        if method:
            if method not in PaymentMethod.values:
                return Response(
                    {'detail': 'That is not a payment method we record.',
                     'code': 'unknown_method',
                     'errors': {'paid_with': ['Unknown payment method.']}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            appointment.paid_with = method
            saved.append('paid_with')
        tip = request.data.get('tip')
        if tip not in (None, ''):
            try:
                amount = Decimal(str(tip))
            except (InvalidOperation, ValueError):
                amount = None
            if amount is None or amount < 0:
                return Response(
                    {'detail': 'A tip cannot be negative.', 'code': 'bad_tip',
                     'errors': {'tip': ['Enter a tip of zero or more.']}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            appointment.tip = amount
            saved.append('tip')

        appointment.save(update_fields=saved)
        publish(appointment)
        return _serialize(appointment, request)


class AnalyticsView(GenericAPIView):
    """What the salon took, for the owner's Analytics screen.

    Every figure is computed in `reports.py` from `access.scoped(user, tenant)`,
    so this view cannot widen what a role may see — an employee calling it gets
    their own chair, which is why the viewpoint is returned rather than assumed.
    """

    permission_classes = (IsAuthenticated, TenantContext)
    serializer_class = AppointmentSerializer  # for DRF's schema only

    def get(self, request):
        period = request.query_params.get('period', 'week')
        if period not in {'week', 'month'}:
            return Response(
                {'detail': 'Ask for a week or a month.', 'code': 'bad_period',
                 'errors': {'period': ['Unknown period.']}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(reports.analytics(
            request.user, tenant_of_request(request), period))


class PerformanceView(GenericAPIView):
    """How one stylist did, for their own Performance screen.

    Refused to anyone whose viewpoint is not `employee`: the screen is an
    employee's own, and answering it for an owner would quietly hand back the
    whole salon under a heading that says "you".
    """

    permission_classes = (IsAuthenticated, TenantContext)
    serializer_class = AppointmentSerializer

    def get(self, request):
        period = request.query_params.get('period', 'week')
        if period not in {'week', 'month'}:
            return Response(
                {'detail': 'Ask for a week or a month.', 'code': 'bad_period',
                 'errors': {'period': ['Unknown period.']}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = reports.performance(
            request.user, tenant_of_request(request), period)
        if payload['viewpoint'] != 'employee':
            return _forbidden('This is a salon employee\'s own record.')
        return Response(payload)


class CancelView(BookingActionView):
    """Calls a booking off.

    A customer may do this themselves up to the business's cancellation
    deadline. Past it the answer is not "no" but "ring them" — the chair has
    been held, and a person deserves to be told rather than a row quietly
    changing state.
    """

    def post(self, request, pk: int):
        appointment = self.appointment(request, pk)
        if appointment is None:
            return _not_found()

        mine = is_customer_of(appointment, request.user)
        business = runs_business(appointment, request.user)
        if not (mine or business):
            return _forbidden('That booking is not yours to cancel.')

        if mine and not business and not appointment.customer_may_cancel():
            return Response(
                {
                    'detail': (
                        f'Bookings can only be cancelled online up to '
                        f'{appointment.cancellation_window_hours} hours before. '
                        f'Call {appointment.business_name} to cancel this one.'
                    ),
                    'code': 'call_to_cancel',
                    'errors': {},
                    'business_name': appointment.business_name,
                    'business_phone': appointment.business_phone,
                    'cancel_deadline': appointment.cancel_deadline,
                },
                status=status.HTTP_409_CONFLICT,
            )

        serializer = CancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking_service.cancel(
            appointment, by_customer=mine and not business,
            reason=serializer.validated_data['reason'],
        )
        return _serialize(appointment, request)


class RescheduleView(BookingActionView):
    """Moves a booking to another time, keeping the old row as history."""

    def post(self, request, pk: int):
        appointment = self.appointment(request, pk)
        if appointment is None:
            return _not_found()

        mine = is_customer_of(appointment, request.user)
        business = runs_business(appointment, request.user)
        if not (mine or business):
            return _forbidden('That booking is not yours to move.')

        serializer = RescheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        chair = None
        if data.get('employee') and appointment.salon_id:
            chair = SalonEmployee.objects.filter(
                pk=data['employee'], salon=appointment.salon, is_active=True
            ).first()

        moved = booking_service.reschedule(
            appointment, day=data['date'], start=data['time'], chair=chair,
            by_customer=mine and not business,
        )
        return _serialize(moved, request, status.HTTP_201_CREATED)
