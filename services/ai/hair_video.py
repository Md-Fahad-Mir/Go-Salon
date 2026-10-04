"""360° hairstyle try-on: a 2–3 second video of the customer turning all the way
round, wearing the chosen hairstyle.

Two steps, both through OpenRouter:

1. **The haircut, on the customer's own photo** — `hair_generate`'s
   identity-preserving edit, unchanged, with the admin's prompt as the style's
   description. That still is what makes the video *this* person: an
   image-to-video model animates the frame it is given, so the face in the
   video is the face in the photograph rather than a model's idea of it.
2. **That still as the first frame of a short video** — `POST /api/v1/videos`
   — asked for one steady full turn: front, one side, the back, the other
   side, and the front again.

Video generation is asynchronous upstream (submit → poll → download), and this
service stays stateless through it: the OpenRouter job id is the only state.
The caller keeps it and asks about it; the finished file is streamed through
on request and never stored here.
"""

from __future__ import annotations

import base64
import io
import logging
import math
import os
import re
import threading
import time
from dataclasses import dataclass

import httpx
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    OpenAI,
    PermissionDeniedError,
    RateLimitError,
)
from PIL import Image

import openrouter
from hair_generate import (
    MAX_DESCRIPTION_LENGTH,
    MAX_NAME_LENGTH,
    HairstyleRequest,
    generate_hairstyle_image,
    sanitize_text,
)
from image_io import NormalizedImage

logger = logging.getLogger(__name__)

#: The product asks for a 2–3 second turn. A model that cannot render inside
#: that window is not offered at all, rather than offered and quietly made
#: longer.
MIN_SECONDS = 2
MAX_SECONDS = 3
#: Within the window, the length asked for when the model allows it. Three
#: seconds gives the back of the head a moment on screen; two is the floor.
PREFERRED_SECONDS = min(MAX_SECONDS, max(MIN_SECONDS, int(os.getenv("OPENROUTER_VIDEO_DURATION", "3"))))
#: Asked for when the model offers it, otherwise the nearest it does.
PREFERRED_RESOLUTION = os.getenv("OPENROUTER_VIDEO_RESOLUTION", "720p")
_RESOLUTION_FALLBACKS = ("720p", "768p", "1080p", "480p")

#: How long OpenRouter's model catalogue is trusted before it is asked again.
#: It changes when a provider adds a model, not from minute to minute.
_CATALOGUE_TTL_SECONDS = 600

#: A finished 3-second clip is a few MB. Anything wildly larger is not one.
MAX_VIDEO_BYTES = 80 * 1024 * 1024

#: OpenRouter job ids are opaque tokens. Only these characters ever reach a
#: URL path, so an id cannot walk to a different endpoint.
_JOB_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

#: Rendering hints a model may not take. A 400 naming one retries without it,
#: so switching models degrades to the provider's defaults instead of failing.
_OPTIONAL_PARAMS = ("generate_audio", "aspect_ratio", "resolution")

_PENDING_STATES = {"pending", "queued", "in_progress", "processing", "running"}
_FAILED_STATES = {"failed", "cancelled", "canceled", "expired", "error"}


class VideoGenerationError(RuntimeError):
    """A video failure with a client-safe message and HTTP status, the same
    contract as `hair_generate.ImageGenerationError`."""

    def __init__(self, code: str, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


# ─────────────────────────────────────────────────────────────────────────────
# THE MODEL CATALOGUE
# ─────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class VideoModel:
    """One OpenRouter video model this product can use, and how it will be
    asked: the duration and resolution are settled here, once, so the price
    an admin is shown is the price of the request actually sent."""

    id: str
    name: str
    description: str
    duration: int
    resolution: str | None
    aspect_ratios: tuple[str, ...]
    #: OpenRouter's list price for one clip as this service requests it,
    #: in US dollars. None when the model is priced in a unit (tokens) that
    #: cannot be turned into a per-clip figure in advance.
    price_per_video_usd: float | None

    def as_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "duration_seconds": self.duration,
            "resolution": self.resolution,
            "price_per_video_usd": self.price_per_video_usd,
        }


def choose_duration(durations: object) -> int | None:
    """The clip length to ask for: the preferred one if the model offers it,
    else the longest it offers inside the 2–3 s window, else None."""
    if not isinstance(durations, list):
        return None
    usable = sorted({d for d in durations if isinstance(d, int) and MIN_SECONDS <= d <= MAX_SECONDS})
    if not usable:
        return None
    return PREFERRED_SECONDS if PREFERRED_SECONDS in usable else usable[-1]


def choose_resolution(resolutions: object) -> str | None:
    if not isinstance(resolutions, list) or not resolutions:
        return None
    for wanted in (PREFERRED_RESOLUTION, *_RESOLUTION_FALLBACKS):
        if wanted in resolutions:
            return wanted
    return str(resolutions[0])


def _number(pricing: dict, key: str) -> float | None:
    try:
        return float(pricing[key])
    except (KeyError, TypeError, ValueError):
        return None


def estimate_price(pricing: object, duration: int, resolution: str | None) -> float | None:
    """OpenRouter's list price for one clip, from its `pricing_skus`.

    The SKUs are named per provider, so this reads the shapes that exist —
    dollars per second, cents per second, plus a per-image charge — most
    specific first. Audio is never requested, so a without-audio SKU wins.
    """
    if not isinstance(pricing, dict):
        return None
    res = resolution or ""
    per_second_usd = (
        f"duration_seconds_without_audio_{res}",
        "duration_seconds_without_audio",
        f"image_to_video_duration_seconds_{res}",
        f"duration_seconds_{res}",
        "duration_seconds",
    )
    for key in per_second_usd:
        value = _number(pricing, key)
        if value is not None:
            return round(value * duration, 4)
    per_second_cents = (
        f"cents_per_video_output_second_{res}",
        f"cents_per_second_output_{res}",
        "cents_per_second_output",
    )
    for key in per_second_cents:
        value = _number(pricing, key)
        if value is not None:
            image = _number(pricing, "cents_per_image_input") or 0.0
            return round((value * duration + image) / 100, 4)
    return None


def to_video_model(raw: object) -> VideoModel | None:
    """A catalogue row, if this product can use the model: it must start from
    an image (`first_frame`) and render inside the 2–3 s window."""
    if not isinstance(raw, dict) or not isinstance(raw.get("id"), str):
        return None
    frames = raw.get("supported_frame_images") or []
    if "first_frame" not in frames:
        return None
    duration = choose_duration(raw.get("supported_durations"))
    if duration is None:
        return None
    resolution = choose_resolution(raw.get("supported_resolutions"))
    ratios = tuple(str(r) for r in (raw.get("supported_aspect_ratios") or []) if isinstance(r, str))
    description = str(raw.get("description") or "")
    return VideoModel(
        id=raw["id"],
        name=str(raw.get("name") or raw["id"]),
        description=description[:240],
        duration=duration,
        resolution=resolution,
        aspect_ratios=ratios,
        price_per_video_usd=estimate_price(raw.get("pricing_skus"), duration, resolution),
    )


_catalogue_lock = threading.Lock()
_catalogue: tuple[float, list[VideoModel]] | None = None


def list_video_models(*, refresh: bool = False) -> list[VideoModel]:
    """Every OpenRouter video model the 360° try-on can run on, cheapest first.

    Read from `GET /api/v1/videos/models` and cached for a few minutes. Free to
    call: it lists models, it does not run one.
    """
    global _catalogue
    with _catalogue_lock:
        if not refresh and _catalogue and time.monotonic() - _catalogue[0] < _CATALOGUE_TTL_SECONDS:
            return list(_catalogue[1])

    _require_key()
    client = openrouter.make_client(openrouter.VIDEO_TIMEOUT)
    try:
        payload = client.get("/videos/models", cast_to=object)
    except Exception as exc:  # noqa: BLE001 - mapped to a client-safe error
        raise _translate(exc, action="list the video models") from exc

    rows = payload.get("data") if isinstance(payload, dict) else payload
    models = [m for m in (to_video_model(row) for row in (rows or [])) if m is not None]
    models.sort(key=lambda m: (m.price_per_video_usd is None, m.price_per_video_usd or 0.0, m.name))
    with _catalogue_lock:
        _catalogue = (time.monotonic(), models)
    return list(models)


def resolve_model(model_id: str | None) -> VideoModel:
    """The model to render with: the one named, or the configured default.
    Refused before anything is spent if it cannot do a 2–3 s turn from a photo."""
    wanted = (model_id or "").strip() or openrouter.VIDEO_MODEL
    for model in list_video_models():
        if model.id == wanted:
            return model
    logger.error("Video model %r is not available for a 2-3 s image-to-video render.", wanted)
    raise VideoGenerationError(
        "model_unavailable",
        "The selected video model is not available. Choose another in the admin settings.",
        status=503,
    )


# ─────────────────────────────────────────────────────────────────────────────
# THE FIRST FRAME
# ─────────────────────────────────────────────────────────────────────────────
def _ratio(value: str) -> float | None:
    try:
        width, height = (float(part) for part in value.split(":"))
        return width / height if width > 0 and height > 0 else None
    except ValueError:
        return None


def choose_aspect_ratio(supported: tuple[str, ...], width: int, height: int) -> str | None:
    """The model's aspect ratio nearest the photo's own. None when the model
    lists none, which leaves the shape to the provider and the frame."""
    if not supported or width <= 0 or height <= 0:
        return None
    source = width / height
    candidates = [(abs(math.log(r / source)), value) for value in supported if (r := _ratio(value))]
    return min(candidates)[1] if candidates else None


def fit_frame(data: bytes, aspect_ratio: str | None) -> tuple[bytes, int, int]:
    """Crop the still to the video's shape so the provider never has to.

    Left to a provider, a mismatched frame is centre-cropped — which, on a
    portrait selfie going into a squarer video, takes the top of the head off:
    the one part of the picture this product is about. So a frame that is too
    tall loses rows from the bottom, and one that is too wide loses columns
    evenly from both sides. Returns JPEG bytes and the new size.
    """
    with Image.open(io.BytesIO(data)) as source:
        image = source.convert("RGB")
    width, height = image.size
    target = _ratio(aspect_ratio) if aspect_ratio else None
    if target and abs(width / height - target) > 0.01:
        if width / height > target:
            new_width = max(1, round(height * target))
            left = (width - new_width) // 2
            image = image.crop((left, 0, left + new_width, height))
        else:
            image = image.crop((0, 0, width, max(1, round(width / target))))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=92)
    return buffer.getvalue(), image.width, image.height


# ─────────────────────────────────────────────────────────────────────────────
# THE PROMPT
# ─────────────────────────────────────────────────────────────────────────────
#: Written for an image-to-video model holding a real photograph as its first
#: frame. The identity paragraph is the one that matters most: told only to
#: "turn around", a model returns a face that is near the original but not it.
_TURNAROUND_BRIEF = """
A short, realistic 360-degree turnaround of the real person in the first frame, filmed to show their new haircut from every side.

THE MOTION: the person turns on the spot through one full circle at a steady, unhurried speed, as if standing on a slowly rotating turntable - from facing the camera, to their left profile, to the back of their head, to their right profile, and back to facing the camera. The camera stays still at head height: no camera movement, no zoom, no cuts. One continuous shot.

THE PERSON: the same real person as in the first frame, from the first frame to the last. Keep their face, identity, facial features and proportions, skin tone and texture, expression, facial hair, apparent age, body, clothing and accessories exactly as they are in the first frame. When the face comes back round to the camera it must be the identical face, not a similar one.

THE HAIRCUT: {hairstyle}.{description} It is the haircut already visible in the first frame, and it stays exactly that haircut all the way round: the same length, shape, parting, texture, fade or taper height and colour. The sides and back continue the cut the way a barber would, consistent with the front and blending naturally into the nape. The hair moves only slightly and naturally as the head turns.

THE SCENE: keep the background, lighting and colour of the first frame. Photorealistic: natural skin, real hair with individual strands, true-to-life motion. No text, captions, logos, watermarks, visual effects, extra people, hats, hands or anything covering the hair.
""".strip()


def build_turnaround_prompt(request: HairstyleRequest) -> str:
    name = sanitize_text(request.name, MAX_NAME_LENGTH)
    if not name:
        raise VideoGenerationError(
            "invalid_hairstyle", "A hairstyle name is required to generate a video.", status=422
        )
    description = sanitize_text(request.description, MAX_DESCRIPTION_LENGTH)
    return _TURNAROUND_BRIEF.replace("{hairstyle}", name).replace(
        "{description}", f" What that haircut looks like: {description}" if description else ""
    )


# ─────────────────────────────────────────────────────────────────────────────
# THE JOB
# ─────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class TurnaroundJob:
    job_id: str
    status: str
    model: VideoModel
    #: The edited still the video starts from, as JPEG base64 — a poster for
    #: the player and a thumbnail for history, the moment the job is accepted.
    poster_b64: str
    poster_mime_type: str
    image_model: str
    aspect_ratio: str | None


@dataclass(frozen=True)
class TurnaroundStatus:
    job_id: str
    #: 'processing', 'completed' or 'failed' — upstream's states, folded.
    status: str
    error_code: str = ""
    error_message: str = ""


def start_turnaround(
    photo: NormalizedImage,
    request: HairstyleRequest,
    *,
    model_id: str | None = None,
) -> TurnaroundJob:
    """Render the haircut on the photo, then start the turnaround video from it.

    Synchronous for the first step (the image edit, 20-60 s) and returns as
    soon as the video job is accepted upstream; the video itself is polled.
    The model is resolved first, so a bad selection costs nothing.
    """
    model = resolve_model(model_id)
    prompt = build_turnaround_prompt(request)

    still = generate_hairstyle_image(photo, request)
    aspect_ratio = choose_aspect_ratio(model.aspect_ratios, photo.width, photo.height)
    frame, _, _ = fit_frame(base64.b64decode(still.image_b64), aspect_ratio)
    frame_url = f"data:image/jpeg;base64,{base64.b64encode(frame).decode('ascii')}"

    body: dict[str, object] = {
        "model": model.id,
        "prompt": prompt,
        "duration": model.duration,
        "frame_images": [
            {"type": "image_url", "image_url": {"url": frame_url}, "frame_type": "first_frame"}
        ],
        "generate_audio": False,
    }
    if model.resolution:
        body["resolution"] = model.resolution
    if aspect_ratio:
        body["aspect_ratio"] = aspect_ratio

    client = openrouter.make_client(openrouter.VIDEO_TIMEOUT)
    try:
        payload = _submit(client, body)
    except Exception as exc:  # noqa: BLE001 - mapped to a client-safe error
        raise _translate(exc, action="start the video") from exc

    job_id = payload.get("id") if isinstance(payload, dict) else None
    if not isinstance(job_id, str) or not _JOB_ID.match(job_id):
        logger.error("Video provider accepted the job but returned no usable id: %r", payload)
        raise VideoGenerationError("video_failed", "The video could not be started. Try again.", status=502)

    logger.info(
        "Started a %ss %s turnaround of %r with %s (%s) as job %s",
        model.duration, model.resolution or "default", request.name, model.id, aspect_ratio or "auto", job_id,
    )
    return TurnaroundJob(
        job_id=job_id,
        status=_fold_status(payload.get("status")) if isinstance(payload, dict) else "processing",
        model=model,
        poster_b64=base64.b64encode(frame).decode("ascii"),
        poster_mime_type="image/jpeg",
        image_model=still.model,
        aspect_ratio=aspect_ratio,
    )


def get_turnaround(job_id: str) -> TurnaroundStatus:
    """Where the job is. Cheap: one GET upstream."""
    _check_job_id(job_id)
    _require_key()
    client = openrouter.make_client(openrouter.VIDEO_TIMEOUT)
    try:
        payload = client.get(f"/videos/{job_id}", cast_to=object)
    except Exception as exc:  # noqa: BLE001 - mapped to a client-safe error
        raise _translate(exc, action="check on the video") from exc

    raw = payload if isinstance(payload, dict) else {}
    status = _fold_status(raw.get("status"))
    if status != "failed":
        return TurnaroundStatus(job_id=job_id, status=status)

    reason = str(raw.get("error") or "").strip()
    logger.warning("Video job %s failed upstream: %s", job_id, reason or raw.get("status"))
    if _looks_like_moderation(reason):
        return TurnaroundStatus(
            job_id, "failed", "content_blocked",
            "The video service would not process this photo or style. Try a different photo.",
        )
    return TurnaroundStatus(job_id, "failed", "video_failed", "The 360° video could not be made. Try again.")


def download_turnaround(job_id: str) -> tuple[bytes, str]:
    """The finished clip's bytes and content type."""
    _check_job_id(job_id)
    _require_key()
    client = openrouter.make_client(openrouter.VIDEO_TIMEOUT)
    try:
        response = client.get(f"/videos/{job_id}/content?index=0", cast_to=httpx.Response)
    except Exception as exc:  # noqa: BLE001 - mapped to a client-safe error
        raise _translate(exc, action="download the video") from exc

    content = response.content
    if not content:
        raise VideoGenerationError("empty_result", "The video service returned no video. Try again.", status=502)
    if len(content) > MAX_VIDEO_BYTES:
        logger.error("Video job %s returned %s bytes; refusing to pass it on.", job_id, len(content))
        raise VideoGenerationError("video_failed", "The video came back too large to deliver.", status=502)
    content_type = (response.headers.get("content-type") or "video/mp4").split(";")[0].strip()
    if not content_type.startswith("video/"):
        content_type = "video/mp4"
    return content, content_type


# ─────────────────────────────────────────────────────────────────────────────
# PLUMBING
# ─────────────────────────────────────────────────────────────────────────────
def _submit(client: OpenAI, body: dict[str, object]) -> object:
    """POST the job, retrying once without any rendering hint the model refuses."""
    try:
        return client.post("/videos", body=body, cast_to=object)
    except BadRequestError as exc:
        text = str(exc).lower()
        dropped = [name for name in _OPTIONAL_PARAMS if name in body and name in text]
        if not dropped:
            raise
        logger.warning("Model %r rejected %s; retrying without it.", body.get("model"), ", ".join(dropped))
        return client.post("/videos", body={k: v for k, v in body.items() if k not in dropped}, cast_to=object)


def _fold_status(value: object) -> str:
    state = str(value or "").strip().lower()
    if state == "completed":
        return "completed"
    if state in _FAILED_STATES:
        return "failed"
    return "processing"


def _check_job_id(job_id: str) -> None:
    if not _JOB_ID.match(job_id or ""):
        raise VideoGenerationError("video_not_found", "No such video.", status=404)


def _require_key() -> None:
    if not openrouter.has_api_key():
        logger.error("OPENROUTER_API_KEY is not set; refusing to call the video API.")
        raise VideoGenerationError(
            "provider_unconfigured", "Video generation is not configured on the server.", status=503
        )


def _looks_like_moderation(text: str) -> bool:
    text = text.lower()
    return any(word in text for word in ("moderation", "safety", "policy", "nsfw", "blocked"))


def _translate(exc: Exception, *, action: str) -> VideoGenerationError:
    """An SDK exception raised against OpenRouter, as something a client can act on."""
    if isinstance(exc, VideoGenerationError):
        return exc
    if isinstance(exc, (AuthenticationError, PermissionDeniedError)):
        logger.error("Video provider rejected our credentials while trying to %s: %s", action, exc)
        return VideoGenerationError(
            "provider_unconfigured", "Video generation is not configured on the server.", status=503
        )
    if isinstance(exc, RateLimitError):
        logger.warning("Video provider rate limit hit while trying to %s: %s", action, exc)
        return VideoGenerationError(
            "rate_limited", "The video service is busy right now. Try again in a moment.", status=429
        )
    if isinstance(exc, APITimeoutError):
        logger.warning("Timed out trying to %s.", action)
        return VideoGenerationError("provider_timeout", "The video service took too long. Try again.", status=504)
    if isinstance(exc, APIConnectionError):
        logger.error("Could not reach the video provider to %s: %s", action, exc)
        return VideoGenerationError(
            "provider_unreachable", "The video service could not be reached. Try again shortly.", status=502
        )
    if isinstance(exc, NotFoundError):
        return VideoGenerationError("video_not_found", "No such video.", status=404)
    if isinstance(exc, BadRequestError):
        text = str(exc).lower()
        if _looks_like_moderation(text):
            return VideoGenerationError(
                "content_blocked",
                "The video service would not process this photo or style. Try a different photo.",
                status=422,
            )
        if "model" in text and any(
            phrase in text for phrase in ("not found", "does not exist", "no endpoints", "no allowed providers")
        ):
            logger.error("Configured video model is unavailable: %s", exc)
            return VideoGenerationError(
                "model_unavailable",
                "The selected video model is not available. Choose another in the admin settings.",
                status=503,
            )
        logger.error("Video provider refused the request to %s: %s", action, exc)
        return VideoGenerationError("video_failed", "The 360° video could not be made. Try again.", status=422)
    if isinstance(exc, APIStatusError) and exc.status_code == 402:
        logger.error("OpenRouter account is out of credit; cannot %s.", action)
        return VideoGenerationError(
            "provider_unconfigured", "Video generation is not available right now.", status=503
        )
    logger.exception("Unexpected failure trying to %s", action)
    return VideoGenerationError("video_failed", "The 360° video could not be made. Try again.", status=502)
