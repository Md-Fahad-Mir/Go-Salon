"""Sending an SMS.

The OTP service does not know how a message reaches a phone; it asks the
configured provider. Which one is `SMS_PROVIDER`, and its credentials come
from the environment — never from this file.

Providers:

    console   Writes the message to the server log. Development only: it
              refuses to start when DEBUG is off, so a deployment cannot
              quietly "deliver" codes to a log file.
    locmem    Keeps messages in memory for tests.
    http      Posts to a vendor's HTTP API. The request below is the shape
              most Bangladeshi gateways accept, but every vendor differs —
              adapt `_payload` to the one you buy, and set SMS_BASE_URL,
              SMS_API_KEY, SMS_API_SECRET and SMS_SENDER_ID.

No provider is configured out of the box. Until one is, OTP delivery is not
production-ready.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from functools import lru_cache

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


class SMSDeliveryError(Exception):
    """The message did not get to the gateway."""


class BaseSMSProvider:
    def send(self, *, to: str, message: str) -> None:
        raise NotImplementedError


class ConsoleSMSProvider(BaseSMSProvider):
    """Development only. Prints the message, code and all, because reading it
    off the console is the point."""

    def __init__(self):
        if not settings.DEBUG:
            raise ImproperlyConfigured(
                'SMS_PROVIDER=console only works with DEBUG on. Configure a real '
                'SMS provider before running with DEBUG off.'
            )

    def send(self, *, to: str, message: str) -> None:
        logger.info('[sms:console] to=%s message=%s', to, message)


class LocMemSMSProvider(BaseSMSProvider):
    """Collects messages in `outbox` instead of sending them. Used by tests,
    which read the code out of the message the same way a phone would."""

    outbox: list[dict[str, str]] = []

    def send(self, *, to: str, message: str) -> None:
        LocMemSMSProvider.outbox.append({'to': to, 'message': message})


class HTTPSMSProvider(BaseSMSProvider):
    """A vendor's HTTP API. Credentials come from the environment."""

    def __init__(self):
        missing = [
            name
            for name in ('SMS_BASE_URL', 'SMS_API_KEY', 'SMS_SENDER_ID')
            if not getattr(settings, name, '')
        ]
        if missing:
            raise ImproperlyConfigured(
                f'SMS_PROVIDER=http needs {", ".join(missing)} in the environment.'
            )
        self.base_url = settings.SMS_BASE_URL
        self.api_key = settings.SMS_API_KEY
        self.api_secret = settings.SMS_API_SECRET
        self.sender_id = settings.SMS_SENDER_ID
        self.timeout = settings.SMS_TIMEOUT_SECONDS

    def _payload(self, to: str, message: str) -> dict:
        """Adapt this to the vendor. Kept apart so swapping gateways is one
        method, not a rewrite."""
        return {
            'api_key': self.api_key,
            'api_secret': self.api_secret,
            'sender_id': self.sender_id,
            'to': to,
            'message': message,
        }

    def send(self, *, to: str, message: str) -> None:
        body = json.dumps(self._payload(to, message)).encode()
        request = urllib.request.Request(
            self.base_url,
            data=body,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                if response.status >= 400:
                    raise SMSDeliveryError(f'SMS gateway returned {response.status}')
        except urllib.error.URLError as error:
            # The reason, never the message: the message holds the code.
            logger.warning('[sms:http] delivery to %s failed: %s', to, error.reason)
            raise SMSDeliveryError(str(error.reason)) from error


PROVIDERS = {
    'console': ConsoleSMSProvider,
    'locmem': LocMemSMSProvider,
    'http': HTTPSMSProvider,
}


@lru_cache(maxsize=None)
def _build(name: str) -> BaseSMSProvider:
    try:
        return PROVIDERS[name]()
    except KeyError:
        raise ImproperlyConfigured(
            f'Unknown SMS_PROVIDER {name!r}. Choose one of: {", ".join(PROVIDERS)}.'
        ) from None


def get_sms_provider() -> BaseSMSProvider:
    return _build(settings.SMS_PROVIDER)
