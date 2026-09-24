"""Who may write a review, who may read it, and who may answer it.

The rules pinned down here are the ones that decide whether the feature is
safe rather than whether it works: a stylist must not read the chair beside
them, a customer must not review a visit twice or a visit that has not
happened, and two people who can both answer one review must not be able to
overwrite each other in public.

Everything is built through the real endpoints — a booking prices its own
basket, `complete` closes it, `POST /api/reviews/booking/{id}/` writes the
review — because a permission test that hand-builds its rows proves only that
the test agrees with itself.
"""

from __future__ import annotations

from Apps.bookings.models import Appointment, AppointmentStatus
from Apps.bookings.tests.base import BookingTestCase, all_week
from Apps.reviews.models import Review
from Apps.reviews.serializers import short_name
from Apps.users.models import BarberProfile

MINE = '/api/reviews/'


def listing(professional_id: str) -> str:
    return f'/api/reviews/listing/{professional_id}/'


def booking(appointment_id) -> str:
    return f'/api/reviews/booking/{appointment_id}/'


class ReviewTestCase(BookingTestCase):
    """The salon from `BookingTestCase` with a second chair, both stylists
    signed in, and a way to put a finished visit on the books."""

    def setUp(self):
        super().setUp()
        self.as_user(self.owner_session)
        self.second_chair = self._hire('01755000007', 'Nadia Sultana')

        self.verify('+8801755000004')
        self.verify('+8801755000007')
        self.stylist = self.sign_in('+8801755000004').data
        self.colleague = self.sign_in('+8801755000007').data

    def finished(self, *, employee=None, time='11:00') -> int:
        """A visit that has been and gone, through the real lifecycle."""
        self.as_user(self.customer_session)
        created = self.book(time=time, employee=employee or self.chair)
        appointment_id = created.data['id']

        self.as_user(self.owner_session)
        self.client.post(f'/api/bookings/{appointment_id}/approve/')
        self.client.post(f'/api/bookings/{appointment_id}/complete/')
        self.assertEqual(
            Appointment.objects.get(pk=appointment_id).status,
            AppointmentStatus.COMPLETED,
        )
        return appointment_id

    def write(self, appointment_id, rating=5, text='', expect=201, tenant=None):
        # `tenant` only matters for a customer on more than one salon's
        # books, where there is nothing for the fallback to pick.
        self.as_user(self.customer_session, tenant=tenant)
        response = self.client.post(
            booking(appointment_id), {'rating': rating, 'text': text}, format='json')
        if expect is not None:
            self.assertEqual(response.status_code, expect, response.data)
        return response


class WritingTests(ReviewTestCase):
    """A customer rating a visit."""

    def test_a_finished_visit_can_be_reviewed_once(self):
        appointment = self.finished()
        created = self.write(appointment, 5, 'Exactly the cut I asked for.')
        self.assertEqual(created.data['rating'], 5)
        self.assertEqual(created.data['professional_id'], f'salon-{self.salon.id}')
        self.assertEqual(created.data['booking_id'], str(appointment))
        self.assertEqual(created.data['staff_name'], 'Hasan Mahmud')
        self.assertEqual(created.data['service_name'], 'Ladies cut')

        again = self.write(appointment, 1, 'changed my mind', expect=409)
        self.assertEqual(again.data['code'], 'already_reviewed')
        self.assertEqual(Review.objects.filter(appointment_id=appointment).count(), 1)

    def test_an_unfinished_visit_cannot_be_reviewed(self):
        self.as_user(self.customer_session)
        pending = self.book(time='12:00').data['id']
        refused = self.write(pending, 5, expect=409)
        self.assertEqual(refused.data['code'], 'not_finished')

    def test_a_rating_outside_one_to_five_is_refused(self):
        appointment = self.finished()
        self.assertEqual(self.write(appointment, 0, expect=400).status_code, 400)
        self.assertEqual(self.write(appointment, 6, expect=400).status_code, 400)
        self.assertFalse(Review.objects.exists())

    def test_words_are_optional(self):
        appointment = self.finished()
        created = self.write(appointment, 4)
        self.assertEqual(created.data['text'], '')

    def test_the_salon_cannot_review_its_own_work(self):
        appointment = self.finished()
        for session in (self.owner_session, self.stylist):
            self.as_user(session)
            refused = self.client.post(booking(appointment), {'rating': 5}, format='json')
            self.assertIn(refused.status_code, (403, 404), refused.data)
        self.assertFalse(Review.objects.exists())

    def test_somebody_elses_booking_is_not_found_rather_than_forbidden(self):
        """A stranger asking about a booking is told nothing about it."""
        appointment = self.finished()
        other = self.make_customer(phone='+8801755000009')
        self.as_user(other)
        refused = self.client.post(booking(appointment), {'rating': 1}, format='json')
        self.assertEqual(refused.status_code, 404)
        self.assertEqual(refused.data['code'], 'not_found')


class ScopeTests(ReviewTestCase):
    """`GET /api/reviews/` — one endpoint, four answers."""

    def setUp(self):
        super().setUp()
        self.first = self.finished(employee=self.chair, time='11:00')
        self.second = self.finished(employee=self.second_chair, time='13:00')
        self.write(self.first, 5, 'Hasan was worth the wait.')
        self.write(self.second, 3, 'Fine, nothing special.')

    def ratings(self, session) -> list[int]:
        self.as_user(session)
        response = self.client.get(MINE)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_the_owner_reads_the_whole_salon(self):
        payload = self.ratings(self.owner_session)
        self.assertEqual(payload['viewpoint'], 'owner')
        self.assertEqual(payload['count'], 2)
        self.assertEqual(payload['summary']['average'], 4.0)
        self.assertEqual(payload['summary']['distribution'], {'5': 1, '4': 0, '3': 1, '2': 0, '1': 0})

    def test_a_stylist_reads_only_their_own_chair(self):
        payload = self.ratings(self.stylist)
        self.assertEqual(payload['viewpoint'], 'employee')
        self.assertEqual(payload['count'], 1)
        self.assertEqual([row['rating'] for row in payload['results']], [5])
        self.assertEqual(payload['summary']['average'], 5.0)

        colleague = self.ratings(self.colleague)
        self.assertEqual([row['rating'] for row in colleague['results']], [3])

    def test_a_stylist_is_told_nothing_about_the_salons_other_chairs(self):
        """Not a filtered list with a total — the total is theirs too."""
        payload = self.ratings(self.stylist)
        self.assertNotIn('by_staff', payload)
        self.assertEqual(payload['summary']['count'], 1)

    def test_the_owner_gets_a_score_per_chair(self):
        payload = self.ratings(self.owner_session)
        by_chair = {row['employee_id']: row for row in payload['by_staff']}
        self.assertEqual(by_chair[str(self.chair.id)]['rating'], 5.0)
        self.assertEqual(by_chair[str(self.second_chair.id)]['rating'], 3.0)

    def test_the_customer_reads_the_ones_they_wrote(self):
        payload = self.ratings(self.customer_session)
        self.assertEqual(payload['viewpoint'], 'customer')
        self.assertEqual(payload['count'], 2)

    def test_a_barber_reads_their_own_work(self):
        barber = self.make_barber()
        profile = BarberProfile.objects.get(user_id=barber['user']['id'])
        self.as_user(barber)
        self.client.put('/api/schedule/me/', all_week(), format='json')
        service = self.client.post('/api/services/', {
            'name': 'Beard trim', 'price': '300.00', 'duration_minutes': 30,
        }, format='json')
        self.assertEqual(service.status_code, 201, service.data)

        # This customer has joined the barber as well as the salon, so
        # the request has to say which of the two it is about.
        self.customer_at(profile)
        created = self.client.post('/api/bookings/', {
            'listing': f'barber-{profile.id}', 'date': self.day.isoformat(),
            'time': '11:00', 'service_ids': [service.data['id']],
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        appointment = created.data['id']

        self.as_user(barber)
        self.client.post(f'/api/bookings/{appointment}/approve/')
        self.client.post(f'/api/bookings/{appointment}/complete/')
        self.write(appointment, 5, 'Sharp.', tenant=self.tenant_of(profile))

        payload = self.ratings(barber)
        self.assertEqual(payload['viewpoint'], 'barber')
        self.assertEqual([row['professional_id'] for row in payload['results']],
                         [f'barber-{profile.id}'])

        # And the salon's owner learns nothing about it.
        self.assertEqual(self.ratings(self.owner_session)['count'], 2)


class ListingTests(ReviewTestCase):
    """The one read that is not scoped: a customer sizing a salon up."""

    def setUp(self):
        super().setUp()
        for hour, score in (('11:00', 5), ('13:00', 3), ('15:00', 4)):
            self.write(self.finished(time=hour), score, f'{score} stars')

    def test_anybody_signed_in_may_read_a_businesss_reviews(self):
        for session in (self.customer_session, self.owner_session, self.stylist):
            self.as_user(session)
            response = self.client.get(listing(f'salon-{self.salon.id}'))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['count'], 3)
            self.assertEqual(response.data['summary']['average'], 4.0)

    def test_it_is_closed_to_the_signed_out(self):
        self.client.credentials()
        self.assertEqual(self.client.get(listing(f'salon-{self.salon.id}')).status_code, 401)

    def test_sorting(self):
        self.as_user(self.customer_session)
        for sort, expected in (('newest', [4, 3, 5]), ('highest', [5, 4, 3]), ('lowest', [3, 4, 5])):
            response = self.client.get(listing(f'salon-{self.salon.id}'), {'sort': sort})
            self.assertEqual([row['rating'] for row in response.data['results']], expected, sort)

    def test_an_unknown_sort_is_refused_rather_than_ignored(self):
        self.as_user(self.customer_session)
        response = self.client.get(listing(f'salon-{self.salon.id}'), {'sort': 'funniest'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'bad_sort')

    def test_an_unknown_listing_is_a_404_not_an_empty_list(self):
        self.as_user(self.customer_session)
        self.assertEqual(self.client.get(listing('salon-999999')).status_code, 404)
        self.assertEqual(self.client.get(listing('nonsense')).status_code, 404)

    def test_a_business_with_no_reviews_reports_none_rather_than_zero(self):
        self.as_user(self.customer_session)
        Review.objects.all().delete()
        response = self.client.get(listing(f'salon-{self.salon.id}'))
        self.assertEqual(response.data['count'], 0)
        self.assertIsNone(response.data['summary']['average'])


class ReplyTests(ReviewTestCase):
    """The business answering back, and the two people who can."""

    def setUp(self):
        super().setUp()
        self.appointment = self.finished(employee=self.chair)
        self.write(self.appointment, 2, 'Rushed.')

    def reply(self, session, text, expect=200):
        self.as_user(session)
        response = self.client.patch(
            booking(self.appointment), {'reply': text}, format='json')
        if expect is not None:
            self.assertEqual(response.status_code, expect, response.data)
        return response

    def test_the_owner_may_answer(self):
        answered = self.reply(self.owner_session, 'Sorry about that — please come back on us.')
        self.assertEqual(answered.data['reply'], 'Sorry about that — please come back on us.')
        self.assertIsNotNone(answered.data['replied_at'])
        self.assertEqual(answered.data['replied_by_name'], self.salon.name)
        self.assertEqual(Review.objects.get().replied_by, self.owner)

    def test_the_stylist_may_answer_their_own_chair(self):
        self.reply(self.stylist, 'I am sorry, we were short-staffed that evening.')
        self.assertEqual(Review.objects.get().replied_by.name, 'Hasan Mahmud')

    def test_a_stylist_cannot_overwrite_the_salons_answer(self):
        self.reply(self.owner_session, 'The salon speaking.')
        refused = self.reply(self.stylist, 'No it was not like that', expect=409)
        self.assertEqual(refused.data['code'], 'already_answered')
        self.assertEqual(Review.objects.get().reply, 'The salon speaking.')

    def test_the_owner_has_the_last_word(self):
        self.reply(self.stylist, 'My side of it.')
        self.reply(self.owner_session, 'The salon has looked into this.')
        self.assertEqual(Review.objects.get().reply, 'The salon has looked into this.')

    def test_a_stylist_cannot_answer_a_chair_that_is_not_theirs(self):
        refused = self.reply(self.colleague, 'not mine to answer', expect=404)
        self.assertEqual(refused.data['code'], 'not_found')

    def test_a_customer_cannot_answer(self):
        refused = self.reply(self.customer_session, 'replying to myself', expect=403)
        self.assertEqual(refused.data['code'], 'not_yours')

    def test_an_empty_reply_is_refused(self):
        self.reply(self.owner_session, '', expect=400)

    def test_there_is_nothing_to_answer_before_there_is_a_review(self):
        second = self.finished(time='13:00')
        self.as_user(self.owner_session)
        refused = self.client.patch(booking(second), {'reply': 'hello'}, format='json')
        self.assertEqual(refused.status_code, 404)
        self.assertEqual(refused.data['code'], 'no_review')


class BookingPayloadTests(ReviewTestCase):
    """The gate the customer's screen reads, which used to live in the browser."""

    def test_can_review_closes_once_the_review_is_written(self):
        appointment = self.finished()
        self.as_user(self.customer_session)
        before = self.client.get(f'/api/bookings/{appointment}/')
        self.assertTrue(before.data['can']['review'])
        self.assertIsNone(before.data['review'])

        self.write(appointment, 5, 'Lovely.')
        after = self.client.get(f'/api/bookings/{appointment}/')
        self.assertFalse(after.data['can']['review'])
        self.assertEqual(after.data['review']['rating'], 5)

    def test_the_salon_is_never_offered_the_review_button(self):
        appointment = self.finished()
        self.as_user(self.owner_session)
        response = self.client.get(f'/api/bookings/{appointment}/')
        self.assertFalse(response.data['can']['review'])

    def test_an_unfinished_booking_offers_nothing(self):
        self.as_user(self.customer_session)
        pending = self.book(time='12:00').data['id']
        response = self.client.get(f'/api/bookings/{pending}/')
        self.assertFalse(response.data['can']['review'])

    def test_the_salon_can_read_the_review_on_the_booking(self):
        """So the queue can answer it without a second request."""
        appointment = self.finished()
        self.write(appointment, 4, 'Good.')
        self.as_user(self.owner_session)
        response = self.client.get(f'/api/bookings/{appointment}/')
        self.assertEqual(response.data['review']['rating'], 4)


class DirectoryScoreTests(ReviewTestCase):
    """The star on a listing card, and the one under a stylist's name."""

    def test_a_listing_with_no_reviews_reports_none_not_zero(self):
        self.as_user(self.customer_session)
        response = self.client.get(f'/api/listings/salon-{self.salon.id}/')
        self.assertIsNone(response.data['rating'])
        self.assertEqual(response.data['review_count'], 0)
        for chair in response.data['staff']:
            self.assertIsNone(chair['rating'])

    def test_the_score_is_the_mean_of_the_reviews(self):
        self.write(self.finished(time='11:00'), 5)
        self.write(self.finished(time='13:00'), 4)
        self.as_user(self.customer_session)
        response = self.client.get(f'/api/listings/salon-{self.salon.id}/')
        self.assertEqual(response.data['rating'], 4.5)
        self.assertEqual(response.data['review_count'], 2)

    def test_a_chair_is_scored_on_its_own_work(self):
        self.write(self.finished(employee=self.chair, time='11:00'), 5)
        self.write(self.finished(employee=self.second_chair, time='13:00'), 3)
        self.as_user(self.customer_session)
        response = self.client.get(f'/api/listings/salon-{self.salon.id}/')
        chairs = {row['id']: row for row in response.data['staff']}
        self.assertEqual(chairs[str(self.chair.id)]['rating'], 5.0)
        self.assertEqual(chairs[str(self.second_chair.id)]['review_count'], 1)
        self.assertEqual(chairs[str(self.second_chair.id)]['rating'], 3.0)

    def test_scoring_a_salon_costs_two_queries_however_many_chairs_it_has(self):
        """One aggregate for the salon and one for its chairs, and that is the
        whole cost — a star per chair must not become a query per chair.

        This used to be asserted against the directory listing, where the same
        rule had to hold across a page of salons. That endpoint is gone, and
        the rule did not go with it: a salon's own detail still scores itself
        and every chair on it, and a busy salon is where a per-row query would
        actually hurt.
        """
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        def review_queries() -> int:
            self.as_user(self.customer_session)
            with CaptureQueriesContext(connection) as captured:
                response = self.client.get(f'/api/listings/salon-{self.salon.id}/')
            asked = sum(1 for query in captured.captured_queries
                        if 'reviews_review' in query['sql'])
            self.assertEqual(response.status_code, 200, response.data)
            return asked

        self.write(self.finished(employee=self.chair, time='11:00'), 5)
        self.assertEqual(review_queries(), 2)

        # A third chair and a second review: still two.
        self.as_user(self.owner_session)
        hired = self.client.post('/api/salon/employees/', {
            'phone': '01755000077', 'name': 'Third Chair', 'password': 'chairside2026',
        }, format='json')
        self.assertEqual(hired.status_code, 201, hired.data)
        Review.objects.create(appointment=Appointment.objects.get(
            pk=self.finished(employee=self.second_chair, time='13:00')), rating=4)
        self.assertEqual(review_queries(), 2)

        self.as_user(self.customer_session)
        self.assertGreaterEqual(
            len(self.client.get(f'/api/listings/salon-{self.salon.id}/').data['staff']), 3)


class NameTests(ReviewTestCase):
    """How a reviewer is named to strangers."""

    def test_a_surname_is_reduced_to_an_initial(self):
        self.assertEqual(short_name('Tanvir Rahman'), 'Tanvir R.')

    def test_an_honorific_is_not_mistaken_for_a_given_name(self):
        """`Md Fahad Mir` shortened naively is `Md M.`, which names nobody."""
        self.assertEqual(short_name('Md Fahad Mir'), 'Fahad M.')
        self.assertEqual(short_name('Mst. Nusrat Jahan'), 'Nusrat J.')

    def test_one_name_stays_whole(self):
        self.assertEqual(short_name('Fahim'), 'Fahim')
        self.assertEqual(short_name(''), '')


class CanReplyTests(ReviewTestCase):
    """The Reply button is drawn from the server's answer, not from a guess."""

    def setUp(self):
        super().setUp()
        self.appointment = self.finished(employee=self.chair)
        self.write(self.appointment, 2, 'Rushed.')

    def only(self, session) -> dict:
        self.as_user(session)
        response = self.client.get(MINE)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['results'][0]

    def test_the_owner_and_their_stylist_both_may_answer_an_unanswered_one(self):
        self.assertTrue(self.only(self.owner_session)['can_reply'])
        self.assertTrue(self.only(self.stylist)['can_reply'])

    def test_the_stylist_is_told_no_once_the_salon_has_spoken(self):
        self.as_user(self.owner_session)
        self.client.patch(booking(self.appointment), {'reply': 'We are sorry.'}, format='json')
        self.assertTrue(self.only(self.owner_session)['can_reply'])
        self.assertFalse(self.only(self.stylist)['can_reply'])

    def test_the_customer_is_never_offered_it(self):
        self.assertFalse(self.only(self.customer_session)['can_reply'])

    def test_it_travels_on_the_booking_too(self):
        self.as_user(self.owner_session)
        response = self.client.get(f'/api/bookings/{self.appointment}/')
        self.assertTrue(response.data['review']['can_reply'])
