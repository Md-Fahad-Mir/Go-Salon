"""One-time codes: issuing them, and checking the one that comes back.

Every rule about codes lives here, so registration, sign-in verification and
password reset all behave the same: six digits from a cryptographic source,
fifteen minutes to use one, a cooldown between sends, a ceiling on guesses,
and only ever one live code per purpose.
"""

from __future__ import annotations

import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
from rest_framework import serializers

from ..exceptions import OTPCooldown, OTPSendLimit, SMSUnavailable
from ..models import OTPCode, User
from .sms import SMSDeliveryError, get_sms_provider

logger = logging.getLogger(__name__)

DIGITS = '0123456789'


def _generate_code() -> str:
    """`secrets` rather than `random`: the module seeded by the clock is the
    one an attacker can replay."""
    length = settings.OTP_LENGTH
    return ''.join(secrets.choice(DIGITS) for _ in range(length))


def seconds_until_resend(user: User, purpose: str) -> int:
    """How long before another code may be asked for. 0 when it may be now."""
    latest = OTPCode.objects.filter(user=user, purpose=purpose).order_by('-created_at').first()
    if latest is None:
        return 0
    elapsed = (timezone.now() - latest.created_at).total_seconds()
    remaining = settings.OTP_RESEND_COOLDOWN_SECONDS - elapsed
    return max(0, int(remaining + 0.999))


def _guard_send_rate(user: User, purpose: str) -> None:
    cooldown = seconds_until_resend(user, purpose)
    if cooldown:
        raise OTPCooldown(cooldown)

    window_start = timezone.now() - timedelta(hours=1)
    recent = OTPCode.objects.filter(
        user=user, purpose=purpose, created_at__gte=window_start
    ).count()
    if recent >= settings.OTP_MAX_SENDS_PER_HOUR:
        raise OTPSendLimit()


def issue_otp(user: User, purpose: str, *, enforce_rate: bool = True) -> OTPCode:
    """Replace any live code with a fresh one and text it to the user.

    The plaintext lives exactly as long as this call: it goes to the SMS
    provider and is never written down. What the row keeps is a hash.
    """
    if enforce_rate:
        _guard_send_rate(user, purpose)

    # Asking for a new code retires the old one, so a code read off an older
    # message cannot be used after a resend.
    OTPCode.objects.live(user, purpose).update(invalidated_at=timezone.now())

    code = _generate_code()
    otp = OTPCode.objects.create(
        user=user,
        purpose=purpose,
        code_hash=make_password(code),
        debug_code=code if settings.DEBUG else '',
        expires_at=timezone.now() + timedelta(minutes=settings.OTP_EXPIRATION_MINUTES),
    )

    message = (
        f'Your Eureka verification code is {code}. '
        f'It expires in {settings.OTP_EXPIRATION_MINUTES} minutes.'
    )
    try:
        get_sms_provider().send(to=user.phone, message=message)
    except SMSDeliveryError as error:
        # The code is dead the moment we cannot deliver it; leaving it live
        # would let a resend be refused by the cooldown for nothing.
        otp.invalidated_at = timezone.now()
        otp.save(update_fields=['invalidated_at'])
        logger.warning('OTP delivery failed for user %s: %s', user.pk, error)
        raise SMSUnavailable() from error

    # The event, never the code.
    logger.info('Issued %s OTP for user %s', purpose, user.pk)
    return otp


def verify_otp(user: User, purpose: str, code: str) -> OTPCode:
    """Spend the live code, or say precisely what was wrong with it."""
    # The newest unspent code, invalidated or not: a code retired by too many
    # wrong guesses still has to explain itself rather than read as "no code".
    otp = (
        OTPCode.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True)
        .order_by('-created_at')
        .first()
    )
    if otp is None:
        raise serializers.ValidationError(
            {'code': [serializers.ErrorDetail('Ask for a code first.', code='otp_missing')]}
        )
    if otp.attempts >= settings.OTP_MAX_VERIFY_ATTEMPTS:
        if otp.invalidated_at is None:
            otp.invalidated_at = timezone.now()
            otp.save(update_fields=['invalidated_at'])
        raise serializers.ValidationError(
            {'code': [serializers.ErrorDetail('Too many wrong tries. Ask for a new code.',
                                              code='otp_attempts')]}
        )
    if otp.is_expired:
        raise serializers.ValidationError(
            {'code': [serializers.ErrorDetail('That code has expired. Ask for a new one.',
                                              code='otp_expired')]}
        )
    if otp.invalidated_at is not None:
        raise serializers.ValidationError(
            {'code': [serializers.ErrorDetail('That code is not right.', code='otp_invalid')]}
        )

    if not check_password(code, otp.code_hash):
        otp.attempts += 1
        # One more wrong guess than we allow retires the code entirely.
        if otp.attempts >= settings.OTP_MAX_VERIFY_ATTEMPTS:
            otp.invalidated_at = timezone.now()
        otp.save(update_fields=['attempts', 'invalidated_at'])
        raise serializers.ValidationError(
            {'code': [serializers.ErrorDetail('That code is not right.', code='otp_invalid')]}
        )

    otp.consumed_at = timezone.now()
    otp.save(update_fields=['consumed_at'])
    return otp
