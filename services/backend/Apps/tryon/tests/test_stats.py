"""The Overview's AI spend vs revenue, with the AI service's price list faked."""

from __future__ import annotations

from unittest import mock

from django.test import TestCase, override_settings

from Apps.tryon import ai_service
from Apps.tryon.ai_service import AIServiceError
from Apps.tryon.models import TryOnSettings, TryOnVideo, VideoStatus
from Apps.tryon.stats import spend_and_revenue
from Apps.users.models import User

CATALOGUE = {
    'default_model': 'kwaivgi/kling-v3.0-std',
    'models': [
        {'id': 'x-ai/grok-imagine-video', 'price_per_video_usd': 0.2},
        {'id': 'kwaivgi/kling-v3.0-std', 'price_per_video_usd': 0.25},
        {'id': 'some/unpriced-model', 'price_per_video_usd': None},
    ],
}


@override_settings(USD_TO_BDT_RATE=120.0)
class SpendAndRevenueTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(phone='+8801711111111', password='x-Unused-pass-1')
        self.models = mock.patch.object(ai_service, 'video_models', return_value=CATALOGUE).start()
        self.addCleanup(mock.patch.stopall)
        self.jobs = 0

    def video(self, model: str, status: str = VideoStatus.COMPLETED) -> None:
        self.jobs += 1
        TryOnVideo.objects.create(user=self.user, hairstyle_name='Skin fade', job_id=f'job-{self.jobs}',
                                  video_model=model, status=status)

    def stats(self) -> dict:
        return spend_and_revenue(TryOnVideo.objects.filter(status=VideoStatus.COMPLETED))

    def test_each_video_is_priced_at_the_model_that_rendered_it(self):
        row = TryOnSettings.load()
        row.video_price_bdt = 40
        row.save()
        self.video('x-ai/grok-imagine-video')
        self.video('kwaivgi/kling-v3.0-std')
        self.video('kwaivgi/kling-v3.0-std')
        self.video('kwaivgi/kling-v3.0-std', VideoStatus.FAILED)       # never finished: costs nothing here

        stats = self.stats()
        self.assertEqual(stats['videos'], 3)
        self.assertAlmostEqual(stats['spend_usd'], 0.2 + 0.25 * 2)
        self.assertAlmostEqual(stats['spend_bdt'], 84.0)                # $0.70 at 120
        self.assertEqual(stats['revenue_bdt'], 120)                     # 3 × ৳40
        self.assertEqual(stats['margin_pct'], 30.0)
        self.assertEqual(stats['unpriced_videos'], 0)

    def test_a_video_without_a_model_uses_the_one_in_use(self):
        self.video('')
        self.assertAlmostEqual(self.stats()['spend_usd'], 0.25)        # the AI service's default

    def test_a_model_with_no_price_is_left_out_and_counted(self):
        self.video('some/unpriced-model')
        self.video('retired/model')
        self.video('x-ai/grok-imagine-video')
        stats = self.stats()
        self.assertAlmostEqual(stats['spend_usd'], 0.2)
        self.assertEqual(stats['unpriced_videos'], 2)

    def test_no_videos_costs_nothing_and_asks_nobody(self):
        stats = self.stats()
        self.assertEqual((stats['videos'], stats['spend_bdt'], stats['revenue_bdt']), (0, 0.0, 0))
        self.assertIsNone(stats['margin_pct'])
        self.models.assert_not_called()

    def test_an_unreachable_ai_service_leaves_spend_unknown(self):
        self.models.side_effect = AIServiceError('ai_service_unreachable', 'Could not reach it.', 502)
        self.video('x-ai/grok-imagine-video')
        stats = self.stats()
        self.assertIsNone(stats['spend_bdt'])
        self.assertIsNone(stats['margin_pct'])
        self.assertEqual(stats['revenue_bdt'], 15)                      # the default price still counts
        self.assertEqual(stats['error']['code'], 'ai_service_unreachable')
