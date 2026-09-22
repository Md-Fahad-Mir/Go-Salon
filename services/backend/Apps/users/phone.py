"""Phone numbers, in one shape.

Bangladeshi mobiles are eleven digits starting 01, with operator prefixes
013-019. Users type them as 01712345678, +8801712345678 or 8801712345678, and
the frontend sends E.164; all of them are the same account, so everything is
normalised to +8801712345678 before it is stored or looked up.
"""

from __future__ import annotations

import re

from django.core.exceptions import ValidationError

LOCAL_RE = re.compile(r'^1[3-9]\d{8}$')
E164 = '+880{}'


def local_digits(value: str) -> str:
    """The ten digits after the country code, or '' when there are not ten."""
    digits = re.sub(r'\D', '', value or '')
    if digits.startswith('880'):
        digits = digits[3:]
    if digits.startswith('0'):
        digits = digits[1:]
    return digits


def is_valid_phone(value: str) -> bool:
    return bool(LOCAL_RE.match(local_digits(value)))


def normalize_phone(value: str) -> str:
    """E.164 form. Raises rather than storing something that is not a number,
    because a bad phone is an account nobody can ever sign into."""
    digits = local_digits(value)
    if not LOCAL_RE.match(digits):
        raise ValidationError('Enter a Bangladeshi mobile number, for example 01712345678.')
    return E164.format(digits)
