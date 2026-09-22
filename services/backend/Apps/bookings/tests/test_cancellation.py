"""Cancelling, rescheduling, and the "ring them" rule."""

from __future__ import annotations

from datetime import timedelta
from django.utils import timezone

from Apps.bookings.models import Appointment, AppointmentStatus, CancelledBy

from .base import BookingTestCase


class CancellationWindowTests(BookingTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)
        self.booking = self.book(time='11:00', services=[self.cut]).data

    def test_a_customer_cancels_in_good_time(self):
        response = self.client.post(f'/api/bookings/{self.booking["id"]}/cancel/',
                                    {'reason': 'Something came up'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], AppointmentStatus.CANCELLED)
        self.assertEqual(response.data['cancel_reason'], 'Something came up')
        self.assertEqual(response.data['cancelled_by'], CancelledBy.CUSTOMER)

    def test_the_default_window_is_two_hours(self):
        self.assertEqual(self.booking['cancellation_window_hours'], 2)

    def move_to(self, pk: int, when):
        """Rewrites the stored instant without going through `save()`, which
        would recompute it from the local date and time."""
        Appointment.objects.filter(pk=pk).update(starts_at=when)

    def test_past_the_deadline_the_answer_is_ring_them(self):
        appointment = Appointment.objects.get(pk=self.booking['id'])
        # An hour from now: inside the two-hour window, so too late to self-serve.
        self.move_to(appointment.pk, timezone.now() + timedelta(hours=1))
        response = self.client.post(f'/api/bookings/{appointment.pk}/cancel/',
                                    {'reason': 'x'}, format='json')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'call_to_cancel')
        # The screen needs a number to dial and a name to say.
        self.assertEqual(response.data['business_name'], 'Glow Beauty Parlour')
        self.assertTrue(response.data['business_phone'])
        self.assertEqual(Appointment.objects.get(pk=appointment.pk).status,
                         AppointmentStatus.APPROVED)

    def test_the_owner_can_widen_the_window(self):
        self.as_user(self.owner_session)
        response = self.client.patch('/api/profile/me/',
                                     {'cancellation_window_hours': 24}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['salon']['cancellation_window_hours'], 24)

        self.as_user(self.customer_session)
        again = self.client.get(f'/api/bookings/{self.booking["id"]}/')
        self.assertEqual(again.data['cancellation_window_hours'], 24)

    def test_an_employee_cannot_change_the_salons_rules(self):
        employee = self.verify('+8801755000004')
        self.as_user(self.sign_in(employee.phone).data)
        self.client.patch('/api/profile/me/',
                          {'cancellation_window_hours': 99, 'auto_accept': False},
                          format='json')
        self.salon.refresh_from_db()
        self.assertEqual(self.salon.cancellation_window_hours, 2)
        self.assertTrue(self.salon.auto_accept)

    def test_the_business_may_cancel_at_any_time(self):
        appointment = Appointment.objects.get(pk=self.booking['id'])
        self.move_to(appointment.pk, timezone.now() + timedelta(minutes=20))
        self.as_user(self.owner_session)
        response = self.client.post(f'/api/bookings/{appointment.pk}/cancel/',
                                    {'reason': 'Power cut'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['cancelled_by'], CancelledBy.BUSINESS)
        self.assertEqual(response.data['cancel_reason'], 'Power cut')

    def test_a_cancelled_slot_goes_back_on_sale(self):
        self.client.post(f'/api/bookings/{self.booking["id"]}/cancel/',
                         {'reason': 'x'}, format='json')
        self.assertIn('11:00', self.free_times(services=[self.cut]))

    def test_a_closed_booking_cannot_be_cancelled_again(self):
        self.client.post(f'/api/bookings/{self.booking["id"]}/cancel/', {}, format='json')
        again = self.client.post(f'/api/bookings/{self.booking["id"]}/cancel/', {}, format='json')
        self.assertEqual(again.status_code, 409, again.data)

    def test_the_record_says_whether_the_customer_may_still_cancel(self):
        self.assertTrue(self.booking['can']['cancel'])
        self.assertFalse(self.booking['can']['call_to_cancel'])

        self.move_to(self.booking['id'], timezone.now() + timedelta(hours=1))
        late = self.client.get(f'/api/bookings/{self.booking["id"]}/').data
        self.assertFalse(late['can']['cancel'])
        self.assertTrue(late['can']['call_to_cancel'])


class RescheduleTests(BookingTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.customer_session)
        self.booking = self.book(time='11:00', services=[self.cut]).data

    def test_moving_a_booking_makes_a_new_one_and_links_them(self):
        response = self.client.post(f'/api/bookings/{self.booking["id"]}/reschedule/',
                                    {'date': self.day.isoformat(), 'time': '15:00'},
                                    format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['start_time'], '15:00:00')
        self.assertEqual(response.data['rescheduled_from_id'], self.booking['id'])

        old = self.client.get(f'/api/bookings/{self.booking["id"]}/').data
        self.assertEqual(old['status'], AppointmentStatus.RESCHEDULED)
        self.assertEqual(old['rescheduled_to_id'], response.data['id'])

    def test_the_old_time_is_released_and_the_new_one_taken(self):
        self.client.post(f'/api/bookings/{self.booking["id"]}/reschedule/',
                         {'date': self.day.isoformat(), 'time': '15:00'}, format='json')
        times = self.free_times(services=[self.cut], employee=self.chair)
        self.assertIn('11:00', times)
        self.assertNotIn('15:00', times)

    def test_the_bill_travels_with_it(self):
        moved = self.client.post(f'/api/bookings/{self.booking["id"]}/reschedule/',
                                 {'date': self.day.isoformat(), 'time': '15:00'},
                                 format='json').data
        self.assertEqual(moved['total'], self.booking['total'])
        self.assertEqual([i['name'] for i in moved['items']],
                         [i['name'] for i in self.booking['items']])

    def test_moving_onto_a_taken_slot_is_refused(self):
        other = self.make_customer(phone='01777000999')
        self.as_user(other)
        self.book(time='15:00', services=[self.cut], employee=self.chair)
        self.as_user(self.customer_session)
        response = self.client.post(f'/api/bookings/{self.booking["id"]}/reschedule/',
                                    {'date': self.day.isoformat(), 'time': '15:00'},
                                    format='json')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'slot_taken')
        # Nothing moved: the original is still standing.
        self.assertEqual(self.client.get(f'/api/bookings/{self.booking["id"]}/').data['status'],
                         AppointmentStatus.APPROVED)

    def test_a_closed_booking_cannot_be_moved(self):
        self.client.post(f'/api/bookings/{self.booking["id"]}/cancel/', {}, format='json')
        response = self.client.post(f'/api/bookings/{self.booking["id"]}/reschedule/',
                                    {'date': self.day.isoformat(), 'time': '15:00'},
                                    format='json')
        self.assertEqual(response.status_code, 409, response.data)

    def test_the_salon_can_move_a_booking_too(self):
        self.as_user(self.owner_session)
        response = self.client.post(f'/api/bookings/{self.booking["id"]}/reschedule/',
                                    {'date': self.day.isoformat(), 'time': '16:00'},
                                    format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['start_time'], '16:00:00')
