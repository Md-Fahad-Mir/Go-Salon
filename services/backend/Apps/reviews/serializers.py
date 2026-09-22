"""Reviews, in and out.

The wire shape matches what the app already renders, so no screen has to learn
a new vocabulary: a review carries who wrote it, what they scored, what they
said, which service and which stylist, and the business's reply if there is one.
Everything but the rating, the text and the reply is read off the appointment.
"""

from __future__ import annotations

from rest_framework import serializers

from .models import Review
from .permissions import may_reply


#: Honorifics people here write into the name field itself. "Md Fahad Mir"
#: shortened naively is "Md M.", which names nobody — the given name is the
#: second word. Matched without the dot, lowercased.
_HONORIFICS = {
    'md', 'mohammad', 'mohammed', 'muhammad', 'mohd',
    'mst', 'most', 'mosammat', 'musammat',
    'sk', 'shaikh', 'sheikh', 'mr', 'mrs', 'ms', 'dr',
}


def short_name(full: str) -> str:
    """`Tanvir Rahman` → `Tanvir R.` — how a reviewer is named in public.

    A review is read by strangers deciding where to get their hair cut, and the
    reviewer did not publish their surname to them. The business always has the
    full name on the appointment itself, so nothing an owner needs is lost here.
    """
    parts = (full or '').split()
    while len(parts) > 1 and parts[0].rstrip('.').lower() in _HONORIFICS:
        parts = parts[1:]
    if len(parts) < 2:
        return parts[0] if parts else ''
    return f'{parts[0]} {parts[-1][0]}.'


def listing_id(appointment) -> str:
    """The id the directory uses for a business — `salon-9`, `barber-5`.

    Kept here rather than imported from Apps.directory so a review payload does
    not depend on the shape of a listing; the two happen to agree, and this is
    the one line to change if they ever stop.
    """
    if appointment.salon_id:
        return f'salon-{appointment.salon_id}'
    if appointment.barber_id:
        return f'barber-{appointment.barber_id}'
    return ''


class ReviewSerializer(serializers.ModelSerializer):
    professional_id = serializers.SerializerMethodField()
    professional_name = serializers.SerializerMethodField()
    booking_id = serializers.SerializerMethodField()
    user_id = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    service_name = serializers.SerializerMethodField()
    staff_name = serializers.SerializerMethodField()
    replied_by_name = serializers.SerializerMethodField()
    can_reply = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = (
            'id', 'professional_id', 'professional_name', 'booking_id',
            'user_id', 'user_name',
            'rating', 'text', 'service_name', 'staff_name',
            'reply', 'replied_at', 'replied_by_name', 'can_reply', 'created_at',
        )
        read_only_fields = fields

    def get_professional_id(self, review) -> str:
        return listing_id(review.appointment)

    def get_professional_name(self, review) -> str:
        """The business, named. The customer's own list of reviews is reached
        without loading any listing first, so the name has to travel with the
        review rather than be looked up in a cache that may be empty."""
        return review.appointment.business_name

    def get_booking_id(self, review) -> str:
        return str(review.appointment_id)

    def get_user_id(self, review) -> str:
        return str(review.appointment.customer_id or '')

    def get_user_name(self, review) -> str:
        return short_name(review.author_name)

    def get_service_name(self, review) -> str:
        """What was in the chair, as it was sold — the frozen line names."""
        return ' · '.join(item.name for item in review.appointment.items.all())

    def get_staff_name(self, review) -> str:
        appointment = review.appointment
        if appointment.employee_id:
            return appointment.employee.user.name
        if appointment.barber_id:
            return appointment.barber.user.name
        return ''

    def get_replied_by_name(self, review) -> str:
        """Who the reply is from, as the customer should read it.

        A salon speaks as the salon whoever typed it; a stylist replying at
        their own chair still speaks for the shop. So this is the *business's*
        name, and `replied_by` exists so the shop knows which of them wrote it.
        """
        if not review.reply:
            return ''
        appointment = review.appointment
        return appointment.business_name


    def get_can_reply(self, review) -> bool:
        """Whether the account reading this may answer it.

        Answered here rather than left to the screen because the rule is not
        one a screen can see: at a salon both the owner and the stylist in the
        chair pass, but the stylist may not overwrite an answer the salon has
        already given. A Reply button the API would refuse with a 409 is worse
        than no button.
        """
        request = self.context.get('request')
        if request is None or not request.user.is_authenticated:
            return False
        return not may_reply(review.appointment, review, request.user)


class ReviewWriteSerializer(serializers.Serializer):
    """What a customer sends. The appointment decides everything else."""

    rating = serializers.IntegerField(min_value=1, max_value=5)
    text = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class ReplySerializer(serializers.Serializer):
    """The business answering back."""

    reply = serializers.CharField(max_length=2000, allow_blank=False)
