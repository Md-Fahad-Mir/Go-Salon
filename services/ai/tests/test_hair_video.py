"""The 360° turnaround, end to end through this service, against a fake OpenRouter.

Only the network is fake. The OpenAI SDK, the image edit in `hair_generate`,
the video module and the FastAPI routes are the real code: an `httpx`
MockTransport stands in for openrouter.ai and records every request, so the
tests can read exactly what would have been sent — and spend nothing.

Run with:  .venv/bin/python -m unittest discover -s tests
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

import httpx
from openai import OpenAI
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("OPENROUTER_API_KEY", "test-key")

import hair_video  # noqa: E402
import main  # noqa: E402
import openrouter  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

BASE = "https://openrouter.test/api/v1"
JOB = "vid_abc123"
MP4 = b"\x00\x00\x00\x18ftypmp42fake-video-bytes"

#: A trimmed copy of OpenRouter's `/videos/models` shapes, one per case.
CATALOGUE = {
    "data": [
        {   # Usable: first frame, 3 s, three ratios. Priced per second in dollars.
            "id": "kwaivgi/kling-v3.0-std", "name": "Kling v3.0 Std",
            "supported_durations": [3, 4, 5], "supported_frame_images": ["first_frame", "last_frame"],
            "supported_resolutions": ["720p"], "supported_aspect_ratios": ["16:9", "9:16", "1:1"],
            "pricing_skus": {"duration_seconds": "0.084", "duration_seconds_with_audio": "0.126"},
        },
        {   # Usable: 2 and 3 s; priced in cents plus an image charge.
            "id": "x-ai/grok-imagine-video", "name": "Grok Imagine Video",
            "supported_durations": [1, 2, 3, 4], "supported_frame_images": ["first_frame"],
            "supported_resolutions": ["480p", "720p"], "supported_aspect_ratios": ["16:9", "9:16", "3:4"],
            "pricing_skus": {"cents_per_image_input": "0.2", "cents_per_video_output_second_720p": "7"},
        },
        {   # Not usable: cannot render inside 2–3 s.
            "id": "google/veo-3.1", "name": "Veo 3.1",
            "supported_durations": [4, 6, 8], "supported_frame_images": ["first_frame"],
            "supported_resolutions": ["720p"], "supported_aspect_ratios": ["16:9", "9:16"],
            "pricing_skus": {"duration_seconds_without_audio": "0.20"},
        },
        {   # Not usable: text-to-video only — cannot start from the photo.
            "id": "openai/sora-2-pro", "name": "Sora 2 Pro",
            "supported_durations": [2, 3, 4], "supported_frame_images": None,
            "supported_resolutions": ["720p"], "supported_aspect_ratios": ["16:9"],
            "pricing_skus": {"duration_seconds_720p": "0.30"},
        },
    ]
}


def jpeg(width: int, height: int, colour=(120, 90, 60)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), colour).save(buffer, format="JPEG")
    return buffer.getvalue()


class FakeOpenRouter:
    """Answers like openrouter.ai and keeps every request it was sent."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.job_status: dict[str, object] = {"id": JOB, "status": "in_progress"}
        self.reject_on_submit: str | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path.removeprefix("/api/v1")
        if request.method == "GET" and path == "/videos/models":
            return httpx.Response(200, json=CATALOGUE)
        if request.method == "POST" and path == "/images":
            still = base64.b64encode(jpeg(1024, 1536)).decode()
            return httpx.Response(200, json={"data": [{"b64_json": still, "media_type": "image/jpeg"}]})
        if request.method == "POST" and path == "/videos":
            body = json.loads(request.content)
            if self.reject_on_submit and self.reject_on_submit in body:
                return httpx.Response(400, json={"error": {"message": f"unsupported parameter: {self.reject_on_submit}"}})
            return httpx.Response(202, json={"id": JOB, "polling_url": f"{BASE}/videos/{JOB}", "status": "pending"})
        if request.method == "GET" and path == f"/videos/{JOB}":
            return httpx.Response(200, json=self.job_status)
        if request.method == "GET" and path == f"/videos/{JOB}/content":
            return httpx.Response(200, content=MP4, headers={"content-type": "video/mp4"})
        return httpx.Response(404, json={"error": {"message": "not found"}})

    def sent(self, method: str, path: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.method == method and r.url.path == f"/api/v1{path}"]

    def body(self, method: str, path: str) -> dict:
        found = self.sent(method, path)
        assert found, f"no {method} {path} was sent"
        return json.loads(found[-1].content)


class TurnaroundTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.upstream = FakeOpenRouter()
        transport = httpx.MockTransport(self.upstream.handler)

        def make_client(timeout: float) -> OpenAI:
            return OpenAI(api_key="test-key", base_url=BASE, timeout=timeout, max_retries=0,
                          http_client=httpx.Client(transport=transport))

        patches = [
            mock.patch.object(openrouter, "make_client", make_client),
            mock.patch.object(openrouter, "VIDEO_MODEL", "kwaivgi/kling-v3.0-std"),
            mock.patch.object(main, "SERVICE_TOKEN", ""),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        hair_video._catalogue = None
        self.addCleanup(lambda: setattr(hair_video, "_catalogue", None))
        self.client = TestClient(main.app)

    def start(self, **form) -> httpx.Response:
        data = {"hairstyle_name": "Textured crop",
                "hairstyle_description": "A textured crop, short on the sides, tousled on top",
                "hairstyle_id": "7", **form}
        return self.client.post("/videos", data=data, files={"image": ("selfie.jpg", jpeg(600, 900), "image/jpeg")})


class CatalogueTests(TurnaroundTestCase):
    def test_lists_only_models_that_start_from_a_photo_and_fit_two_to_three_seconds(self):
        response = self.client.get("/videos/models")
        self.assertEqual(response.status_code, 200, response.text)
        ids = [model["id"] for model in response.json()["models"]]
        self.assertEqual(ids, ["x-ai/grok-imagine-video", "kwaivgi/kling-v3.0-std"])  # cheapest first
        self.assertEqual(response.json()["default_model"], "kwaivgi/kling-v3.0-std")

    def test_each_model_carries_the_request_it_will_get_and_its_price(self):
        models = {m["id"]: m for m in self.client.get("/videos/models").json()["models"]}
        kling = models["kwaivgi/kling-v3.0-std"]
        self.assertEqual((kling["duration_seconds"], kling["resolution"]), (3, "720p"))
        self.assertAlmostEqual(kling["price_per_video_usd"], 0.252)   # 0.084 $/s x 3 s, no audio
        grok = models["x-ai/grok-imagine-video"]
        self.assertAlmostEqual(grok["price_per_video_usd"], 0.212)    # (7c x 3 + 0.2c) / 100

    def test_the_catalogue_is_cached_between_calls(self):
        self.client.get("/videos/models")
        self.client.get("/videos/models")
        self.assertEqual(len(self.upstream.sent("GET", "/videos/models")), 1)


class StartTests(TurnaroundTestCase):
    def test_renders_the_haircut_with_the_admin_prompt_then_starts_the_video_from_it(self):
        response = self.start()
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(response.json()["job"], {"id": JOB, "status": "processing"})

        # Step 1: the identity-preserving edit carries the admin's prompt.
        edit = self.upstream.body("POST", "/images")
        self.assertIn("A textured crop, short on the sides, tousled on top", edit["prompt"])

        # Step 2: the video starts from that edit, for 2-3 s, with the prompt again.
        video = self.upstream.body("POST", "/videos")
        self.assertEqual(video["model"], "kwaivgi/kling-v3.0-std")
        self.assertEqual(video["duration"], 3)
        self.assertEqual(video["resolution"], "720p")
        self.assertIs(video["generate_audio"], False)
        frame = video["frame_images"][0]
        self.assertEqual(frame["frame_type"], "first_frame")
        self.assertTrue(frame["image_url"]["url"].startswith("data:image/jpeg;base64,"))
        self.assertIn("360-degree", video["prompt"])
        self.assertIn("Textured crop", video["prompt"])
        self.assertIn("A textured crop, short on the sides, tousled on top", video["prompt"])
        self.assertIn("identical face", video["prompt"])

    def test_the_poster_is_the_first_frame_the_video_starts_from(self):
        body = self.start().json()
        sent_frame = self.upstream.body("POST", "/videos")["frame_images"][0]["image_url"]["url"]
        self.assertEqual(sent_frame, f"data:image/jpeg;base64,{body['poster']['b64']}")
        self.assertEqual(body["poster"]["mime_type"], "image/jpeg")

    def test_a_portrait_photo_gets_the_portrait_ratio_and_a_frame_cut_to_it(self):
        body = self.start().json()
        self.assertEqual(body["meta"]["aspect_ratio"], "9:16")
        self.assertEqual(self.upstream.body("POST", "/videos")["aspect_ratio"], "9:16")
        with Image.open(io.BytesIO(base64.b64decode(body["poster"]["b64"]))) as poster:
            self.assertAlmostEqual(poster.width / poster.height, 9 / 16, places=2)

    def test_the_admins_model_is_used_when_named(self):
        self.start(video_model="x-ai/grok-imagine-video")
        video = self.upstream.body("POST", "/videos")
        self.assertEqual(video["model"], "x-ai/grok-imagine-video")
        self.assertEqual(video["aspect_ratio"], "3:4")

    def test_an_unusable_model_is_refused_before_anything_is_spent(self):
        response = self.start(video_model="google/veo-3.1")
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(response.json()["detail"]["code"], "model_unavailable")
        self.assertEqual(self.upstream.sent("POST", "/images"), [])
        self.assertEqual(self.upstream.sent("POST", "/videos"), [])

    def test_a_rendering_hint_the_model_refuses_is_dropped_and_retried(self):
        self.upstream.reject_on_submit = "aspect_ratio"
        response = self.start()
        self.assertEqual(response.status_code, 202, response.text)
        attempts = self.upstream.sent("POST", "/videos")
        self.assertEqual(len(attempts), 2)
        self.assertNotIn("aspect_ratio", json.loads(attempts[1].content))

    def test_a_missing_name_is_a_422(self):
        response = self.client.post("/videos", data={"hairstyle_name": ""},
                                    files={"image": ("s.jpg", jpeg(600, 900), "image/jpeg")})
        self.assertEqual(response.status_code, 422)


class PollAndDownloadTests(TurnaroundTestCase):
    def test_upstream_states_fold_into_three(self):
        for upstream, expected in (("pending", "processing"), ("in_progress", "processing"),
                                   ("completed", "completed"), ("expired", "failed")):
            self.upstream.job_status = {"id": JOB, "status": upstream}
            self.assertEqual(self.client.get(f"/videos/{JOB}").json()["status"], expected, upstream)

    def test_a_moderation_failure_says_so(self):
        self.upstream.job_status = {"id": JOB, "status": "failed", "error": "Rejected by safety moderation"}
        body = self.client.get(f"/videos/{JOB}").json()
        self.assertEqual(body["status"], "failed")
        self.assertEqual(body["error"]["code"], "content_blocked")

    def test_the_clip_is_streamed_through(self):
        response = self.client.get(f"/videos/{JOB}/content")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, MP4)
        self.assertEqual(response.headers["content-type"], "video/mp4")
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_a_malformed_job_id_never_reaches_upstream(self):
        response = self.client.get("/videos/..%2Fmodels")
        self.assertIn(response.status_code, (404, 422))
        self.assertEqual(self.upstream.requests, [])

    def test_an_unknown_job_is_a_404(self):
        response = self.client.get("/videos/vid_unknown")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"]["code"], "video_not_found")


class ServiceTokenTests(TurnaroundTestCase):
    def test_once_set_the_video_endpoints_need_it(self):
        with mock.patch.object(main, "SERVICE_TOKEN", "s3cret"):
            self.assertEqual(self.client.get("/videos/models").status_code, 401)
            self.assertEqual(self.client.get(f"/videos/{JOB}").status_code, 401)
            authorised = self.client.get("/videos/models", headers={"Authorization": "Bearer s3cret"})
            self.assertEqual(authorised.status_code, 200)
        self.assertEqual(self.upstream.sent("POST", "/videos"), [])


class FrameTests(unittest.TestCase):
    def test_a_frame_too_tall_loses_rows_from_the_bottom_not_the_top(self):
        image = Image.new("RGB", (900, 1600), (0, 0, 255))
        image.paste((255, 0, 0), (0, 0, 900, 50))            # the top of the head
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG")
        data, width, height = hair_video.fit_frame(buffer.getvalue(), "3:4")
        self.assertEqual((width, height), (900, 1200))
        with Image.open(io.BytesIO(data)) as fitted:
            red, _, blue = fitted.getpixel((450, 10))
            self.assertGreater(red, 200)
            self.assertLess(blue, 60)

    def test_a_frame_too_wide_loses_columns_evenly(self):
        _, width, height = hair_video.fit_frame(jpeg(1600, 900), "1:1")
        self.assertEqual((width, height), (900, 900))

    def test_the_nearest_ratio_wins(self):
        self.assertEqual(hair_video.choose_aspect_ratio(("16:9", "9:16", "1:1"), 1024, 1536), "9:16")
        self.assertEqual(hair_video.choose_aspect_ratio(("16:9", "3:4", "9:16"), 1024, 1536), "3:4")
        self.assertIsNone(hair_video.choose_aspect_ratio((), 1024, 1536))


if __name__ == "__main__":
    unittest.main()
