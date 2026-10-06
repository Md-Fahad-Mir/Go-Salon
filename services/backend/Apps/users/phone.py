"""Phone numbers, in one shape.

An account is its phone number, and people write the same number many ways:
+8801712345678, +880 1712-345678, 00880 1712 345678 — or, at home,
01712345678. All of them are the same account, so everything is normalised to
E.164 — `+`, the country code, the national number without its trunk prefix:
+8801712345678, +447400123456 — before it is stored or looked up.

Numbers from every country are accepted. What a valid number looks like in
each — its length, its prefixes, which ranges are mobiles — comes from Google's
libphonenumber metadata (the `phonenumbers` package), never from a pattern
written here. Only numbers that can receive a text are: every number this
module touches either signs in with a code sent by SMS or is one a customer is
texted on, and a landline can do neither.

A number written with its country code needs nothing else. One written the way
it is dialled at home, with no country code, is read as a number in
`PHONE_DEFAULT_REGION` — a convenience for whoever types into the Django admin
or calls the API by hand, not a limit on who can sign up. The apps always send
E.164.
"""

from __future__ import annotations

import phonenumbers
from django.conf import settings
from django.core.exceptions import ValidationError
from phonenumbers import NumberParseException, PhoneNumberFormat, PhoneNumberType

#: The kinds of number a code can be texted to. Where a country does not tell
#: its mobiles from its landlines (the US, Canada), libphonenumber answers
#: FIXED_LINE_OR_MOBILE, and those numbers are mobiles as far as anyone knows.
TEXTABLE = frozenset({PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE})

INVALID_MESSAGE = 'Enter a valid mobile number, starting with its country code.'


def parse_phone(value: str) -> phonenumbers.PhoneNumber | None:
    """The mobile number in `value`, or None when there is not one."""
    text = (value or '').strip()
    # "00" is how most of the world dials out; libphonenumber only knows that
    # from a default region, and the number should not depend on having one.
    if text.startswith('00'):
        text = f'+{text[2:]}'
    region = (getattr(settings, 'PHONE_DEFAULT_REGION', '') or '').upper() or None
    try:
        number = phonenumbers.parse(text, region)
    except NumberParseException:
        return None
    if number.extension or not phonenumbers.is_valid_number(number):
        return None
    if phonenumbers.number_type(number) not in TEXTABLE:
        return None
    return number


def is_valid_phone(value: str) -> bool:
    return parse_phone(value) is not None


def normalize_phone(value: str) -> str:
    """E.164 form. Raises rather than storing something that is not a number,
    because a bad phone is an account nobody can ever sign into."""
    number = parse_phone(value)
    if number is None:
        raise ValidationError(INVALID_MESSAGE)
    return phonenumbers.format_number(number, PhoneNumberFormat.E164)
