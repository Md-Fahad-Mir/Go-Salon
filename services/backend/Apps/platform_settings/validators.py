"""Django's minimum-length password check, with a minimum the dashboard sets.

Django builds its validators once and keeps them, so a `min_length` passed in
OPTIONS is fixed for the life of the process. This reads it on every check:
PASSWORD_MIN_LENGTH, or the administrator's value when there is one.
"""

from __future__ import annotations

from django.contrib.auth import password_validation

from .runtime import config


class MinimumLengthValidator(password_validation.MinimumLengthValidator):
    def __init__(self):
        # The parent stores a fixed `min_length`; the property below replaces it.
        pass

    @property
    def min_length(self) -> int:
        return config.PASSWORD_MIN_LENGTH
