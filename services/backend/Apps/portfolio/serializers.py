"""Gallery images, in and out."""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from Apps.common.images import MAX_IMAGE_CHARS, validate_image_ref

from .models import GalleryImage


class GalleryImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = GalleryImage
        fields = ('id', 'image', 'caption', 'sort_order', 'created_at')
        read_only_fields = ('id', 'created_at')

    def validate_image(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError(
                [serializers.ErrorDetail('Choose a picture.', code='required')]
            )
        if len(value) > MAX_IMAGE_CHARS:
            raise serializers.ValidationError(
                [serializers.ErrorDetail('That image is too large. Use one under 1 MB.',
                                         code='image_too_large')]
            )
        try:
            validate_image_ref(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(
                [serializers.ErrorDetail(error.messages[0], code='image_invalid')]
            ) from error
        return value
