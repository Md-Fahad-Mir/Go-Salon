"""The 360° try-on video, for the app; and its model, for the admin.

    POST /api/tryon/videos/                  photo + hairstyle id → a video job
    GET  /api/tryon/videos/<pk>/             where it is
    GET  /api/tryon/videos/<pk>/content/     the finished clip
    GET|PATCH /api/admin/settings/ai-generation/   the video model, admin only

The app sends a hairstyle *id*, never a prompt. The prompt is read here from
the admin's active catalogue entry and the model from the admin's setting, so
what reaches the AI service is exactly what the dashboard says — a customer
cannot try on a style the admin has withdrawn, or bring their own words.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.db.models import F
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from Apps.hairstyles.models import Hairstyle
from Apps.users.models import Role
from Apps.users.permissions import IsAdmin

from . import ai_service
from .ai_service import AIServiceError
from .models import TryOnSettings, TryOnVideo, VideoStatus
from .serializers import TryOnVideoSerializer

logger = logging.getLogger(__name__)

#: The AI service's own upload ceiling (MAX_UPLOAD_MB). Refused here first so
#: an oversized photo never makes the trip.
MAX_PHOTO_BYTES = 10 * 1024 * 1024

#: Failures worth riding out: the next poll may well succeed.
_TRANSIENT = {'provider_timeout', 'provider_unreachable', 'ai_service_unreachable', 'rate_limited'}


class CanTryOn(BasePermission):
    """The app's own rule (`TRY_ON` in services/frontend/src/App.tsx): a
    customer's try-on, and a salon's for the clients in its chairs."""

    message = 'The AI try-on is for customers and salon staff.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.role in (
            Role.CUSTOMER, Role.SALON_OWNER, Role.SALON_EMPLOYEE,
        ))


def _not_found(detail: str = 'No such video.', code: str = 'not_found') -> Response:
    return Response({'detail': detail, 'code': code, 'errors': {}}, status=status.HTTP_404_NOT_FOUND)


def refresh_status(video: TryOnVideo, *, now=None) -> TryOnVideo:
    """Ask the AI service about a job still in flight — at most once per
    TRYON_VIDEO_POLL_SECONDS, however often the app polls.

    The style's `generation_count` goes up exactly once, on the transition to
    completed: the update is conditional on the row still being in flight, so
    two polls landing together cannot both count it.
    """
    if video.status != VideoStatus.PROCESSING:
        return video
    now = now or timezone.now()
    if video.checked_at and (now - video.checked_at).total_seconds() < settings.TRYON_VIDEO_POLL_SECONDS:
        return video

    try:
        upstream = ai_service.video_status(video.job_id)
    except AIServiceError as error:
        if error.code == 'video_not_found':
            upstream = {'status': VideoStatus.FAILED, 'error': {
                'code': 'video_failed', 'message': 'The 360° video could not be found. Try again.',
            }}
        elif error.code in _TRANSIENT or error.status_code >= 500:
            logger.warning('Status check for video %s failed (%s); will retry.', video.pk, error.code)
            TryOnVideo.objects.filter(pk=video.pk).update(checked_at=now)
            video.checked_at = now
            return video
        else:
            raise

    state = upstream.get('status')
    in_flight = TryOnVideo.objects.filter(pk=video.pk, status=VideoStatus.PROCESSING)
    if state == VideoStatus.COMPLETED:
        if in_flight.update(status=VideoStatus.COMPLETED, checked_at=now, completed_at=now) and video.hairstyle_id:
            Hairstyle.objects.filter(pk=video.hairstyle_id).update(generation_count=F('generation_count') + 1)
    elif state == VideoStatus.FAILED:
        error = upstream.get('error') or {}
        in_flight.update(
            status=VideoStatus.FAILED, checked_at=now,
            error_code=str(error.get('code') or 'video_failed')[:40],
            error_message=str(error.get('message') or 'The 360° video could not be made. Try again.')[:255],
        )
    else:
        in_flight.update(checked_at=now)
    video.refresh_from_db()
    return video


class TryOnVideoCreateView(GenericAPIView):
    permission_classes = (IsAuthenticated, CanTryOn)
    serializer_class = TryOnVideoSerializer

    def post(self, request):
        photo = request.FILES.get('image')
        if photo is None:
            raise ValidationError({'image': ['Add a photo of yourself.']})
        if photo.size > MAX_PHOTO_BYTES:
            raise ValidationError({'image': ['That photo is over 10 MB.']})
        if not (photo.content_type or '').startswith('image/'):
            raise ValidationError({'image': ['That file is not a photo.']})

        try:
            hairstyle_id = int(request.data.get('hairstyle_id'))
        except (TypeError, ValueError):
            raise ValidationError({'hairstyle_id': ['Pick a hairstyle.']}) from None
        hairstyle = Hairstyle.objects.filter(pk=hairstyle_id, is_active=True).first()
        if hairstyle is None:
            return _not_found('That style is no longer available.', 'hairstyle_unavailable')

        started = ai_service.start_video(
            photo=photo.read(),
            content_type=photo.content_type or 'image/jpeg',
            hairstyle_name=hairstyle.name,
            prompt=hairstyle.description,
            hairstyle_id=str(hairstyle.pk),
            video_model=TryOnSettings.load().video_model,
        )
        job = started.get('job') or {}
        meta = started.get('meta') or {}
        if not job.get('id'):
            raise AIServiceError('invalid_response', 'The AI service did not start the video.', 502)

        video = TryOnVideo.objects.create(
            user=request.user,
            hairstyle=hairstyle,
            hairstyle_name=hairstyle.name,
            job_id=str(job['id'])[:128],
            video_model=str(meta.get('video_model') or '')[:120],
            duration_seconds=meta.get('duration_seconds') or None,
        )
        poster = started.get('poster') or {}
        body = self.get_serializer(video).data
        # The still the video starts from, so the app has something to show
        # — and to keep as the result's thumbnail — while the video renders.
        # Not stored: it is the customer's face.
        body['poster'] = (
            f'data:{poster.get("mime_type") or "image/jpeg"};base64,{poster["b64"]}' if poster.get('b64') else ''
        )
        return Response(body, status=status.HTTP_201_CREATED)


class TryOnVideoDetailView(GenericAPIView):
    permission_classes = (IsAuthenticated, CanTryOn)
    serializer_class = TryOnVideoSerializer

    def get(self, request, pk: int):
        video = TryOnVideo.objects.filter(pk=pk, user=request.user).first()
        if video is None:
            return _not_found()
        return Response(self.get_serializer(refresh_status(video)).data)


class TryOnVideoContentView(GenericAPIView):
    permission_classes = (IsAuthenticated, CanTryOn)

    def get(self, request, pk: int):
        video = TryOnVideo.objects.filter(pk=pk, user=request.user).first()
        if video is None:
            return _not_found()
        video = refresh_status(video)
        if video.status != VideoStatus.COMPLETED:
            return Response(
                {'detail': 'The video is not ready yet.', 'code': 'video_not_ready', 'errors': {}},
                status=status.HTTP_409_CONFLICT,
            )
        content, content_type = ai_service.video_content(video.job_id)
        response = HttpResponse(content, content_type=content_type)
        response['Cache-Control'] = 'no-store'
        response['Content-Disposition'] = f'inline; filename="gosalon-360-{video.pk}.mp4"'
        return response


class AdminAIGenerationSettingsView(GenericAPIView):
    """Settings → AI generation in the admin dashboard: which OpenRouter video
    model renders every 360° try-on, picked from the ones that can."""

    permission_classes = (IsAuthenticated, IsAdmin)

    def _payload(self, catalogue: dict | None = None) -> dict:
        row = TryOnSettings.load()
        error = None
        if catalogue is None:
            try:
                catalogue = ai_service.video_models()
            except AIServiceError as exc:
                catalogue = {}
                error = {'code': exc.code, 'message': str(exc.detail)}
        models = catalogue.get('models') or []
        default_model = str(catalogue.get('default_model') or '')
        effective = row.video_model or default_model
        return {
            'video_model': effective,
            # Blank until an admin picks one; the AI service's default rules.
            'selected': row.video_model,
            'default_model': default_model,
            'models': models,
            # False when the chosen model has left OpenRouter's catalogue or
            # stopped fitting a 2–3 s turn: every try-on would then fail.
            'video_model_available': any(m.get('id') == effective for m in models) if models else None,
            'models_error': error,
            'updated_at': row.updated_at,
        }

    def get(self, request):
        return Response(self._payload())

    def patch(self, request):
        wanted = str(request.data.get('video_model') or '').strip()
        catalogue = ai_service.video_models()
        if wanted not in {m.get('id') for m in catalogue.get('models') or []}:
            raise ValidationError({'video_model': ['Choose one of the listed video models.']})
        row = TryOnSettings.load()
        row.video_model = wanted
        row.updated_by = request.user
        row.save(update_fields=('video_model', 'updated_by', 'updated_at'))
        return Response(self._payload(catalogue))
