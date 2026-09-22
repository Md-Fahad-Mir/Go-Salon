"""Small shared helpers for list-shaped text fields."""

from __future__ import annotations

from rest_framework import serializers


class StringListField(serializers.ListField):
    """A list of short, non-blank strings — specialties, amenities, what a
    service includes. Blanks are dropped rather than stored as empty rows."""

    def __init__(self, *, max_length: int = 20, item_max_length: int = 60, **kwargs):
        kwargs.setdefault('required', False)
        kwargs.setdefault(
            'child', serializers.CharField(max_length=item_max_length, allow_blank=True)
        )
        kwargs.setdefault('max_length', max_length)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        items = super().to_internal_value(data)
        return [item.strip() for item in items if item and item.strip()]
