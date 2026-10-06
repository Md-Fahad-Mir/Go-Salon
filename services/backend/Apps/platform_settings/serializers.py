"""Checking what the dashboard's Settings page sends.

Every field takes a value, which becomes the override, or null, which hands
the setting back to the environment. A name that is not a setting is refused
rather than ignored, so a request for a secret gets an answer, not silence.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from django.conf import settings
from django.core.validators import URLValidator
from rest_framework import serializers

from . import runtime
from .models import PlatformSettings, SMSProvider

_RATE = re.compile(r'^(\d{1,7})\s*/\s*(s|sec|second|m|min|minute|h|hour|d|day)$', re.IGNORECASE)

#: DRF reads only the first letter of the period; this is how it is written back.
_PERIODS = {'s': ('sec', 1), 'm': ('min', 60), 'h': ('hour', 3600), 'd': ('day', 86400)}

#: The least each rate may allow, in requests an hour. Below these an
#: administrator could lock everyone out — themselves included: the dashboard
#: is a signed-in client like any other, and signs in through `login`.
MIN_PER_HOUR = {
    'anon': 600,
    'user': 1800,
    'login': 10,
    'register': 3,
    'otp': 3,
    'password_reset': 3,
}

_HTTP_URL = URLValidator(schemes=('http', 'https'))

#: The fields whose combination decides whether an SMS can be sent at all.
_SMS_ROUTE = frozenset({'sms_provider', 'sms_base_url', 'sms_sender_id'})


def _error(message: str, code: str) -> serializers.ErrorDetail:
    return serializers.ErrorDetail(message, code=code)


def _per_hour_text(per_hour: int) -> str:
    return f'{per_hour // 60}/min' if per_hour % 60 == 0 else f'{per_hour}/hour'


class RateField(serializers.CharField):
    """A DRF rate such as "60/min", written back as `<count>/<sec|min|hour|day>`."""

    def __init__(self, scope: str, **kwargs):
        self.scope = scope
        super().__init__(max_length=20, allow_null=True, required=False, **kwargs)

    def to_internal_value(self, data) -> str:
        match = _RATE.match(super().to_internal_value(data))
        if match is None:
            raise serializers.ValidationError(
                _error('Write the rate as a number per sec, min, hour or day — for example 60/min.', 'invalid_rate')
            )
        count = int(match.group(1))
        period, seconds = _PERIODS[match.group(2)[0].lower()]
        floor = MIN_PER_HOUR[self.scope]
        if count * 3600 < floor * seconds:
            raise serializers.ValidationError(
                _error(f'Allow at least {_per_hour_text(floor)}. Any lower could lock people out.', 'rate_too_low')
            )
        return f'{count}/{period}'


class PlatformSettingsSerializer(serializers.ModelSerializer):
    throttle_anon = RateField('anon')
    throttle_user = RateField('user')
    throttle_login = RateField('login')
    throttle_register = RateField('register')
    throttle_otp = RateField('otp')
    throttle_password_reset = RateField('password_reset')

    sms_provider = serializers.ChoiceField(choices=SMSProvider.choices, allow_null=True, required=False)
    sms_base_url = serializers.URLField(max_length=300, allow_null=True, required=False, validators=[_HTTP_URL])
    sms_sender_id = serializers.CharField(max_length=20, allow_null=True, required=False)
    join_url_base = serializers.URLField(max_length=200, allow_null=True, required=False, validators=[_HTTP_URL])

    class Meta:
        model = PlatformSettings
        fields = runtime.FIELDS

    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            unknown = sorted(set(data) - set(self.fields))
            if unknown:
                raise serializers.ValidationError({
                    name: [_error('Not a setting that can be changed here.', 'unknown_setting')]
                    for name in unknown
                })
        return super().to_internal_value(data)

    def validate_join_url_base(self, value: str | None) -> str | None:
        if value is None:
            return value
        if '?' in value or '#' in value:
            raise serializers.ValidationError(
                _error('Give just the address — no ? or # part. The salon’s code is added after it.', 'invalid_url')
            )
        return value.rstrip('/')

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs.keys() & _SMS_ROUTE:
            self._check_sms_route(attrs)
        return attrs

    def _check_sms_route(self, attrs: dict[str, Any]) -> None:
        """Refuse a provider that could not send anything with what it has."""

        def after(field: str):
            value = attrs[field] if field in attrs else getattr(self.instance, field)
            return runtime.default(field) if value is None else value

        provider = after('sms_provider')
        if provider == SMSProvider.CONSOLE and not settings.DEBUG:
            raise serializers.ValidationError({'sms_provider': [_error(
                'The console provider only prints codes to the server log, so it is refused while '
                'DEBUG is off. Choose the HTTP gateway.', 'sms_console_in_production',
            )]})
        if provider != SMSProvider.HTTP:
            return
        errors = {}
        if not settings.SMS_API_KEY:
            errors['sms_provider'] = [_error(
                'Set SMS_API_KEY in the server’s .env before switching to the HTTP gateway.', 'sms_key_missing',
            )]
        if not after('sms_base_url'):
            errors['sms_base_url'] = [_error('The HTTP gateway needs its URL.', 'required')]
        if not after('sms_sender_id'):
            errors['sms_sender_id'] = [_error('The HTTP gateway needs a sender ID.', 'required')]
        if errors:
            raise serializers.ValidationError(errors)

    def update(self, instance: PlatformSettings, validated_data: dict[str, Any]) -> PlatformSettings:
        # Only what was sent, so two admins changing different settings at
        # once do not undo each other.
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save(update_fields=(*validated_data, 'updated_at'))
        return instance
