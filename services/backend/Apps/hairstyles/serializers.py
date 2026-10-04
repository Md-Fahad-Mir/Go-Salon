from __future__ import annotations

from rest_framework import serializers

from .models import Hairstyle

#: The most of a prompt the AI service reads — `MAX_DESCRIPTION_LENGTH` in
#: services/ai/hair_generate.py. Anything past it would be cut off without a
#: word, and past 600 the service refuses the render outright, so a longer
#: prompt is turned back here, where the admin can still shorten it.
MAX_PROMPT_LENGTH = 400


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

    def validate_description(self, value: str) -> str:
        value = value.strip()
        if len(value) > MAX_PROMPT_LENGTH:
            raise serializers.ValidationError(
                f'Keep the prompt under {MAX_PROMPT_LENGTH} characters — the AI generator reads no more.'
            )
        return value


class HairstyleCatalogueSerializer(serializers.ModelSerializer):
    """One style as the app's try-on picker sees it: what to show on the card
    and the prompt to render it with. Nothing about how it is curated — the
    active flag, the counter, the timestamps — leaves the admin API."""

    prompt = serializers.CharField(source='description', read_only=True)

    class Meta:
        model = Hairstyle
        fields = ('id', 'name', 'category', 'prompt', 'image')
        read_only_fields = fields
