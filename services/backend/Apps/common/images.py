"""Pictures, as this project stores them.

An avatar, a cover or a gallery shot is kept as a *string*: either a `data:`
URL — which is exactly what the frontend's existing cropper produces — or an
ordinary https link to a file hosted elsewhere. There is no upload endpoint,
no media root and no Pillow.

That is a deliberate trade. It keeps one JSON API, reuses the picker the app
already has, and costs a few tens of kilobytes a row. A real deployment with
many photographs should move these to object storage and keep the URL here;
the field is a string either way, so that migration is a backfill rather than
a redesign.
"""

from __future__ import annotations

import re

from django.core.exceptions import ValidationError
from django.db import models

#: Roughly 1.5 MB of characters — about a 1 MB photograph once base64 is
#: accounted for. Comfortably more than the 320 px squares the app produces,
#: and small enough that one row cannot fill a response on its own.
MAX_IMAGE_CHARS = 1_500_000

_DATA_URL = re.compile(r'^data:image/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$')
_HTTP_URL = re.compile(r'^https?://\S+$')
#: A name from the app's own icon set — "scissors", "git-branch". Categories
#: use these far more often than they use a picture.
_ICON_NAME = re.compile(r'^[a-z][a-z0-9-]{1,39}$')


def validate_image_ref(value: str) -> None:
    """A picture is a data URL, an http(s) link, or the name of an icon the
    app already ships. Anything else is refused — a bare filename would be a
    path waiting to be dereferenced."""
    if not value:
        return
    if len(value) > MAX_IMAGE_CHARS:
        raise ValidationError(
            'That image is too large. Use one under 1 MB.', code='image_too_large'
        )
    if _DATA_URL.match(value) or _HTTP_URL.match(value) or _ICON_NAME.match(value):
        return
    raise ValidationError(
        'Give an image as a data URL, an https link, or an icon name.',
        code='image_invalid',
    )


class ImageRefField(models.TextField):
    """A picture reference. Blank means "none set"."""

    def __init__(self, **kwargs):
        kwargs.setdefault('blank', True)
        kwargs.setdefault('default', '')
        kwargs.setdefault('validators', [validate_image_ref])
        super().__init__(**kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        # The validator is part of the field's definition, not of any one
        # migration, so it never needs writing into the migration file.
        kwargs.pop('validators', None)
        return name, path, args, kwargs
