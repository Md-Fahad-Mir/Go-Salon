"""The life of an appointment: made, approved or turned down, moved, called off."""

from __future__ import annotations

from datetime import timedelta

from django.test import override_settings
from django.utils import timezone

from Apps.bookings.models import Appointment, AppointmentStatus, CancelledBy
from Apps.users.models import Salon, User
from Apps.users.services.sms import LocMemSMSProvider

from .base import BookingTestCase


class BookingCreationTests(BookingTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)

    def test_a_booking_carries_the_menu_price_and_a_fee(self):
        response = self.book(time='11:00', services=[self.cut], notes='Shorter on top.')
        self.assertEqual(response.data['subtotal'], '900.00')
        self.assertEqual(response.data['platform_fee'], '50.00')
        self.assertEqual(response.data['total'], '950.00')
        self.assertEqual(response.data['notes'], 'Shorter on top.')
        self.assertEqual(response.data['duration_minutes'], 60)
        self.assertEqual(response.data['end_time'], '12:00:00')

    def test_the_bill_is_a_copy_not_a_link(self):
        booked = self.book(services=[self.cut]).data
        self.as_user(self.owner_session)
        self.client.patch(f'/api/services/{self.cut.id}/', {'price': '1500.00'}, format='json')
        self.as_user(self.customer_session)
        again = self.client.get(f'/api/bookings/{booked["id"]}/')
        # Repricing tomorrow does not reprice what somebody agreed to today.
        self.assertEqual(again.data['total'], '950.00')
        self.assertEqual(again.data['items'][0]['price'], 900.0)

    def test_auto_accept_approves_on_the_spot(self):
        response = self.book()
        self.assertEqual(response.data['status'], AppointmentStatus.APPROVED)
        self.assertIsNotNone(response.data['approved_at'])

    def test_manual_accept_waits(self):
        self.as_user(self.owner_session)
        self.client.patch('/api/profile/me/', {'auto_accept': False}, format='json')
        self.as_user(self.customer_session)
        response = self.book()
        self.assertEqual(response.data['status'], AppointmentStatus.PENDING)
        self.assertIsNone(response.data['approved_at'])

    def test_a_chair_is_picked_when_none_is_asked_for(self):
        response = self.book()
        self.assertEqual(response.data['employee_id'], self.chair.id)
        self.assertEqual(response.data['stylist_name'], 'Hasan Mahmud')

    def test_the_same_slot_cannot_be_sold_twice(self):
        self.book(time='11:00', employee=self.chair)
        clash = self.book(time='11:00', employee=self.chair, expect=409)
        self.assertEqual(clash.data['code'], 'slot_taken')

    def test_an_overlapping_slot_is_refused_too(self):
        self.book(time='11:00', services=[self.cut], employee=self.chair)
        # Half past runs into the hour already sold.
        clash = self.book(time='11:30', services=[self.cut], employee=self.chair, expect=409)
        self.assertEqual(clash.data['code'], 'slot_taken')

    def test_prep_time_is_protected_as_well_as_the_chair(self):
        # Colour at 12:00 blocks from 11:40; a cut at 10:45 ends 11:45 and eats
        # into that prep. 10:45 is on the quarter-hour grid, so this tests the
        # prep guard rather than the grid — the old 10:50 was off-grid and
        # would have been refused even with no booking in the diary at all.
        self.book(time='12:00', services=[self.colour], employee=self.chair)
        clash = self.book(time='10:45', services=[self.cut], employee=self.chair, expect=409)
        self.assertEqual(clash.data['code'], 'slot_taken')

    def test_a_time_that_is_not_on_the_grid_is_not_called_taken(self):
        """Every refusal used to be "somebody just took it", including times
        nobody had booked — which is how a free slot looks permanently held."""
        refused = self.book(time='10:07', services=[self.cut], expect=400)
        self.assertEqual(refused.data['code'], 'off_grid')

    def test_a_closed_day_cannot_be_booked(self):
        self.as_user(self.owner_session)
        self.client.put('/api/schedule/me/', {'days': [
            {'day': 'mon', 'is_closed': True, 'intervals': []},
        ]}, format='json')
        self.as_user(self.customer_session)
        # Not "taken": nobody booked it, the shop is shut.
        self.assertEqual(self.book(expect=400).data['code'], 'closed')

    def test_a_service_from_another_menu_is_refused(self):
        other = self.make_barber()
        self.as_user(other)
        made = self.client.post('/api/services/', {
            'name': 'Skin fade', 'price': '600.00', 'duration_minutes': 30,
        }, format='json')
        self.as_user(self.customer_session)
        response = self.client.post('/api/bookings/', {
            'listing': f'salon-{self.salon.id}',
            'date': self.day.isoformat(), 'time': '11:00',
            'service_ids': [made.data['id']],
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'service_unavailable')

    def test_a_hidden_service_cannot_be_booked(self):
        self.as_user(self.owner_session)
        self.client.patch(f'/api/services/{self.cut.id}/', {'is_active': False}, format='json')
        self.as_user(self.customer_session)
        response = self.book(services=[self.cut], expect=400)
        self.assertEqual(response.data['code'], 'service_unavailable')

    def test_only_a_customer_books(self):
        self.as_user(self.owner_session)
        self.book(expect=403)

    def test_a_barber_not_taking_clients_is_closed(self):
        barber = self.make_barber()
        self.as_user(barber)
        self.client.put('/api/schedule/me/', {'days': [
            {'day': 'mon', 'is_closed': False,
             'intervals': [{'start': '10:00', 'end': '20:00'}]},
        ]}, format='json')
        service = self.client.post('/api/services/', {
            'name': 'Skin fade', 'price': '600.00', 'duration_minutes': 30,
        }, format='json').data
        profile_id = self.client.get('/api/profile/me/').data['barber']
        self.client.patch('/api/profile/me/', {'accepting_clients': False}, format='json')

        from Apps.users.models import BarberProfile
        pk = BarberProfile.objects.get(user__phone='+8801811111111').id

        # This customer has joined the barber as well as the salon, so
        # the request has to say which of the two it is about.
        self.customer_at(BarberProfile.objects.get(pk=pk))
        response = self.client.post('/api/bookings/', {
            'listing': f'barber-{pk}', 'date': self.day.isoformat(), 'time': '11:00',
            'service_ids': [service['id']],
        }, format='json')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'not_accepting')


class ApprovalTests(BookingTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.owner_session)
        self.client.patch('/api/profile/me/', {'auto_accept': False}, format='json')
        self.as_user(self.customer_session)
        self.booking = self.book(time='11:00', services=[self.cut]).data
        LocMemSMSProvider.outbox.clear()

    def test_the_owner_approves_and_the_customer_is_texted(self):
        self.as_user(self.owner_session)
        response = self.client.post(f'/api/bookings/{self.booking["id"]}/approve/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], AppointmentStatus.APPROVED)
        self.assertEqual(response.data['notification']['status'], 'sent')

        self.assertEqual(len(LocMemSMSProvider.outbox), 1)
        message = LocMemSMSProvider.outbox[0]
        self.assertEqual(message['to'], '+8801712345678')
        # Business, service, stylist, price and time all in the one text.
        self.assertIn('Glow Beauty Parlour', message['message'])
        self.assertIn('Ladies cut', message['message'])
        self.assertIn('Hasan Mahmud', message['message'])
        self.assertIn('950', message['message'])
        self.assertIn('11:00 AM', message['message'])

    def test_rejection_needs_a_reason_and_passes_it_on(self):
        self.as_user(self.owner_session)
        blank = self.client.post(f'/api/bookings/{self.booking["id"]}/reject/',
                                 {'reason': ''}, format='json')
        self.assertEqual(blank.status_code, 400, blank.data)

        response = self.client.post(f'/api/bookings/{self.booking["id"]}/reject/',
                                    {'reason': 'Our colourist is off sick'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], AppointmentStatus.REJECTED)
        self.assertEqual(response.data['reject_reason'], 'Our colourist is off sick')
        self.assertIn('Our colourist is off sick', LocMemSMSProvider.outbox[-1]['message'])

    def test_a_rejected_slot_goes_back_on_sale(self):
        self.as_user(self.owner_session)
        self.client.post(f'/api/bookings/{self.booking["id"]}/reject/',
                         {'reason': 'Fully booked'}, format='json')
        self.as_user(self.customer_session)
        self.assertIn('11:00', self.free_times(services=[self.cut]))

    def test_a_booking_cannot_be_approved_twice(self):
        self.as_user(self.owner_session)
        self.client.post(f'/api/bookings/{self.booking["id"]}/approve/')
        again = self.client.post(f'/api/bookings/{self.booking["id"]}/approve/')
        self.assertEqual(again.status_code, 409, again.data)
        self.assertEqual(again.data['code'], 'not_pending')

    def test_the_customer_cannot_approve_their_own_booking(self):
        response = self.client.post(f'/api/bookings/{self.booking["id"]}/approve/')
        self.assertEqual(response.status_code, 403, response.data)

    def test_completing_closes_it_off(self):
        self.as_user(self.owner_session)
        self.client.post(f'/api/bookings/{self.booking["id"]}/approve/')
        response = self.client.post(f'/api/bookings/{self.booking["id"]}/complete/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], AppointmentStatus.COMPLETED)
        self.assertIsNotNone(response.data['completed_at'])

    def test_a_pending_booking_cannot_be_completed(self):
        self.as_user(self.owner_session)
        response = self.client.post(f'/api/bookings/{self.booking["id"]}/complete/')
        self.assertEqual(response.status_code, 409, response.data)


@override_settings(SMS_PROVIDER='locmem')
class NotificationFailureTests(BookingTestCase):
    """A gateway that is down must not take an approval with it."""

    def setUp(self):
        super().setUp()
        self.as_user(self.owner_session)
        self.client.patch('/api/profile/me/', {'auto_accept': False}, format='json')
        self.as_user(self.customer_session)
        self.booking = self.book(services=[self.cut]).data

    def test_a_failed_text_is_recorded_and_the_approval_stands(self):
        from unittest.mock import patch

        from Apps.users.services.sms import SMSDeliveryError

        self.as_user(self.owner_session)
        with patch.object(LocMemSMSProvider, 'send',
                          side_effect=SMSDeliveryError('gateway timeout')):
            response = self.client.post(f'/api/bookings/{self.booking["id"]}/approve/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], AppointmentStatus.APPROVED)
        self.assertEqual(response.data['notification']['status'], 'failed')
        self.assertIn('gateway timeout', response.data['notification']['error'])

        appointment = Appointment.objects.get(pk=self.booking['id'])
        record = appointment.notifications.first()
        self.assertEqual(record.status, 'failed')
        self.assertEqual(record.attempts, 1)
        self.assertEqual(record.provider, 'locmem')


class PlatformFeeTests(BookingTestCase):
    """The fee is quoted by the app before the booking exists and charged by
    the server when it does. Two numbers, one value — this fails the day they
    drift apart."""

    def test_the_fee_matches_the_number_the_app_quotes(self):
        from pathlib import Path
        import re

        from django.conf import settings

        constants = (
            Path(settings.BASE_DIR).parent / 'frontend' / 'src' / 'constants' / 'index.ts'
        )
        if not constants.exists():          # the backend may be deployed alone
            self.skipTest('frontend constants not present')
        quoted = re.search(r'PLATFORM_FEE = (\d+)', constants.read_text())
        self.assertIsNotNone(quoted, 'PLATFORM_FEE not found in the frontend constants')
        self.assertEqual(
            int(quoted.group(1)), settings.BOOKING_PLATFORM_FEE,
            'the summary screen would quote a total the server does not charge',
        )
