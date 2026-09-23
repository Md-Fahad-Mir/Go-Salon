"""Live booking events: who hears them, and what reaches the socket.

Two things are being checked, and they are different things. The broadcast
tests ask whether the right accounts — and only the right accounts — are told
when a booking changes. The socket tests ask whether a client holding a valid
token actually receives what was sent to it, and whether one without a valid
token is let in at all.
"""

from __future__ import annotations

import asyncio
from uuid import uuid4

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase
from rest_framework_simplejwt.tokens import RefreshToken

from Apps.users.models import Role, User

from ..models import Appointment, AppointmentStatus
from ..realtime import group_for, recipients
from .base import BookingTestCase

#: Long enough that a slow machine is not mistaken for silence, short enough
#: that a test proving silence does not stall the suite.
QUIET = 0.35


def probe(*groups: str) -> dict[str, str]:
    """Subscribes a throwaway channel to each group. Returns group -> channel.

    Each channel name is unique because the in-memory layer is a singleton for
    the whole process and never forgets a group membership on its own: a name
    reused by the next test would still be listening to the last one's groups,
    and would appear to overhear bookings it has no business seeing.
    """
    layer = get_channel_layer()
    channels = {group: f'probe.{uuid4().hex}' for group in groups}
    for group, channel in channels.items():
        async_to_sync(layer.group_add)(group, channel)
    return channels


def clear_channel_layer() -> None:
    """Fresh groups and empty queues, so no test inherits another's noise."""
    async_to_sync(get_channel_layer().flush)()


def drain(channels: dict[str, str]) -> dict[str, list]:
    """Everything waiting on each channel, read in one go.

    One `async_to_sync` for the whole read on purpose: the in-memory layer's
    queues bind themselves to the first event loop that reads them, and a
    second loop would be refused. Draining a channel empties it, so calling
    this again later starts from a clean queue.
    """
    layer = get_channel_layer()

    async def read() -> dict[str, list]:
        out: dict[str, list] = {}
        for group, channel in channels.items():
            got = []
            while True:
                try:
                    got.append(await asyncio.wait_for(layer.receive(channel), QUIET))
                except (TimeoutError, asyncio.TimeoutError):
                    break
            out[group] = got
        return out

    return async_to_sync(read)()


class BroadcastTests(BookingTestCase):
    """Who is told, and what they are told."""

    def setUp(self):
        super().setUp()
        clear_channel_layer()
        # Phone numbers are stored in E.164, so the chair's account is
        # reached through the employment row rather than the number typed.
        self.employee = self.chair.user

    def watch(self, *users: User) -> dict[str, str]:
        return probe(*[group_for(user.id) for user in users])

    def events(self, channels: dict[str, str], user: User) -> list[dict]:
        return [message['payload'] for message in channels[group_for(user.id)]]

    # --- a new booking -----------------------------------------------------

    def test_a_new_booking_reaches_the_business_and_the_chair(self):
        listening = self.watch(self.owner, self.employee, self.customer)

        self.as_user(self.customer_session)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.book(time='11:00', employee=self.chair)
        booked = response.data['id']

        heard = drain(listening)
        for who in (self.owner, self.employee, self.customer):
            events = [message['payload'] for message in heard[group_for(who.id)]]
            self.assertEqual(len(events), 1, f'{who.name} heard {len(events)} events')
            self.assertEqual(events[0]['event'], 'created')
            self.assertEqual(events[0]['booking']['id'], booked)

    def test_the_event_carries_what_the_shop_floor_needs(self):
        listening = self.watch(self.owner)

        self.as_user(self.customer_session)
        with self.captureOnCommitCallbacks(execute=True):
            self.book(time='11:00', employee=self.chair, notes='Please go short at the back')

        booking = self.events(drain(listening), self.owner)[0]['booking']
        self.assertEqual(booking['customer_name'], self.customer.name)
        self.assertEqual(booking['customer_phone'], self.customer.phone)
        self.assertEqual(booking['stylist_name'], 'Hasan Mahmud')
        self.assertEqual(booking['employee_id'], self.chair.id)
        self.assertEqual(booking['notes'], 'Please go short at the back')
        self.assertEqual(booking['date'], self.day.isoformat())
        self.assertEqual(booking['start_time'], '11:00:00')
        self.assertEqual([item['name'] for item in booking['items']], ['Ladies cut'])
        self.assertEqual(booking['status'], AppointmentStatus.APPROVED)

    def test_another_salon_hears_nothing(self):
        stranger = self.make_owner(
            phone='01966666666', email='other@example.com', business_name='Other Cuts')
        outsider = User.objects.get(pk=stranger['user']['id'])
        listening = self.watch(outsider)

        self.as_user(self.customer_session)
        with self.captureOnCommitCallbacks(execute=True):
            self.book(time='11:00')

        self.assertEqual(self.events(drain(listening), outsider), [])

    def test_another_customer_hears_nothing(self):
        other = User.objects.create_user(
            phone='01733333333', password='chairside2026', name='Someone Else',
            role=Role.CUSTOMER, is_phone_verified=True)
        listening = self.watch(other)

        self.as_user(self.customer_session)
        with self.captureOnCommitCallbacks(execute=True):
            self.book(time='11:00')

        self.assertEqual(self.events(drain(listening), other), [])

    def test_a_chair_hears_only_its_own_bookings(self):
        self.as_user(self.owner_session)
        second = self._hire('01755000005', 'Nadia Islam')
        other_chair = second.user
        listening = self.watch(self.employee, other_chair)

        self.as_user(self.customer_session)
        with self.captureOnCommitCallbacks(execute=True):
            self.book(time='11:00', employee=second)

        heard = drain(listening)
        self.assertEqual(len(self.events(heard, other_chair)), 1)
        self.assertEqual(self.events(heard, self.employee), [])

    # --- what each reader may do -------------------------------------------

    def test_each_recipient_is_told_what_they_themselves_may_do(self):
        self.as_user(self.owner_session)
        self.client.patch('/api/profile/me/', {'auto_accept': False}, format='json')
        listening = self.watch(self.owner, self.customer)

        self.as_user(self.customer_session)
        with self.captureOnCommitCallbacks(execute=True):
            self.book(time='11:00')

        heard = drain(listening)
        owner_view = self.events(heard, self.owner)[0]['booking']
        customer_view = self.events(heard, self.customer)[0]['booking']
        self.assertEqual(owner_view['id'], customer_view['id'])
        # The same fact, two different sets of buttons.
        self.assertTrue(owner_view['can']['approve'])
        self.assertFalse(customer_view['can']['approve'])
        self.assertTrue(customer_view['can']['cancel'])

    # --- the rest of the lifecycle -----------------------------------------

    def _pending_booking(self) -> int:
        self.as_user(self.owner_session)
        self.client.patch('/api/profile/me/', {'auto_accept': False}, format='json')
        self.as_user(self.customer_session)
        return self.book(time='11:00', employee=self.chair).data['id']

    def test_approving_is_announced(self):
        booked = self._pending_booking()
        listening = self.watch(self.customer, self.owner, self.employee)

        self.as_user(self.owner_session)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'/api/bookings/{booked}/approve/')

        heard = drain(listening)
        for who in (self.customer, self.owner, self.employee):
            events = self.events(heard, who)
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]['event'], 'updated')
            self.assertEqual(events[0]['booking']['status'], AppointmentStatus.APPROVED)

    def test_rejecting_carries_the_reason(self):
        booked = self._pending_booking()
        listening = self.watch(self.customer)

        self.as_user(self.owner_session)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'/api/bookings/{booked}/reject/',
                             {'reason': 'Fully booked that morning'}, format='json')

        booking = self.events(drain(listening), self.customer)[0]['booking']
        self.assertEqual(booking['status'], AppointmentStatus.REJECTED)
        self.assertEqual(booking['reject_reason'], 'Fully booked that morning')

    def test_cancelling_reaches_the_business(self):
        self.as_user(self.customer_session)
        booked = self.book(time='11:00', employee=self.chair).data['id']
        listening = self.watch(self.owner, self.employee)

        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'/api/bookings/{booked}/cancel/',
                             {'reason': 'Something came up'}, format='json')

        heard = drain(listening)
        for who in (self.owner, self.employee):
            booking = self.events(heard, who)[0]['booking']
            self.assertEqual(booking['status'], AppointmentStatus.CANCELLED)
            self.assertEqual(booking['cancel_reason'], 'Something came up')

    def test_completing_is_announced(self):
        self.as_user(self.customer_session)
        booked = self.book(time='11:00', employee=self.chair).data['id']
        listening = self.watch(self.owner)

        self.as_user(self.owner_session)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'/api/bookings/{booked}/complete/')

        booking = self.events(drain(listening), self.owner)[0]['booking']
        self.assertEqual(booking['status'], AppointmentStatus.COMPLETED)

    def test_moving_a_booking_announces_both_rows(self):
        self.as_user(self.customer_session)
        booked = self.book(time='11:00', employee=self.chair).data['id']
        listening = self.watch(self.owner)

        with self.captureOnCommitCallbacks(execute=True):
            moved = self.client.post(
                f'/api/bookings/{booked}/reschedule/',
                {'date': self.day.isoformat(), 'time': '15:00'}, format='json')
        self.assertEqual(moved.status_code, 201, moved.data)

        events = self.events(drain(listening), self.owner)
        by_id = {event['booking']['id']: event for event in events}
        self.assertEqual(len(by_id), 2, 'the old time and the new one')
        self.assertEqual(by_id[booked]['booking']['status'], AppointmentStatus.RESCHEDULED)
        self.assertEqual(by_id[moved.data['id']]['event'], 'created')

    # --- the audience itself ------------------------------------------------

    def test_a_dismissed_employee_is_no_longer_an_audience(self):
        self.as_user(self.customer_session)
        booked = self.book(time='11:00', employee=self.chair).data['id']
        appointment = Appointment.objects.get(pk=booked)
        self.assertIn(self.employee, recipients(appointment))

        self.chair.is_active = False
        self.chair.save(update_fields=['is_active'])
        appointment.refresh_from_db()
        # `access.scoped` stops serving them the row; the broadcast follows it
        # rather than keeping its own idea of who works here.
        self.assertNotIn(self.employee, recipients(appointment))
        self.assertIn(self.owner, recipients(appointment))

    def test_an_independent_barbers_booking_reaches_the_barber(self):
        barber_session = self.make_barber()
        barber = User.objects.get(pk=barber_session['user']['id'])
        self.as_user(barber_session)
        self.client.put('/api/schedule/me/', {'days': [
            {'day': day, 'is_closed': False, 'intervals': [{'start': '10:00', 'end': '20:00'}]}
            for day in ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')
        ]}, format='json')
        trim = self.client.post('/api/services/', {
            'name': 'Beard trim', 'price': '300.00', 'duration_minutes': 30,
        }, format='json')
        self.assertEqual(trim.status_code, 201, trim.data)

        listening = self.watch(barber, self.owner)
        # The customer has joined the barber too, and says so on the request.
        self.customer_at(barber.barber_profile)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post('/api/bookings/', {
                'listing': f'barber-{barber.barber_profile.id}',
                'date': self.day.isoformat(),
                'time': '11:00',
                'service_ids': [trim.data['id']],
            }, format='json')

        heard = drain(listening)
        self.assertEqual(len(self.events(heard, barber)), 1)
        # A booking at a barber's own chair is no business of the salon's.
        self.assertEqual(self.events(heard, self.owner), [])


class SocketTests(TransactionTestCase):
    """The consumer: who gets in, and what comes down the wire.

    `TransactionTestCase` because the connection is authenticated from another
    thread, which can only see rows that have actually been committed.
    """

    #: An origin the API already allows; the handshake is refused from any other.
    ORIGIN = [(b'origin', b'http://localhost:5173')]

    def setUp(self):
        super().setUp()
        clear_channel_layer()
        self.user = User.objects.create_user(
            phone='01712345678', password='chairside2026', name='Ahmed Hassan',
            role=Role.CUSTOMER, is_phone_verified=True)
        self.token = str(RefreshToken.for_user(self.user).access_token)

    def socket(self, *, token: str | None = None, headers=None) -> WebsocketCommunicator:
        return WebsocketCommunicator(
            self.application(),
            '/ws/bookings/',
            headers=self.ORIGIN if headers is None else headers,
            subprotocols=['bearer', token] if token else None,
        )

    @staticmethod
    def application():
        from core.asgi import application

        return application

    def test_a_valid_token_gets_in_and_is_told_so(self):
        async def run():
            socket = self.socket(token=self.token)
            connected, subprotocol = await socket.connect()
            self.assertTrue(connected)
            self.assertEqual(subprotocol, 'bearer')
            self.assertEqual(await socket.receive_json_from(),
                             {'type': 'ready', 'role': Role.CUSTOMER})
            await socket.disconnect()

        async_to_sync(run)()

    def test_no_token_is_refused(self):
        async def run():
            socket = self.socket()
            connected, code = await socket.connect()
            self.assertFalse(connected)
            self.assertEqual(code, 4401)

        async_to_sync(run)()

    def test_a_rubbish_token_is_refused(self):
        async def run():
            socket = self.socket(token='not.a.token')
            connected, code = await socket.connect()
            self.assertFalse(connected)
            self.assertEqual(code, 4401)

        async_to_sync(run)()

    def test_another_page_cannot_open_one(self):
        async def run():
            socket = self.socket(token=self.token,
                                 headers=[(b'origin', b'https://evil.example')])
            connected, _ = await socket.connect()
            self.assertFalse(connected)

        async_to_sync(run)()

    def test_events_for_this_account_arrive(self):
        async def run():
            socket = self.socket(token=self.token)
            connected, _ = await socket.connect()
            self.assertTrue(connected)
            await socket.receive_json_from()  # the ready line

            await get_channel_layer().group_send(
                group_for(self.user.id),
                {'type': 'booking.event',
                 'payload': {'type': 'booking', 'event': 'created',
                             'booking': {'id': 7}}},
            )
            self.assertEqual(
                await socket.receive_json_from(),
                {'type': 'booking', 'event': 'created', 'booking': {'id': 7}},
            )
            await socket.disconnect()

        async_to_sync(run)()

    def test_events_for_another_account_do_not(self):
        async def run():
            socket = self.socket(token=self.token)
            await socket.connect()
            await socket.receive_json_from()

            await get_channel_layer().group_send(
                group_for(self.user.id + 1),
                {'type': 'booking.event', 'payload': {'type': 'booking'}},
            )
            self.assertTrue(await socket.receive_nothing(timeout=QUIET))
            await socket.disconnect()

        async_to_sync(run)()

    def test_a_ping_is_answered(self):
        async def run():
            socket = self.socket(token=self.token)
            await socket.connect()
            await socket.receive_json_from()
            await socket.send_json_to({'type': 'ping'})
            self.assertEqual(await socket.receive_json_from(), {'type': 'pong'})
            await socket.disconnect()

        async_to_sync(run)()
