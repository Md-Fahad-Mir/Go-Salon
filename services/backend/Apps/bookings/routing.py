"""    ws/bookings/     live booking events for the authenticated account
"""

from django.urls import path

from . import consumers

websocket_urlpatterns = [
    path('ws/bookings/', consumers.BookingConsumer.as_asgi()),
]
