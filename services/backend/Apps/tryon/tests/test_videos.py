"""The 360° try-on video through the backend, with the AI service faked.

What matters most here is what the backend *sends*: the prompt must be the
admin's for an active style, and the model the admin's pick — never anything
the app supplies.
"""

from __future__ import annotations

import urllib.error
from datetime import timedelta
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

from Apps.hairstyles.models import Hairstyle
from Apps.tryon import ai_service
from Apps.tryon.ai_service import AIServiceError
from Apps.tryon.models import TryOnSettings, TryOnVideo, VideoStatus
from Apps.users.tests.base import AuthTestCase

VIDEOS = '/api/tryon/videos/'
SETTINGS = '/api/admin/settings/ai-generation/'

CATALOGUE = {
    'default_model': 'kwaivgi/kling-v3.0-std',
    'models': [
        {'id': 'x-ai/grok-imagine-video', 'name': 'Grok Imagine Video', 'duration_seconds': 3,
         'resolution': '720p', 'price_per_video_usd': 0.212, 'description': ''},
        {'id': 'kwaivgi/kling-v3.0-std', 'name': 'Kling v3.0 Std', 'duration_seconds': 3,
         'resolution': '720p', 'price_per_video_usd': 0.252, 'description': ''},
    ],
}

STARTED = {
    'job': {'id': 'vid_abc123', 'status': 'processing'},
    'poster': {'b64': 'AAAA', 'mime_type': 'image/jpeg'},
    'meta': {'video_model': 'kwaivgi/kling-v3.0-std', 'duration_seconds': 3},
}


def video(pk: int) -> str:
    return f'{VIDEOS}{pk}/'


def photo(size: int = 2048, content_type: str = 'image/jpeg') -> SimpleUploadedFile:
    return SimpleUploadedFile('selfie.jpg', b'\xff\xd8' + b'0' * size, content_type=content_type)


class TryOnTestCase(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.style = Hairstyle.objects.create(
            name='Textured crop', category='Haircut',
            description='A textured crop haircut, short on the sides, tousled on top',
        )
        self.start = self.patch('start_video', return_value=STARTED)
        self.status = self.patch('video_status', return_value={'id': 'vid_abc123', 'status': 'processing'})
        self.content = self.patch('video_content', return_value=(b'mp4-bytes', 'video/mp4'))
        self.models = self.patch('video_models', return_value=CATALOGUE)

    def patch(self, name: str, **kwargs) -> mock.MagicMock:
        patcher = mock.patch.object(ai_service, name, **kwargs)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def begin(self, **data):
        return self.client.post(VIDEOS, {'image': photo(), 'hairstyle_id': self.style.pk, **data}, format='multipart')


class StartTests(TryOnTestCase):
    def test_a_customer_starts_a_video_with_the_admins_prompt(self):
        self.as_user(self.make_customer())
        response = self.begin()

        self.assertEqual(response.status_code, 201, response.data)
        sent = self.start.call_args.kwargs
        self.assertEqual(sent['prompt'], 'A textured crop haircut, short on the sides, tousled on top')
        self.assertEqual(sent['hairstyle_name'], 'Textured crop')
        self.assertEqual(sent['hairstyle_id'], str(self.style.pk))
        self.assertEqual(sent['video_model'], '')          # none picked yet: the service's default
        self.assertTrue(sent['photo'].startswith(b'\xff\xd8'))

        self.assertEqual(response.data['status'], 'processing')
        self.assertEqual(response.data['hairstyle_name'], 'Textured crop')
        self.assertEqual(response.data['poster'], 'data:image/jpeg;base64,AAAA')
        stored = TryOnVideo.objects.get()
        self.assertEqual((stored.job_id, stored.video_model, stored.duration_seconds),
                         ('vid_abc123', 'kwaivgi/kling-v3.0-std', 3))

    def test_a_prompt_from_the_app_is_ignored(self):
        self.as_user(self.make_customer())
        self.begin(prompt='something else entirely', hairstyle_description='also ignored')
        self.assertEqual(self.start.call_args.kwargs['prompt'], self.style.description)

    def test_the_admins_model_is_the_one_sent(self):
        TryOnSettings.objects.update_or_create(pk=1, defaults={'video_model': 'x-ai/grok-imagine-video'})
        self.as_user(self.make_customer())
        self.begin()
        self.assertEqual(self.start.call_args.kwargs['video_model'], 'x-ai/grok-imagine-video')

    def test_salon_staff_may_and_a_barber_may_not(self):
        self.as_user(self.make_owner())
        self.assertEqual(self.begin().status_code, 201)
        self.as_user(self.make_barber())
        self.assertEqual(self.begin().status_code, 403)

    def test_an_anonymous_caller_is_refused(self):
        self.assertEqual(self.begin().status_code, 401)
        self.start.assert_not_called()

    def test_a_withdrawn_style_is_refused_before_anything_is_spent(self):
        self.style.is_active = False
        self.style.save()
        self.as_user(self.make_customer())
        response = self.begin()
        self.assertEqual(response.status_code, 404, response.data)
        self.assertEqual(response.data['code'], 'hairstyle_unavailable')
        self.start.assert_not_called()

    def test_the_photo_is_checked_before_the_trip(self):
        self.as_user(self.make_customer())
        missing = self.client.post(VIDEOS, {'hairstyle_id': self.style.pk}, format='multipart')
        self.assertEqual(missing.status_code, 400)
        self.assertIn('image', missing.data['errors'])
        too_big = self.client.post(VIDEOS, {'image': photo(size=11 * 1024 * 1024), 'hairstyle_id': self.style.pk},
                                   format='multipart')
        self.assertEqual(too_big.status_code, 400)
        not_photo = self.client.post(VIDEOS, {'image': photo(content_type='text/plain'), 'hairstyle_id': self.style.pk},
                                     format='multipart')
        self.assertEqual(not_photo.status_code, 400)
        self.start.assert_not_called()

    def test_the_ai_services_refusal_reaches_the_app_with_its_code(self):
        self.start.side_effect = AIServiceError('content_blocked', 'Try a different photo.', 422)
        self.as_user(self.make_customer())
        response = self.begin()
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data['code'], 'content_blocked')
        self.assertFalse(TryOnVideo.objects.exists())


class StatusTests(TryOnTestCase):
    def setUp(self):
        super().setUp()
        self.customer = self.make_customer()
        self.as_user(self.customer)
        self.video_id = self.begin().data['id']

    def test_completing_counts_one_generation_however_often_it_is_polled(self):
        self.status.return_value = {'id': 'vid_abc123', 'status': 'completed'}
        first = self.client.get(video(self.video_id))
        second = self.client.get(video(self.video_id))
        self.assertEqual(first.data['status'], 'completed')
        self.assertEqual(second.data['status'], 'completed')
        self.style.refresh_from_db()
        self.assertEqual(self.style.generation_count, 1)
        self.assertEqual(self.status.call_count, 1)        # a finished job is not asked about again

    def test_upstream_is_asked_at_most_once_per_window(self):
        self.client.get(video(self.video_id))
        self.client.get(video(self.video_id))
        self.assertEqual(self.status.call_count, 1)
        TryOnVideo.objects.update(checked_at=timezone.now() - timedelta(seconds=30))
        self.client.get(video(self.video_id))
        self.assertEqual(self.status.call_count, 2)

    def test_a_failed_video_says_why(self):
        self.status.return_value = {'id': 'vid_abc123', 'status': 'failed',
                                    'error': {'code': 'content_blocked', 'message': 'Try a different photo.'}}
        body = self.client.get(video(self.video_id)).data
        self.assertEqual(body['status'], 'failed')
        self.assertEqual(body['error'], {'code': 'content_blocked', 'message': 'Try a different photo.'})
        self.style.refresh_from_db()
        self.assertEqual(self.style.generation_count, 0)

    def test_a_hiccup_upstream_keeps_the_video_in_flight(self):
        self.status.side_effect = AIServiceError('provider_timeout', 'Slow.', 504)
        response = self.client.get(video(self.video_id))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'processing')

    def test_someone_elses_video_is_a_404(self):
        self.as_user(self.make_customer(phone='01777000999'))
        self.assertEqual(self.client.get(video(self.video_id)).status_code, 404)
        self.assertEqual(self.client.get(f'{video(self.video_id)}content/').status_code, 404)


class ContentTests(TryOnTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.make_customer())
        self.video_id = self.begin().data['id']

    def test_the_finished_clip_comes_through(self):
        self.status.return_value = {'id': 'vid_abc123', 'status': 'completed'}
        response = self.client.get(f'{video(self.video_id)}content/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'mp4-bytes')
        self.assertEqual(response['Content-Type'], 'video/mp4')
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.content.assert_called_once_with('vid_abc123')

    def test_an_unfinished_clip_is_a_409(self):
        response = self.client.get(f'{video(self.video_id)}content/')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['code'], 'video_not_ready')
        self.content.assert_not_called()


class AdminSettingsTests(TryOnTestCase):
    def test_lists_the_models_and_the_one_in_use(self):
        self.as_user(self.admin_session())
        body = self.client.get(SETTINGS).data
        self.assertEqual(body['video_model'], 'kwaivgi/kling-v3.0-std')   # the service's default
        self.assertEqual(body['selected'], '')
        self.assertEqual([m['id'] for m in body['models']], ['x-ai/grok-imagine-video', 'kwaivgi/kling-v3.0-std'])
        self.assertTrue(body['video_model_available'])

    def test_switching_the_model_sticks_and_is_used(self):
        admin, customer = self.admin_session(), self.make_customer()
        self.as_user(admin)
        response = self.client.patch(SETTINGS, {'video_model': 'x-ai/grok-imagine-video'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['video_model'], 'x-ai/grok-imagine-video')

        self.as_user(customer)
        self.begin()
        self.assertEqual(self.start.call_args.kwargs['video_model'], 'x-ai/grok-imagine-video')

    def test_only_a_listed_model_can_be_picked(self):
        self.as_user(self.admin_session())
        response = self.client.patch(SETTINGS, {'video_model': 'google/veo-3.1'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('video_model', response.data['errors'])
        self.assertEqual(TryOnSettings.load().video_model, '')

    def test_only_an_admin_gets_in(self):
        self.as_user(self.make_customer())
        self.assertEqual(self.client.get(SETTINGS).status_code, 403)
        self.assertEqual(self.client.patch(SETTINGS, {'video_model': 'x'}, format='json').status_code, 403)

    def test_an_unreachable_ai_service_still_shows_the_page(self):
        self.models.side_effect = AIServiceError('ai_service_unreachable', 'Could not reach it.', 502)
        self.as_user(self.admin_session())
        response = self.client.get(SETTINGS)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['models'], [])
        self.assertEqual(response.data['models_error']['code'], 'ai_service_unreachable')


@override_settings(AI_SERVICE_URL='http://ai.test', AI_SERVICE_TOKEN='s3cret')
class ClientTests(AuthTestCase):
    """The urllib client itself, with the socket replaced."""

    def test_multipart_carries_every_field_and_the_photo(self):
        body, content_type = ai_service.encode_multipart(
            {'hairstyle_name': 'Textured crop', 'hairstyle_description': 'Short sides'},
            {'image': ('photo.jpg', 'image/jpeg', b'\xff\xd8JPEG')},
        )
        boundary = content_type.split('boundary=')[1]
        self.assertTrue(body.endswith(f'--{boundary}--\r\n'.encode()))
        self.assertIn(b'name="hairstyle_description"\r\n\r\nShort sides\r\n', body)
        self.assertIn(b'filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n\xff\xd8JPEG\r\n', body)

    def test_sends_the_service_token_and_reads_the_answer(self):
        response = mock.MagicMock()
        response.read.return_value = b'{"id": "vid_1", "status": "completed"}'
        response.__enter__.return_value = response
        with mock.patch('urllib.request.urlopen', return_value=response) as urlopen:
            self.assertEqual(ai_service.video_status('vid_1')['status'], 'completed')
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, 'http://ai.test/videos/vid_1')
        self.assertEqual(request.get_header('Authorization'), 'Bearer s3cret')

    def test_the_services_error_code_survives(self):
        error = urllib.error.HTTPError(
            'http://ai.test/videos', 422, 'Unprocessable', {},
            mock.MagicMock(read=lambda: b'{"detail": {"code": "content_blocked", "message": "No."}}'),
        )
        error.read = lambda: b'{"detail": {"code": "content_blocked", "message": "No."}}'
        with mock.patch('urllib.request.urlopen', side_effect=error):
            with self.assertRaises(AIServiceError) as caught:
                ai_service.video_status('vid_1')
        self.assertEqual((caught.exception.code, caught.exception.status_code), ('content_blocked', 422))

    def test_a_token_mismatch_is_ours_to_fix(self):
        error = urllib.error.HTTPError('http://ai.test/videos', 401, 'Unauthorized', {}, None)
        error.read = lambda: b'{"detail": {"code": "unauthorized", "message": "x"}}'
        with mock.patch('urllib.request.urlopen', side_effect=error):
            with self.assertRaises(AIServiceError) as caught:
                ai_service.video_models()
        self.assertEqual((caught.exception.code, caught.exception.status_code), ('ai_service_unconfigured', 503))

    def test_an_unreachable_service_is_a_502(self):
        with mock.patch('urllib.request.urlopen', side_effect=urllib.error.URLError('refused')):
            with self.assertRaises(AIServiceError) as caught:
                ai_service.video_models()
        self.assertEqual((caught.exception.code, caught.exception.status_code), ('ai_service_unreachable', 502))

    def test_a_job_id_cannot_walk_to_another_path(self):
        response = mock.MagicMock()
        response.read.return_value = b'{"status": "processing"}'
        response.__enter__.return_value = response
        with mock.patch('urllib.request.urlopen', return_value=response) as urlopen:
            ai_service.video_status('../models')
        self.assertEqual(urlopen.call_args.args[0].full_url, 'http://ai.test/videos/..%2Fmodels')


class StatusMachineTests(TryOnTestCase):
    def test_a_job_the_service_has_never_heard_of_fails_cleanly(self):
        self.as_user(self.make_customer())
        video_id = self.begin().data['id']
        self.status.side_effect = AIServiceError('video_not_found', 'No such video.', 404)
        body = self.client.get(video(video_id)).data
        self.assertEqual(body['status'], VideoStatus.FAILED)
        self.assertEqual(body['error']['code'], 'video_failed')
