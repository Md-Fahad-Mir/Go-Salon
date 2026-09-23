"""Who may read, write and answer a review.

Every read starts from `Apps.bookings.access.scoped(user, tenant)` so a role
can never
see a review of work it could not already see the booking for. There is one
deliberate exception, and it is the public one: a customer choosing a salon has
to be able to read that salon's reviews without having booked there. That path
is keyed on the business, returns no customer identity beyond the display name
the reviewer's own account carries, and is the only query in this module that
does not go through `scoped`.
"""

from __future__ import annotations

from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from Apps.bookings.access import scoped
from Apps.tenants.context import tenant_of_request
from Apps.tenants.permissions import TenantContext
from Apps.bookings.models import AppointmentStatus
from Apps.users.models import BarberProfile, Salon

from .models import Review
from .permissions import may_reply
from .serializers import ReplySerializer, ReviewSerializer, ReviewWriteSerializer

#: Reviews are ordered newest first by default; the other two are what the
#: customer app's sort control already offers.
SORTS = {
    'newest': ('-created_at',),
    'highest': ('-rating', '-created_at'),
    'lowest': ('rating', '-created_at'),
}
PAGE = 20


def _error(detail: str, code: str, http=status.HTTP_400_BAD_REQUEST, errors=None):
    return Response({'detail': detail, 'code': code, 'errors': errors or {}}, status=http)


def _full(query):
    """Every join a review payload reads, so a list is not N+1 queries deep."""
    return query.select_related(
        'appointment', 'appointment__salon', 'appointment__employee__user',
        'appointment__barber__user', 'replied_by',
    ).prefetch_related('appointment__items')


def _page(request, query):
    try:
        page = max(1, int(request.query_params.get('page', 1)))
    except ValueError:
        page = 1
    total = query.count()
    rows = query[(page - 1) * PAGE: page * PAGE]
    return {
        'results': ReviewSerializer(rows, many=True, context={'request': request}).data,
        'page': page,
        'pages': max(1, -(-total // PAGE)),
        'count': total,
    }


def _summary(query) -> dict:
    """The score, the count and the star breakdown the summary panel draws."""
    totals = query.aggregate(average=Avg('rating'), count=Count('id'))
    spread = {row['rating']: row['n'] for row in query.values('rating').annotate(n=Count('id'))}
    return {
        'average': round(totals['average'], 2) if totals['average'] is not None else None,
        'count': totals['count'],
        'distribution': {str(star): spread.get(star, 0) for star in (5, 4, 3, 2, 1)},
    }


def _for_listing(professional_id: str):
    """Reviews of one business, by its directory id — `salon-9`, `barber-5`."""
    kind, _, raw = professional_id.partition('-')
    if not raw.isdigit():
        return None
    if kind == 'salon':
        if not Salon.objects.filter(pk=raw).exists():
            return None
        return Review.objects.filter(appointment__salon_id=raw)
    if kind == 'barber':
        if not BarberProfile.objects.filter(pk=raw).exists():
            return None
        return Review.objects.filter(appointment__barber_id=raw)
    return None


class ListingReviewsView(GenericAPIView):
    """What everyone can read about a business before they book it."""

    permission_classes = (IsAuthenticated,)
    serializer_class = ReviewSerializer

    def get(self, request, professional_id: str):
        query = _for_listing(professional_id)
        if query is None:
            return _error('We could not find that listing.', 'not_found',
                          status.HTTP_404_NOT_FOUND)
        sort = request.query_params.get('sort', 'newest')
        if sort not in SORTS:
            return _error('Sort by newest, highest or lowest.', 'bad_sort',
                          errors={'sort': ['Unknown sort.']})
        payload = _page(request, _full(query).order_by(*SORTS[sort]))
        payload['summary'] = _summary(query)
        return Response(payload)


class MyReviewsView(GenericAPIView):
    """The ones this account is entitled to, whoever they are.

    One endpoint for four roles, because `scoped` already knows the difference:
    a customer gets the reviews they wrote, an owner their salon's, an employee
    the reviews of work they did, a barber their own.
    """

    permission_classes = (IsAuthenticated, TenantContext)
    serializer_class = ReviewSerializer

    def get(self, request):
        visible, viewpoint = scoped(request.user, tenant_of_request(request))
        query = Review.objects.filter(appointment__in=visible)
        sort = request.query_params.get('sort', 'newest')
        if sort not in SORTS:
            return _error('Sort by newest, highest or lowest.', 'bad_sort',
                          errors={'sort': ['Unknown sort.']})
        payload = _page(request, _full(query).order_by(*SORTS[sort]))
        payload['summary'] = _summary(query)
        payload['viewpoint'] = viewpoint
        if viewpoint == 'owner':
            # An owner's roster shows a score under each stylist, and the
            # owner is the only role entitled to the comparison.
            payload['by_staff'] = [
                {
                    'employee_id': str(row['appointment__employee_id']),
                    'rating': round(row['average'], 1),
                    'review_count': row['count'],
                }
                for row in query.filter(appointment__employee__isnull=False)
                .values('appointment__employee_id')
                .annotate(average=Avg('rating'), count=Count('id'))
                .order_by('-average')
            ]
        return Response(payload)


class AppointmentReviewView(GenericAPIView):
    """Writing one, and the business answering it."""

    permission_classes = (IsAuthenticated, TenantContext)
    serializer_class = ReviewWriteSerializer

    def _appointment(self, request, pk: int):
        visible, _ = scoped(request.user, tenant_of_request(request))
        return visible.filter(pk=pk).first()

    def post(self, request, pk: int):
        appointment = self._appointment(request, pk)
        if appointment is None:
            return _error('We could not find that booking.', 'not_found',
                          status.HTTP_404_NOT_FOUND)
        if appointment.customer_id != request.user.id:
            return _error('Only the person who sat in the chair can review it.',
                          'not_yours', status.HTTP_403_FORBIDDEN)
        if appointment.status != AppointmentStatus.COMPLETED:
            return _error('You can review a visit once it is finished.',
                          'not_finished', status.HTTP_409_CONFLICT)
        if Review.objects.filter(appointment=appointment).exists():
            return _error('You have already reviewed this visit.',
                          'already_reviewed', status.HTTP_409_CONFLICT)

        form = ReviewWriteSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        review = Review.objects.create(
            appointment=appointment,
            rating=form.validated_data['rating'],
            text=form.validated_data.get('text', '').strip(),
        )
        return Response(
            ReviewSerializer(
                _full(Review.objects.filter(pk=review.pk)).first(),
                context={'request': request},
            ).data,
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request, pk: int):
        """The business's reply. Not an edit of what the customer said."""
        appointment = self._appointment(request, pk)
        if appointment is None:
            return _error('We could not find that booking.', 'not_found',
                          status.HTTP_404_NOT_FOUND)
        review = Review.objects.filter(appointment=appointment).first()
        if review is None:
            return _error('There is no review to answer.', 'no_review',
                          status.HTTP_404_NOT_FOUND)
        refusal = may_reply(appointment, review, request.user)
        if refusal == 'already_answered':
            return _error('The salon has already answered this review.',
                          refusal, status.HTTP_409_CONFLICT)
        if refusal:
            return _error('Only the business can answer a review.',
                          refusal, status.HTTP_403_FORBIDDEN)

        form = ReplySerializer(data=request.data)
        form.is_valid(raise_exception=True)
        review.reply = form.validated_data['reply'].strip()
        review.replied_at = timezone.now()
        review.replied_by = request.user
        review.save(update_fields=['reply', 'replied_at', 'replied_by', 'updated_at'])
        return Response(ReviewSerializer(
            _full(Review.objects.filter(pk=review.pk)).first(),
            context={'request': request},
        ).data)
