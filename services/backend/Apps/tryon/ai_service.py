"""The backend's client for the hair-AI service's 360° video endpoints.

`urllib`, as the SMS gateway client in Apps/users/services/sms.py is: four
calls do not justify another dependency. Every failure comes out as an
`AIServiceError`, which is a DRF exception — so a view can simply let it rise
and the client receives the AI service's own `code` and message in the API's
usual `{detail, code, errors}` envelope.
"""

from __future__ import annotations

import json
import logging
import socket
import urllib.error
import urllib.parse
import urllib.request
import uuid

from django.conf import settings
from rest_framework.exceptions import APIException

logger = logging.getLogger(__name__)


class AIServiceError(APIException):
    status_code = 502
    default_code = 'ai_service_error'
    default_detail = 'The AI service could not complete that request.'

    def __init__(self, code: str, message: str, status: int = 502):
        self.status_code = status
        super().__init__(detail=message, code=code)

    @property
    def code(self) -> str:
        return getattr(self.detail, 'code', self.default_code)


def _url(path: str) -> str:
    return f'{settings.AI_SERVICE_URL}{path}'


def _headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = {'Accept': 'application/json', **(extra or {})}
    if settings.AI_SERVICE_TOKEN:
        headers['Authorization'] = f'Bearer {settings.AI_SERVICE_TOKEN}'
    return headers


def _error_from(status: int, body: bytes) -> AIServiceError:
    """The AI service's `{"detail": {"code", "message"}}`, or whatever came back."""
    code, message = 'ai_service_error', 'The AI service could not complete that request.'
    try:
        detail = json.loads(body or b'{}').get('detail')
    except (ValueError, AttributeError):
        detail = None
    if isinstance(detail, dict):
        code = str(detail.get('code') or code)
        message = str(detail.get('message') or message)
    elif isinstance(detail, str) and detail:
        message = detail
    elif isinstance(detail, list):
        code = 'invalid_request'
    # A 401 from the service means the two halves disagree on the shared
    # secret. That is ours to fix, not the customer's, so it reads as such.
    if status == 401:
        logger.error('AI service refused our token; check AI_SERVICE_TOKEN on both sides.')
        return AIServiceError('ai_service_unconfigured', 'The AI service is not configured correctly.', 503)
    return AIServiceError(code, message, status if 400 <= status < 600 else 502)


def _send(method: str, path: str, *, timeout: int, body: bytes | None = None,
          headers: dict[str, str] | None = None) -> tuple[bytes, str]:
    request = urllib.request.Request(_url(path), data=body, headers=_headers(headers), method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read(), response.headers.get('Content-Type', '')
    except urllib.error.HTTPError as error:
        raise _error_from(error.code, error.read()) from error
    except (TimeoutError, socket.timeout) as error:
        logger.warning('AI service timed out on %s %s', method, path)
        raise AIServiceError('provider_timeout', 'The AI service took too long. Try again.', 504) from error
    except urllib.error.URLError as error:
        if isinstance(error.reason, (TimeoutError, socket.timeout)):
            raise AIServiceError('provider_timeout', 'The AI service took too long. Try again.', 504) from error
        logger.error('Could not reach the AI service at %s: %s', settings.AI_SERVICE_URL, error.reason)
        raise AIServiceError(
            'ai_service_unreachable', 'The AI service could not be reached. Try again shortly.', 502,
        ) from error


def _json(method: str, path: str, *, timeout: int, **kwargs) -> dict:
    raw, _ = _send(method, path, timeout=timeout, **kwargs)
    try:
        payload = json.loads(raw)
    except ValueError as error:
        raise AIServiceError('invalid_response', 'The AI service sent something unreadable.', 502) from error
    if not isinstance(payload, dict):
        raise AIServiceError('invalid_response', 'The AI service sent something unreadable.', 502)
    return payload


def encode_multipart(fields: dict[str, str], files: dict[str, tuple[str, str, bytes]]) -> tuple[bytes, str]:
    """A `multipart/form-data` body and its Content-Type. Field names and file
    names are ours, never a client's, so nothing here needs escaping."""
    boundary = uuid.uuid4().hex
    parts: list[bytes] = []
    for name, value in fields.items():
        parts += [
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode(),
            b'\r\n',
        ]
    for name, (filename, content_type, data) in files.items():
        parts += [
            (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
             f'Content-Type: {content_type}\r\n\r\n').encode(),
            data,
            b'\r\n',
        ]
    parts.append(f'--{boundary}--\r\n'.encode())
    return b''.join(parts), f'multipart/form-data; boundary={boundary}'


def _job_path(job_id: str) -> str:
    return f'/videos/{urllib.parse.quote(job_id, safe="")}'


# ─────────────────────────────────────────────────────────────────────────────
def video_models() -> dict:
    """`{"default_model", "models": [...]}` — every model the try-on can use."""
    return _json('GET', '/videos/models', timeout=settings.AI_SERVICE_TIMEOUT_SECONDS)


def start_video(*, photo: bytes, content_type: str, hairstyle_name: str, prompt: str,
                hairstyle_id: str, video_model: str) -> dict:
    """Render the haircut onto the photo and start the 360° video from it.
    Slow (the image edit runs before this returns); see the start timeout."""
    extension = {'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'}.get(content_type, 'jpg')
    body, multipart_type = encode_multipart(
        {
            'hairstyle_name': hairstyle_name,
            'hairstyle_description': prompt,
            'hairstyle_id': hairstyle_id,
            'video_model': video_model,
        },
        {'image': (f'photo.{extension}', content_type or 'image/jpeg', photo)},
    )
    return _json(
        'POST', '/videos', timeout=settings.AI_SERVICE_START_TIMEOUT_SECONDS,
        body=body, headers={'Content-Type': multipart_type},
    )


def video_status(job_id: str) -> dict:
    """`{"id", "status", "error"?}` with status processing | completed | failed."""
    return _json('GET', _job_path(job_id), timeout=settings.AI_SERVICE_TIMEOUT_SECONDS)


def video_content(job_id: str) -> tuple[bytes, str]:
    """The finished clip and its content type."""
    content, content_type = _send(
        'GET', f'{_job_path(job_id)}/content', timeout=settings.AI_SERVICE_TIMEOUT_SECONDS,
        headers={'Accept': 'video/*'},
    )
    content_type = content_type.split(';')[0].strip()
    return content, content_type if content_type.startswith('video/') else 'video/mp4'
