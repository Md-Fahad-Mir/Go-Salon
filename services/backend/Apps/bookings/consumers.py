"""The socket a dashboard holds open.

One endpoint answers every role, the way `/api/bookings/` does: the server
already knows who is connected, so a client never asks to follow a salon or a
chair — it is simply subscribed to itself, and `realtime.publish` decides what
reaches it. There is nothing a client can say to widen that.
"""

from __future__ import annotations

from channels.generic.websocket import AsyncJsonWebsocketConsumer

from Apps.users.ws_auth import BEARER

from .realtime import group_for

#: Close codes in the 4000-4999 range are the application's own to define.
#: 4401 mirrors HTTP 401 so a client can tell "your token is stale, refresh
#: and reconnect" from "the network dropped, retry as you are".
UNAUTHENTICATED = 4401


class BookingConsumer(AsyncJsonWebsocketConsumer):
    """Live booking events for whoever is holding the token."""

    group: str | None = None

    async def connect(self):
        user = self.scope.get('user')
        if user is None or not user.is_authenticated:
            # Refused before accepting, so an unauthenticated client gets a
            # failed handshake rather than an open socket that says nothing.
            await self.close(code=UNAUTHENTICATED)
            return

        self.group = group_for(user.id)
        await self.channel_layer.group_add(self.group, self.channel_name)

        # A browser that offered subprotocols wants one chosen back. The token
        # travelled as the second one; naming the first keeps the handshake
        # well-formed without echoing the credential.
        offered = self.scope.get('subprotocols') or []
        await self.accept(subprotocol=BEARER if BEARER in offered else None)

        await self.send_json({'type': 'ready', 'role': user.role})

    async def disconnect(self, code):
        if self.group is not None:
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        """Clients have nothing to ask for except proof the line is still up.

        A socket through an idle proxy can be dead for minutes before the
        browser notices, so the client pings and reconnects when the pong does
        not come back. Anything else sent here is ignored on purpose.

        The ping also renews the group membership. A channel layer expires
        those after a day, and a salon that leaves the diary open over a
        weekend would otherwise keep a socket that looks perfectly healthy and
        has quietly stopped being sent anything.
        """
        if isinstance(content, dict) and content.get('type') == 'ping':
            if self.group is not None:
                await self.channel_layer.group_add(self.group, self.channel_name)
            await self.send_json({'type': 'pong'})

    async def booking_event(self, message):
        """A `booking.event` from the channel layer, already scoped to me."""
        await self.send_json(message['payload'])
