"""ASGI config for core project.

Two protocols share one entry point: HTTP is the Django application every REST
endpoint is served by, and WebSocket is the live booking feed. The WebSocket
branch is wrapped in the two checks a socket needs before a consumer sees it —
where the handshake came from, and who is holding the token.

The Django application is built *before* the routing imports, because those
reach models and Django has to be set up by then.

For more information, see
https://docs.djangoproject.com/en/6.1/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import OriginValidator  # noqa: E402
from django.conf import settings  # noqa: E402

from Apps.bookings.routing import websocket_urlpatterns  # noqa: E402
from Apps.users.ws_auth import JWTAuthMiddleware  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    # The same origins CORS already lets talk to the API. A WebSocket
    # handshake is not subject to CORS, so without this any page anywhere
    # could open one; the token still has to be valid, but a socket that only
    # the app's own origins can open is one less thing to reason about.
    'websocket': OriginValidator(
        JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
        settings.CORS_ALLOWED_ORIGINS,
    ),
})
