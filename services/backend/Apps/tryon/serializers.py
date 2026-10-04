from __future__ import annotations

from rest_framework import serializers

from .models import TryOnVideo, VideoStatus


class TryOnVideoSerializer(serializers.ModelSerializer):
    #: `{code, message}` once a video has failed, null otherwise — the same
    #: pair every other refusal in this API carries.
    error = serializers.SerializerMethodField()

    class Meta:
        model = TryOnVideo
        fields = (
            'id', 'status', 'hairstyle_id', 'hairstyle_name', 'video_model', 'duration_seconds',
            'error', 'created_at', 'completed_at',
        )
        read_only_fields = fields

    def get_error(self, video: TryOnVideo) -> dict | None:
        if video.status != VideoStatus.FAILED:
            return None
        return {'code': video.error_code or 'video_failed', 'message': video.error_message}
