"""DRF's three throttles, with rates an administrator can change.

DRF copies its rate table onto the throttle class at import, so a new rate
would otherwise wait for a restart. These ask on every request instead: the
administrator's rate for the scope when there is one, DRF's own table — the
environment's THROTTLE_* values — when not.

Request counts are kept per scope and per caller whatever the rate, so a
changed rate applies to the requests already counted.
"""

from __future__ import annotations

from rest_framework import throttling

from .runtime import overrides


class _AdjustableRate:
    scope: str | None

    def get_rate(self):
        rate = overrides().get(f'throttle_{self.scope}')
        return rate or super().get_rate()


class AnonRateThrottle(_AdjustableRate, throttling.AnonRateThrottle):
    pass


class UserRateThrottle(_AdjustableRate, throttling.UserRateThrottle):
    pass


class ScopedRateThrottle(_AdjustableRate, throttling.ScopedRateThrottle):
    pass
