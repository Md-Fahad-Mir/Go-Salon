"""Which value of an admin-adjustable setting is in force right now.

    from Apps.platform_settings.runtime import config
    config.OTP_EXPIRATION_MINUTES

reads like `settings.OTP_EXPIRATION_MINUTES` and answers the same way until an
administrator changes it on the dashboard's Settings page; from then on it
answers with their value, until they reset it. The names are the
environment's, so `.env` and the code still say the same thing.

The overrides are one small row, kept in the cache so a request that checks
three throttles does not read it three times. Saving the row drops the cached
copy, so the process that saved it sees the change at once; any other worker
process sees it within `CACHE_SECONDS`.

Deliberately not here: DJANGO_SECRET_KEY, JWT_SIGNING_KEY, SMS_API_KEY and
SMS_API_SECRET. Secrets stay in the environment, where only whoever deploys
the server can read them. Nor is OTP_LENGTH — the app's code boxes are built
for six digits (`OTP_LENGTH` in services/frontend/src/constants), so a
different length would lock every new account out.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.cache import cache

CACHE_KEY = 'platform-settings:overrides'
CACHE_SECONDS = 10

#: Every setting the dashboard may change, as `PlatformSettings` field names.
#: Upper-cased, each is the environment variable — and the `core/settings.py`
#: name — that supplies it when no administrator has.
FIELDS = (
    # Authentication: one-time codes
    'otp_expiration_minutes',
    'otp_resend_cooldown_seconds',
    'otp_max_verify_attempts',
    'otp_max_sends_per_hour',
    # Password policy
    'password_min_length',
    'password_reset_token_max_age_seconds',
    # JWT
    'jwt_access_token_lifetime_minutes',
    'jwt_refresh_token_lifetime_days',
    # Security: rate limits
    'throttle_anon',
    'throttle_user',
    'throttle_login',
    'throttle_register',
    'throttle_otp',
    'throttle_password_reset',
    # SMS delivery
    'sms_provider',
    'sms_base_url',
    'sms_sender_id',
    'sms_timeout_seconds',
    # QR codes
    'join_url_base',
)

NAMES = frozenset(field.upper() for field in FIELDS)


def overrides() -> dict[str, Any]:
    """The administrator's values by field name — only the ones they set."""
    cached = cache.get(CACHE_KEY)
    if cached is None:
        # Here rather than at the top: the throttles and token classes import
        # this module while Django is still loading apps.
        from .models import PlatformSettings

        row = PlatformSettings.objects.filter(pk=PlatformSettings.SINGLETON_PK).first()
        cached = row.overrides() if row else {}
        cache.set(CACHE_KEY, cached, CACHE_SECONDS)
    return cached


def forget() -> None:
    """Drop the cached overrides, so the next read sees the row as saved."""
    cache.delete(CACHE_KEY)


def default(field: str) -> Any:
    """What the environment says. Read on every call, never captured, so
    `override_settings` in a test still reaches it."""
    return getattr(settings, field.upper())


class _Config:
    """`django.conf.settings` as amended from the dashboard — for the names in
    `NAMES` only. Anything else is a plain `settings` read."""

    def __getattr__(self, name: str) -> Any:
        if name not in NAMES:
            raise AttributeError(f'{name} is not a setting the admin dashboard can change.')
        value = overrides().get(name.lower())
        return default(name) if value is None else value


config = _Config()
