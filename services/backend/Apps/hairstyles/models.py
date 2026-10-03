"""The AI try-on catalogue — the styles an admin curates for the generator
to offer. Entirely platform-wide: unlike a salon's own price list, a
hairstyle belongs to no tenant.

`generation_count` is a running counter rather than a derived value: nothing
in this codebase yet calls back into Django when the AI service renders a
style, so it starts at zero and stays there until that wiring exists. It is
kept on the model now rather than bolted on later, so the admin dashboard has
somewhere real to read it from the moment that integration lands.
"""

from __future__ import annotations

from django.db import models

from Apps.common.images import ImageRefField


class Hairstyle(models.Model):
    name = models.CharField(max_length=80)
    #: Free text rather than a foreign key: the admin console lets a curator
    #: type a new one on the spot, and a catalogue of a few dozen styles does
    #: not need a managed taxonomy to stay tidy.
    category = models.CharField(max_length=60)
    #: The prompt sent to the AI generator for this look.
    description = models.TextField(blank=True)
    image = ImageRefField()
    is_active = models.BooleanField(default=True)
    generation_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return self.name
