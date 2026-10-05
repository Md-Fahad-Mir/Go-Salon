"""Try-on credits: what an account's plan allows each month, and what is left.

Nothing is kept as a balance that could drift. The plan says how many 360°
try-on videos a month it includes (`SubscriptionTier.monthly_credits`, null
for unlimited), and a credit is spent by every video asked for this month
that has not failed — so the count is read straight off the video log, and a
render that fails gives its credit back without anything having to remember
to. The month is the calendar month in BUSINESS_TIME_ZONE, the same clock
the rest of the platform keeps.

A credit is taken *before* the AI service is asked for the video (`reserve`),
because that is the call that costs money: a check made afterwards could only
notice an overspend, not stop it.
"""

from __future__ import annotations

from datetime import date, datetime, time
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from Apps.bookings.models import business_tz

from .models import TryOnVideo, VideoStatus

#: Marks a video row holding a credit while the AI service starts the job;
#: the real job id replaces it once there is one.
RESERVED_PREFIX = 'reserved:'


class NoCredits(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'no_credits'
    default_detail = 'You have used all of this month’s try-on credits.'


def current_period(now: datetime | None = None) -> tuple[datetime, datetime]:
    """The calendar month `now` falls in, as [start, end) in business time."""
    tz = business_tz()
    today = (now or timezone.now()).astimezone(tz).date()
    start = date(today.year, today.month, 1)
    end = date(today.year + 1, 1, 1) if today.month == 12 else date(today.year, today.month + 1, 1)
    return datetime.combine(start, time.min, tzinfo=tz), datetime.combine(end, time.min, tzinfo=tz)


def summary(user, *, now: datetime | None = None) -> dict:
    """The account's plan and this month's credits — what the app shows."""
    tier = user.subscription_tier
    start, end = current_period(now)
    used = (
        TryOnVideo.objects.filter(user=user, created_at__gte=start, created_at__lt=end)
        .exclude(status=VideoStatus.FAILED)
        .count()
    )
    total = tier.monthly_credits
    return {
        'plan': {'slug': tier.slug, 'name': tier.name},
        'total': total,
        'used': used,
        'remaining': None if total is None else max(0, total - used),
        'unlimited': total is None,
        'period_start': start,
        'resets_at': end,
    }


def reserve(user, hairstyle) -> TryOnVideo:
    """Takes one of this month's credits by logging the video before it is
    asked for. Refused with `NoCredits` when none are left.

    The caller fills in the job once the AI service has started it, or
    deletes the row if it never does — which hands the credit back."""
    with transaction.atomic():
        # One account's starts in single file, so two taps at once cannot
        # both take the last credit. (SQLite has no row locks, but it lets
        # only one writer in at a time, which comes to the same thing.)
        get_user_model().objects.select_for_update().filter(pk=user.pk).first()
        state = summary(user)
        if not state['unlimited'] and state['remaining'] < 1:
            raise NoCredits(
                f'You have used all {state["total"]} try-on credits on the {state["plan"]["name"]} plan '
                'this month.'
            )
        return TryOnVideo.objects.create(
            user=user,
            hairstyle=hairstyle,
            hairstyle_name=hairstyle.name,
            job_id=f'{RESERVED_PREFIX}{uuid4().hex}',
        )
