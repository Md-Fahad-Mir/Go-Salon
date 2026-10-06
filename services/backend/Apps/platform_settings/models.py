"""The settings an administrator may change without a redeploy.

Every one of them starts in the environment (`.env`, read into
`core/settings.py`). The admin dashboard's Settings page can override any of
them; the override lives on the one row below, and clearing it hands the
setting back to the environment. Code reads them through `runtime.config`,
which knows which of the two is in force.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from . import runtime


class SMSProvider(models.TextChoices):
    """The providers an administrator may pick. `locmem` is for the test
    suite and is never offered."""

    CONSOLE = 'console', 'Console (development only)'
    HTTP = 'http', 'HTTP gateway'


def _between(low: int, high: int) -> list:
    return [MinValueValidator(low), MaxValueValidator(high)]


class PlatformSettings(models.Model):
    """Platform-wide, one row. Every setting is an override: null means
    "whatever the environment says"."""

    SINGLETON_PK = 1

    # --- Authentication: one-time codes -----------------------------------
    otp_expiration_minutes = models.PositiveIntegerField(null=True, blank=True, validators=_between(1, 60))
    otp_resend_cooldown_seconds = models.PositiveIntegerField(
        null=True, blank=True, validators=_between(10, 3600),
    )
    otp_max_verify_attempts = models.PositiveSmallIntegerField(null=True, blank=True, validators=_between(1, 10))
    otp_max_sends_per_hour = models.PositiveSmallIntegerField(null=True, blank=True, validators=_between(1, 30))

    # --- Password policy --------------------------------------------------
    #: Never under 8: the apps check eight characters before they ask, and a
    #: shorter minimum would only weaken every account.
    password_min_length = models.PositiveSmallIntegerField(null=True, blank=True, validators=_between(8, 64))
    password_reset_token_max_age_seconds = models.PositiveIntegerField(
        null=True, blank=True, validators=_between(60, 3600),
    )

    # --- JWT: applies to tokens issued after the change -------------------
    jwt_access_token_lifetime_minutes = models.PositiveIntegerField(
        null=True, blank=True, validators=_between(1, 1440),
    )
    jwt_refresh_token_lifetime_days = models.PositiveIntegerField(null=True, blank=True, validators=_between(1, 365))

    # --- Security: DRF rates, "<count>/<sec|min|hour|day>" ----------------
    throttle_anon = models.CharField(max_length=20, null=True, blank=True)
    throttle_user = models.CharField(max_length=20, null=True, blank=True)
    throttle_login = models.CharField(max_length=20, null=True, blank=True)
    throttle_register = models.CharField(max_length=20, null=True, blank=True)
    throttle_otp = models.CharField(max_length=20, null=True, blank=True)
    throttle_password_reset = models.CharField(max_length=20, null=True, blank=True)

    # --- SMS delivery: the gateway's key and secret stay in the environment
    sms_provider = models.CharField(max_length=20, null=True, blank=True, choices=SMSProvider.choices)
    sms_base_url = models.URLField(max_length=300, null=True, blank=True)
    sms_sender_id = models.CharField(max_length=20, null=True, blank=True)
    sms_timeout_seconds = models.PositiveSmallIntegerField(null=True, blank=True, validators=_between(1, 60))

    # --- QR codes ---------------------------------------------------------
    join_url_base = models.URLField(max_length=200, null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )

    class Meta:
        verbose_name = 'platform settings'
        verbose_name_plural = 'platform settings'

    def __str__(self) -> str:
        return 'Platform settings'

    @classmethod
    def load(cls) -> PlatformSettings:
        row, _ = cls.objects.get_or_create(pk=cls.SINGLETON_PK)
        return row

    def overrides(self) -> dict[str, Any]:
        return {
            field: value for field in runtime.FIELDS if (value := getattr(self, field)) is not None
        }

    def save(self, *args, **kwargs) -> None:
        super().save(*args, **kwargs)
        runtime.forget()
