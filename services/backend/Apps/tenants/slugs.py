"""Turning a business name into a readable handle.

A tenant's slug is a label for people: it may end up in a shareable profile
link, and it is what makes a row recognisable in a log or an admin list.
**It is not a hostname — this system has no subdomains** — and nothing about
routing or authorisation reads it (see `Apps/tenants/models.py`).

It is still held to URL-safe label rules, because something that may appear in
a link should not need escaping to get there: lowercase ASCII letters, digits
and hyphens, no leading or trailing hyphen, and 63 characters at the outside.
That last number is inherited from the DNS label rules these conventions come
from, not from any intention to use one.

Salon names in this database are frequently Bengali, and `django.utils.text.
slugify` drops non-ASCII entirely, so `সেলুন রাজ` comes back as the empty
string. Silently falling back to `salon-7` for every Bengali shop would be a
directory of numbers, so the Bengali block is transliterated first and only
what survives neither transliteration nor ASCII-folding reaches the fallback.

The transliteration below is deliberately plain: it is a character map, not a
phonetic engine, and it will not always agree with how a person would romanise
their own shop's name. It only has to produce something stable, readable and
unique — an owner who dislikes the result should be able to change it, which
is a later step's problem.

This lives beside the models rather than inside the backfill command because
registration will have to allocate a slug the same way, and two copies of
these rules would drift.
"""

from __future__ import annotations

import re
import unicodedata

#: Words a slug must not be, so that a tenant handle can never collide with a
#: path segment the app already uses — `join`, `admin`, `api` and the rest of
#: the vocabulary a future profile URL would sit beside. A name that lands on
#: one of these is suffixed rather than refused: a shop really called "Help"
#: is not an error, it just cannot have that exact handle.
RESERVED_SLUGS = frozenset({
    'www', 'api', 'admin', 'app', 'join', 'static', 'assets', 'cdn',
    'mail', 'smtp', 'ftp', 'blog', 'help', 'support', 'status',
    'dev', 'staging', 'test',
})

#: The shape a handle has to have: 1-63 characters, alphanumeric at both ends,
#: hyphens inside. Borrowed from DNS label rules because they are a well-worn
#: definition of "safe in a URL without escaping", not because of any hostname.
SAFE_LABEL = re.compile(r'^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$')

MAX_LABEL = 63

#: Bengali (U+0980-U+09FF), as a character map. Vowel signs carry their own
#: entry because they are separate code points that follow the consonant, and
#: the virama (hasant, U+09CD) maps to nothing — it joins two consonants, and
#: what a romanisation wants there is the two consonants side by side.
_BENGALI = {
    # independent vowels
    'অ': 'a', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u',
    'ঋ': 'ri', 'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou',
    # consonants
    'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
    'চ': 'ch', 'ছ': 'chh', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
    'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
    'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
    'প': 'p', 'ফ': 'ph', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
    'য': 'j', 'র': 'r', 'ল': 'l',
    'শ': 'sh', 'ষ': 'sh', 'স': 's', 'হ': 'h',
    # Written as escapes on purpose. Typed literally, these three arrive in
    # the source file already decomposed — a consonant plus a nukta, two code
    # points — and a two-character key can never match a single-character
    # lookup. `_NUKTA` below composes the input to exactly these.
    '\u09dc': 'r', '\u09dd': 'rh', '\u09df': 'y', '\u09ce': 't',
    # vowel signs (matras)
    'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri',
    'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou',
    # marks
    'ং': 'ng', 'ঃ': 'h', 'ঁ': 'n', '্': '',
    # digits
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
}


#: `ড়`, `ঢ়` and `য়` are Unicode composition exclusions, so NFC will *not*
#: join a bare consonant and a following nukta back into them. Left alone, a
#: decomposed `য়` loses its nukta to the combining-mark filter below and comes
#: back as `j` instead of `y` — which is how `হেয়ার` romanised as `hejar`.
#: They are recomposed by hand, before the map, because no normal form does it.
_NUKTA = (
    ('\u09af\u09bc', '\u09df'),  # ya   + nukta  ->  ya-with-nukta
    ('\u09a1\u09bc', '\u09dc'),  # dda  + nukta  ->  dda-with-nukta
    ('\u09a2\u09bc', '\u09dd'),  # ddha + nukta  ->  ddha-with-nukta
)


def transliterate(value: str) -> str:
    """Bengali to Latin, then accented Latin to plain, then drop the rest.

    Three passes rather than one because they answer different questions:
    the map handles a script ASCII knows nothing about, NFKD handles `é` and
    `ü`, and anything still non-ASCII after both — Arabic, Chinese, an emoji —
    has no honest romanisation here and is removed. A name made entirely of
    such characters therefore slugs to nothing, which is what the caller's
    fallback is for.

    The map runs before NFKD on purpose: NFKD would decompose `য়` into the
    consonant and the nukta this function has just finished joining together.
    """
    value = value or ''
    for decomposed, composed in _NUKTA:
        value = value.replace(decomposed, composed)
    mapped = ''.join(_BENGALI.get(char, char) for char in value)
    folded = unicodedata.normalize('NFKD', mapped)
    return ''.join(char for char in folded if not unicodedata.combining(char) and ord(char) < 128)


def slugify_name(value: str) -> str:
    """A business name as a safe handle, or `''` when nothing usable survives."""
    ascii_only = transliterate(value).lower()
    # Every run of anything that is not a letter or a digit becomes one hyphen,
    # so "Mr. Tanvir's Cuts!!" is `mr-tanvir-s-cuts`, not `mr--tanvir--s--cuts`.
    hyphenated = re.sub(r'[^a-z0-9]+', '-', ascii_only).strip('-')
    if not hyphenated:
        return ''
    trimmed = hyphenated[:MAX_LABEL].strip('-')
    return trimmed if SAFE_LABEL.match(trimmed) else ''


def _suffixed(base: str, n: int) -> str:
    """`base-n`, shortened from the left so the suffix always survives."""
    suffix = f'-{n}'
    return f'{base[:MAX_LABEL - len(suffix)].strip("-")}{suffix}'


def unique_slug(name: str, *, fallback: str, taken: set[str]) -> tuple[str, str]:
    """A slug nobody else holds, and why it is not simply the name.

    Returns `(slug, note)` where note is `''` for the ordinary case, or one of
    `fallback` (the name produced nothing usable), `reserved` (the name landed
    on an infrastructure label) or `collision` (somebody already has it). The
    caller reports the note rather than having to work out what happened.

    `taken` is the set of slugs already spoken for, and this function adds to
    it, so a whole run can be allocated without asking the database between
    every row — and without two new tenants in the same run agreeing on a name.
    """
    note = ''
    base = slugify_name(name)
    if not base:
        base, note = fallback, 'fallback'

    if base in RESERVED_SLUGS:
        note = note or 'reserved'
        candidate, n = _suffixed(base, 2), 2
        while candidate in taken or candidate in RESERVED_SLUGS:
            n += 1
            candidate = _suffixed(base, n)
    elif base in taken:
        note = note or 'collision'
        candidate, n = _suffixed(base, 2), 2
        while candidate in taken or candidate in RESERVED_SLUGS:
            n += 1
            candidate = _suffixed(base, n)
    else:
        candidate = base

    taken.add(candidate)
    return candidate, note
