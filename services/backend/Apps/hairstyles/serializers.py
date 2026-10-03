from __future__ import annotations

from rest_framework import serializers

from .models import Hairstyle


class HairstyleSerializer(serializers.ModelSerializer):
    #: Mirrors the admin dashboard's `EntityStatus` ('active'/'inactive')
    #: rather than exposing the raw boolean, so the client needs no mapping.
    status = serializers.SerializerMethodField()

    class Meta:
        model = Hairstyle
        fields = (
            'id', 'name', 'category', 'description', 'image', 'is_active',
            'status', 'generation_count', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'status', 'generation_count', 'created_at', 'updated_at')

    def get_status(self, hairstyle: Hairstyle) -> str:
        return 'active' if hairstyle.is_active else 'inactive'

    def validate_name(self, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError('Give this style a name.')
        return value

    def validate_category(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Pick or add a category.')
        return value
