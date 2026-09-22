"""Authenticating a WebSocket, the same way a request is authenticated.

A WebSocket cannot carry an `Authorization` header — the browser API has no
way to set one — so the access token arrives another way and is then handed to
the *same* simplejwt backend the REST API uses. There is no second notion of
who somebody is here: `JWTAuthentication` validates the token and loads the
account, and everything downstream reads `scope['user']` exactly as a view
reads `request.user`.

The token is preferred in the handshake's subprotocol rather than the query
string, because a URL ends up in every access log and proxy trace it passes
through, and an access token in a log file is a live credential. The query
string is still accepted for clients that cannot set a subprotocol.
"""

from __future__ import annotations

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

#: The first subprotocol a client offers when the second one is its token.
BEARER = 'bearer'


def token_from(scope: dict) -> str:
    """The access token this handshake is presenting, if any."""
    protocols = scope.get('subprotocols') or []
    if len(protocols) >= 2 and protocols[0] == BEARER:
        return protocols[1]
    query = parse_qs(scope.get('query_string', b'').decode(errors='ignore'))
    return (query.get('token') or [''])[0]


@database_sync_to_async
def user_for(raw_token: str):
    """The account behind a token, or an anonymous user.

    Every way a token can be bad — expired, wrongly signed, blacklisted, or
    naming an account that has since been deleted or deactivated — lands on
    the same answer. The consumer turns that into a refusal to connect.
    """
    if not raw_token:
        return AnonymousUser()
    backend = JWTAuthentication()
    try:
        return backend.get_user(backend.get_validated_token(raw_token))
    except (InvalidToken, TokenError, AuthenticationFailed, KeyError):
        return AnonymousUser()


class JWTAuthMiddleware:
    """Puts the token's account on the scope before the consumer sees it."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        scope['user'] = await user_for(token_from(scope))
        return await self.inner(scope, receive, send)
