"""Try-on credits: the plan's monthly allowance, spent one per video, read
straight off the video log — and enforced before the AI service is asked."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from itertools import count

from Apps.bookings.models import business_tz
from Apps.subscriptions.models import SubscriptionTier
from Apps.tryon import credits
from Apps.tryon.ai_service import AIServiceError
from Apps.tryon.models import TryOnVideo, VideoStatus
from Apps.users.models import User

from .test_videos import STARTED, TryOnTestCase

CREDITS = '/api/tryon/credits/'


class CreditTestCase(TryOnTestCase):
    def setUp(self):
        super().setUp()
        # A fresh job id per start: the log keys videos by it.
        jobs = count(1)
        self.start.side_effect = lambda **_: {**STARTED, 'job': {'id': f'vid_{next(jobs)}', 'status': 'processing'}}
        self.session = self.make_customer()
        self.as_user(self.session)
        self.user = self.user_for(self.session)

    def on_plan(self, slug: str) -> None:
        User.objects.filter(pk=self.user.pk).update(subscription_tier=slug)

    def balance(self) -> dict:
        response = self.client.get(CREDITS)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data


class BalanceTests(CreditTestCase):
    def test_a_new_account_has_its_plans_monthly_credits(self):
        data = self.balance()
        self.assertEqual(data['plan'], {'slug': 'free', 'name': 'Free'})
        self.assertEqual((data['total'], data['used'], data['remaining']), (3, 0, 3))
        self.assertFalse(data['unlimited'])
        self.assertGreater(data['resets_at'], data['period_start'])

    def test_the_account_payload_carries_the_same_balance(self):
        me = self.client.get('/api/auth/me/')
        self.assertEqual(me.status_code, 200, me.data)
        self.assertEqual(me.data['credits']['remaining'], 3)
        self.assertNotIn('try_on_credits', me.data)

    def test_changing_plan_changes_the_allowance_at_once(self):
        self.on_plan('basic')
        data = self.balance()
        self.assertEqual((data['plan']['name'], data['total'], data['remaining']), ('Basic', 30, 30))

    def test_an_admin_edit_to_the_plan_reaches_the_app(self):
        SubscriptionTier.objects.filter(slug='free').update(monthly_credits=5)
        self.assertEqual(self.balance()['remaining'], 5)

    def test_an_unlimited_plan_has_no_ceiling(self):
        self.on_plan('advanced')
        data = self.balance()
        self.assertTrue(data['unlimited'])
        self.assertIsNone(data['total'])
        self.assertIsNone(data['remaining'])


class SpendingTests(CreditTestCase):
    def test_starting_a_video_spends_one_and_says_so(self):
        response = self.begin()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual((response.data['credits']['used'], response.data['credits']['remaining']), (1, 2))
        self.assertEqual(TryOnVideo.objects.get().job_id, 'vid_1')

    def test_a_failed_video_gives_its_credit_back(self):
        self.begin()
        TryOnVideo.objects.update(status=VideoStatus.FAILED)
        self.assertEqual(self.balance()['remaining'], 3)

    def test_with_none_left_the_ai_service_is_never_asked(self):
        for _ in range(3):
            self.assertEqual(self.begin().status_code, 201)
        self.start.reset_mock()

        refused = self.begin()
        self.assertEqual(refused.status_code, 403, refused.data)
        self.assertEqual(refused.data['code'], 'no_credits')
        self.start.assert_not_called()
        self.assertEqual(TryOnVideo.objects.count(), 3)

    def test_a_refusal_upstream_costs_nothing(self):
        self.start.side_effect = AIServiceError('content_blocked', 'Try a different photo.', 422)
        self.assertEqual(self.begin().status_code, 422)
        self.assertEqual(self.balance()['remaining'], 3)
        self.assertFalse(TryOnVideo.objects.exists())

    def test_an_unlimited_plan_keeps_going(self):
        self.on_plan('advanced')
        for _ in range(5):
            self.assertEqual(self.begin().status_code, 201)
        self.assertEqual(self.balance()['used'], 5)

    def test_last_months_videos_do_not_count(self):
        for _ in range(3):
            self.begin()
        start, _ = credits.current_period()
        TryOnVideo.objects.update(created_at=start - timedelta(minutes=1))
        data = self.balance()
        self.assertEqual((data['used'], data['remaining']), (0, 3))


class PeriodTests(CreditTestCase):
    def test_the_month_runs_on_business_time(self):
        # 18:30 UTC on 31 October is already 1 November in Dhaka.
        start, end = credits.current_period(datetime(2026, 10, 31, 18, 30, tzinfo=UTC))
        self.assertEqual((start.month, start.day, end.month, end.day), (11, 1, 12, 1))
        self.assertEqual(start.utcoffset(), timedelta(hours=6))
        december, january = credits.current_period(datetime(2026, 12, 15, tzinfo=business_tz()))
        self.assertEqual((december.month, january.year, january.month), (12, 2027, 1))


class AdminUsageTests(CreditTestCase):
    def test_generations_used_counts_finished_videos(self):
        self.begin()
        self.begin()
        TryOnVideo.objects.filter(job_id='vid_1').update(status=VideoStatus.COMPLETED)
        self.as_user(self.admin_session())
        row = self.client.get(f'/api/admin/users/{self.user.pk}/').data
        self.assertEqual(row['generations_used'], 1)
