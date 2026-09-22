"""One error shape for every authentication endpoint.

The frontend shows what `detail` says and branches on `code`, so both are
always present and `errors` carries the per-field messages a form needs:

    {"detail": "That code is not right.", "code": "otp_invalid", "errors": {}}
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler


class PhoneNotVerified(APIException):
    """Right password, unproved phone. The frontend sends them to the code
    screen rather than to a generic failure."""

    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'phone_not_verified'
    default_detail = 'Verify your phone number before signing in.'


class OTPCooldown(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = 'otp_cooldown'

    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__(f'Wait {retry_after} seconds before asking for another code.')


class OTPSendLimit(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = 'otp_send_limit'
    default_detail = 'Too many codes requested. Try again later.'


class SMSUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = 'sms_unavailable'
    default_detail = 'We could not send the code. Try again in a moment.'


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'conflict'


def _first_detail(value):
    """The first ErrorDetail inside DRF's nested error shapes."""
    if isinstance(value, list) and value:
        return _first_detail(value[0])
    if isinstance(value, dict) and value:
        return _first_detail(next(iter(value.values())))
    return value


def _first_message(value) -> str:
    """The message a human should read, out of DRF's nested error shapes."""
    if isinstance(value, str):
        return value
    if isinstance(value, list) and value:
        return _first_message(value[0])
    if isinstance(value, dict) and value:
        return _first_message(next(iter(value.values())))
    return 'Something went wrong.'


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    code = getattr(exc, 'default_code', 'error')
    errors: dict = {}

    if isinstance(data, dict) and set(data) == {'detail'}:
        detail = str(data['detail'])
        code = getattr(data['detail'], 'code', code)
    elif isinstance(data, dict):
        errors = data
        detail = _first_message(data)
        # A serializer's own error code is more specific than the generic
        # "invalid" DRF reaches for.
        code = getattr(_first_detail(data), 'code', code)
    else:
        errors = {'non_field_errors': data if isinstance(data, list) else [str(data)]}
        detail = _first_message(data)
        code = getattr(_first_detail(data), 'code', code)

    payload = {'detail': detail, 'code': code, 'errors': errors}
    if hasattr(exc, 'retry_after'):
        payload['retry_after'] = exc.retry_after
    response.data = payload
    return response
