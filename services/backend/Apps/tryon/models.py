"""The 360° try-on: which video model renders it, and a log of every video
asked for.

The video itself is never stored here. It is rendered upstream, fetched
through the AI service when the app asks for it, and kept on the customer's
device — the same place every try-on result already lives. What this keeps is
who asked for which style and how it went: the per-generation record that
`Apps.hairstyles` and the admin user stats were written expecting.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models


class TryOnSettings(models.Model):
    """Platform-wide, one row, edited from the admin dashboard's
    Settings → AI generation. A blank `video_model` means "whatever the AI
    service is configured with" (`OPENROUTER_VIDEO_MODEL`)."""

    video_model = models.CharField(max_length=120, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )

    class Meta:
        verbose_name = 'try-on settings'
        verbose_name_plural = 'try-on settings'

    def __str__(self) -> str:
        return self.video_model or 'AI service default'

    @classmethod
    def load(cls) -> TryOnSettings:
        row, _ = cls.objects.get_or_create(pk=1)
        return row


class VideoStatus(models.TextChoices):
    PROCESSING = 'processing', 'Processing'
    COMPLETED = 'completed', 'Completed'
    FAILED = 'failed', 'Failed'


class TryOnVideo(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='try_on_videos')
    #: The style as it was when asked for. Kept as a name too, so an admin
    #: renaming or deleting it later does not rewrite anybody's history.
    hairstyle = models.ForeignKey(
        'hairstyles.Hairstyle', null=True, blank=True, on_delete=models.SET_NULL, related_name='try_on_videos',
    )
    hairstyle_name = models.CharField(max_length=80)
    #: The upstream job, through the AI service. Opaque; only ever echoed back.
    job_id = models.CharField(max_length=128, unique=True)
    status = models.CharField(max_length=12, choices=VideoStatus.choices, default=VideoStatus.PROCESSING)
    video_model = models.CharField(max_length=120, blank=True)
    duration_seconds = models.PositiveSmallIntegerField(null=True, blank=True)
    error_code = models.CharField(max_length=40, blank=True)
    error_message = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    #: When the AI service was last asked about the job — the app polls far
    #: more often than upstream should be asked.
    checked_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-created_at',)
        indexes = [models.Index(fields=('user', '-created_at'))]

    def __str__(self) -> str:
        return f'{self.hairstyle_name} for {self.user_id} ({self.status})'
