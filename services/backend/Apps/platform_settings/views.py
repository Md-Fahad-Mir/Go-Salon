"""The admin dashboard's view of the environment's adjustable settings.

    GET|PATCH /api/admin/settings/platform/   admin only

Each setting comes back as what is in force, what the environment says, and
whether an administrator has overridden it. A PATCH may change any number of
them; null resets one to the environment.

The SMS gateway's key and secret are never sent, only whether the server has
them — which is what decides whether the HTTP gateway can be chosen.
"""

from __future__ import annotations

from django.conf import settings
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from Apps.users.permissions import IsAdmin

from . import runtime
from .models import PlatformSettings
from .serializers import PlatformSettingsSerializer


def settings_payload(row: PlatformSettings) -> dict:
    entries = {}
    for field in runtime.FIELDS:
        override = getattr(row, field)
        fallback = runtime.default(field)
        entries[field] = {
            'value': fallback if override is None else override,
            'default': fallback,
            'overridden': override is not None,
        }
    return {
        'settings': entries,
        'sms': {
            'api_key_configured': bool(settings.SMS_API_KEY),
            'api_secret_configured': bool(settings.SMS_API_SECRET),
            'console_allowed': settings.DEBUG,
        },
        'updated_at': row.updated_at,
    }


class AdminPlatformSettingsView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsAdmin)
    serializer_class = PlatformSettingsSerializer

    def get(self, request):
        return Response(settings_payload(PlatformSettings.load()))

    def patch(self, request):
        row = PlatformSettings.load()
        serializer = self.get_serializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data:
            serializer.save(updated_by=request.user)
        return Response(settings_payload(row))
