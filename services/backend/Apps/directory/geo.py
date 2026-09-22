"""How far away something is.

Great-circle distance in kilometres. Accurate enough to sort a list of salons
in one city, and it needs no database extension — which matters while this is
still SQLite.
"""

from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_KM = 6371.0088


def distance_km(lat1: float | None, lng1: float | None,
                lat2: float | None, lng2: float | None) -> float | None:
    """None when either end has no pin — a business that never set its
    coordinates is not "zero kilometres away", it is unknown."""
    if None in (lat1, lng1, lat2, lng2):
        return None
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    )
    return round(2 * EARTH_RADIUS_KM * asin(sqrt(a)), 2)
