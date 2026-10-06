"""simplejwt's tokens, with lifetimes read when a token is minted.

simplejwt fixes `lifetime` on the token class at import. Here it is a
property, so a lifetime changed on the dashboard applies to the next token
issued — a sign-in, a refresh — without a restart. Tokens already out keep
the expiry written into them; verifying one never reads the lifetime.
"""

from __future__ import annotations

from datetime import timedelta

from rest_framework_simplejwt import serializers, tokens

from .runtime import config


class AccessToken(tokens.AccessToken):
    @property
    def lifetime(self) -> timedelta:
        return timedelta(minutes=config.JWT_ACCESS_TOKEN_LIFETIME_MINUTES)


class RefreshToken(tokens.RefreshToken):
    access_token_class = AccessToken

    @property
    def lifetime(self) -> timedelta:
        return timedelta(days=config.JWT_REFRESH_TOKEN_LIFETIME_DAYS)


class TokenRefreshSerializer(serializers.TokenRefreshSerializer):
    """/api/auth/token/refresh/ — rotation mints the new pair from these."""

    token_class = RefreshToken
