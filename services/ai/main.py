from __future__ import annotations

import logging
import os
import socket
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import APIConnectionError, APITimeoutError, AuthenticationError, PermissionDeniedError, RateLimitError
from starlette.concurrency import run_in_threadpool

import openrouter
from hair_code import analyze, enrich_analysis_with_tutorials, summarize_for_client
from hair_generate import (
    IMAGE_MODEL,
    HairstyleRequest,
    ImageGenerationError,
    generate_hairstyle_image,
)
from image_io import ImageValidationError, guess_suffix, normalize_upload


logger = logging.getLogger("main")

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024

#: How much of the customer's photo each endpoint actually needs. The vision
#: model tops out well below 1024px, so analysing larger only buys tokens. The
#: image edit is the opposite: the more of the face the model is given at 1536,
#: the better it holds the hairline and skin detail through the edit.
ANALYSIS_MAX_EDGE = int(os.getenv("ANALYSIS_INPUT_MAX_EDGE", "1024"))
GENERATION_MAX_EDGE = int(os.getenv("GENERATION_INPUT_MAX_EDGE", "1536"))

#: The ring the 360 capture walks the customer around. Sent as a CSV alongside
#: the photographs so each image can be named to the model; anything else is
#: dropped rather than passed through into a prompt.
HEAD_ANGLES = (
    "front", "front_left", "left", "back_left",
    "back", "back_right", "right", "front_right",
)

#: At most eight photographs of one head. The cap is about cost and latency —
#: every extra angle is more vision tokens on a call the customer waits for.
MAX_ANGLE_IMAGES = int(os.getenv("MAX_ANGLE_IMAGES", "8"))

Gender = Literal["male", "female", "unspecified"]
HairLength = Literal["short", "medium", "long", "extra long", "unknown"]
Occasion = Literal["casual", "formal", "wedding", "party", "business", "date", "everyday"]

#: The frontend calls this service straight from the browser, so the dev origins
#: are allowed out of the box. Deployments set CORS_ORIGINS explicitly — `*` is
#: never used, because these requests carry customer photos.
DEFAULT_CORS_ORIGINS = (
    "http://localhost:5174,http://127.0.0.1:5174,"
    "http://localhost:4174,http://127.0.0.1:4174"
)


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


def _get_local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def _log_startup_banner() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    env = os.getenv("APP_ENV", "development")
    local_ip = _get_local_ip()
    docs_url = f"http://localhost:{port}/docs"
    lan_url = f"http://{local_ip}:{port}/docs"
    tailscale_host = os.getenv("TAILSCALE_HOST")
    tailscale_url = os.getenv("TAILSCALE_URL")

    logger.info("🚀 Hair AI API starting | env=%s", env)
    logger.info("%s", "=" * 78)
    logger.info("API Docs: http://%s:%s/docs", host, port)
    logger.info("Local:  http://localhost:%s/ | Docs: %s", port, docs_url)
    logger.info("LAN:    http://%s:%s/ | Docs: %s", local_ip, port, lan_url)
    if tailscale_url:
        logger.info("Tailscale: %s | Docs: %s", tailscale_url, tailscale_url.rstrip("/") + "/docs")
    elif tailscale_host:
        logger.info(
            "Tailscale: http://%s:%s/ | Docs: http://%s:%s/docs",
            tailscale_host,
            port,
            tailscale_host,
            port,
        )
    logger.info(
        "Provider: OpenRouter (%s) | Analysis model: %s | Image model: %s",
        openrouter.BASE_URL,
        openrouter.ANALYSIS_MODEL,
        IMAGE_MODEL,
    )
    if not openrouter.has_api_key():
        logger.warning("OPENROUTER_API_KEY is not set — /analyze and /generate will fail.")
    logger.info("Share the LAN URL with teammates on the same network.")
    logger.info("%s", "=" * 78)


def _parse_csv_env(name: str, default: str = "") -> list[str]:
    value = os.getenv(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


def _angles(raw: str, count: int) -> list[str]:
    """The CSV of angle ids, lined up with the photographs that came with it.

    A label we do not recognise becomes "" rather than an error: the analysis is
    still worth running on an unlabelled photo, and an unknown string has no
    business reaching a prompt.
    """
    given = [part.strip().lower() for part in (raw or "").split(",") if part.strip()]
    named = [angle if angle in HEAD_ANGLES else "" for angle in given[:count]]
    return named + [""] * (count - len(named))


def _error(status: int, code: str, message: str) -> HTTPException:
    """One error shape for every failure: `{"detail": {"code", "message"}}`."""
    return HTTPException(status_code=status, detail={"code": code, "message": message})


@asynccontextmanager
async def lifespan(_: FastAPI):
    _configure_logging()
    _log_startup_banner()
    yield


app = FastAPI(
    title="Hair AI Analysis API",
    version="2.0.0",
    description=(
        "Face and hair analysis plus AI hairstyle try-on. `POST /analyze` reads a "
        "customer photo and recommends hairstyles; `POST /generate` edits that same "
        "photo so the customer is wearing one of them."
    ),
    lifespan=lifespan,
)

allowed_origins = _parse_csv_env("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
allowed_origin_regex = os.getenv("CORS_ORIGIN_REGEX") or None
if allowed_origins or allowed_origin_regex:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=allowed_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# ─────────────────────────────────────────────────────────────────────────────
# SHARED UPLOAD HANDLING
# ─────────────────────────────────────────────────────────────────────────────
async def _read_photo(image: UploadFile, *, max_edge: int = ANALYSIS_MAX_EDGE):
    """Validate one uploaded photo and hand back normalised bytes.

    Both endpoints take the customer's photo, so both get the same treatment:
    an extension we recognise, a size cap, and a real decode (which is what
    actually proves the file is an image) with EXIF rotation applied.
    """
    if not guess_suffix(image.filename, image.content_type):
        raise _error(
            400,
            "unsupported_type",
            "Unsupported image type. Use jpg, jpeg, png, webp or gif.",
        )

    contents = await image.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise _error(
            413,
            "image_too_large",
            f"That image is too large. The limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )
    if not contents:
        raise _error(400, "empty_image", "The uploaded image is empty.")

    try:
        return await run_in_threadpool(lambda: normalize_upload(contents, max_edge=max_edge))
    except ImageValidationError as exc:
        raise _error(400, exc.code, exc.message) from exc


def _provider_failure(exc: Exception) -> HTTPException:
    """Map an OpenAI-SDK exception (raised against OpenRouter) to a client status."""
    if isinstance(exc, (AuthenticationError, PermissionDeniedError)):
        logger.error("Analysis provider rejected our credentials: %s", exc)
        return _error(503, "provider_unconfigured", "AI analysis is not configured on the server.")
    if isinstance(exc, RateLimitError):
        logger.warning("Analysis provider rate limit hit: %s", exc)
        return _error(429, "rate_limited", "The AI service is busy right now. Try again in a moment.")
    if isinstance(exc, APITimeoutError):
        logger.warning("Analysis timed out: %s", exc)
        return _error(504, "provider_timeout", "The analysis took too long. Try again.")
    if isinstance(exc, APIConnectionError):
        logger.error("Could not reach the analysis provider: %s", exc)
        return _error(502, "provider_unreachable", "The AI service could not be reached. Try again shortly.")
    logger.error("Analysis failed: %s", exc)
    return _error(502, "analysis_failed", "AI analysis failed. Please try again shortly.")


# ─────────────────────────────────────────────────────────────────────────────
# SYSTEM
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/", tags=["system"])
def root() -> dict[str, Any]:
    return {
        "service": "Hair AI Analysis API",
        "docs": "/docs",
        "openapi": "/openapi.json",
        "swagger": "/swagger.json",
        "endpoints": ["POST /analyze", "POST /generate"],
    }


@app.get("/health", tags=["system"])
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        # Configured, not necessarily resolved: an analysis model the account
        # cannot reach is swapped for a working one at request time.
        "analysis_model_configured": openrouter.ANALYSIS_MODEL,
        "image_model": IMAGE_MODEL,
        # Says whether a key is present, never anything about the key itself.
        "provider_configured": openrouter.has_api_key(),
    }


@app.get("/swagger.json", include_in_schema=False)
def swagger_json() -> dict[str, Any]:
    return app.openapi()


# ─────────────────────────────────────────────────────────────────────────────
# ANALYSIS
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/analyze", tags=["analysis"])
async def analyze_image(
    image: UploadFile = File(...),
    gender: Gender = Form(...),
    hair_length: HairLength = Form(...),
    occasion: Occasion = Form(...),
    # A 360 capture sends the rest of the ring here and names every photograph
    # in `angles`. Left out, this is the single-photo read it has always been.
    extra_images: list[UploadFile] = File([]),
    angles: str = Form(""),
) -> dict[str, Any]:
    """Read a customer photo — or several angles of one head — and recommend
    hairstyles.

    Returns the model's full analysis under `analysis`, plus the normalised
    `recommendations` / `profile` / `summary` the client actually renders. Each
    recommendation carries a stable `id` to send back to `/generate`.
    """
    uploads = [image] + [extra for extra in (extra_images or []) if extra and extra.filename]
    if len(uploads) > MAX_ANGLE_IMAGES:
        raise _error(
            400,
            "too_many_images",
            f"Send at most {MAX_ANGLE_IMAGES} photographs of one head.",
        )
    photos = [await _read_photo(upload) for upload in uploads]
    labels = _angles(angles, len(photos))

    temp_paths: list[Path] = []
    try:
        for photo in photos:
            with tempfile.NamedTemporaryFile(delete=False, suffix=photo.suffix) as temp_file:
                temp_paths.append(Path(temp_file.name))
                temp_file.write(photo.data)

        normalized_hair_length = hair_length.replace(" ", "_")
        # analyze() / enrich_analysis_with_tutorials() are synchronous and do
        # blocking network I/O (OpenRouter + YouTube) — run off the event loop so
        # one slow request doesn't stall every other concurrent request.
        result = await run_in_threadpool(
            lambda: enrich_analysis_with_tutorials(
                analyze(temp_paths, gender, normalized_hair_length, occasion, labels)
            )
        )
        client_view = summarize_for_client(result)
        if not client_view["recommendations"]:
            logger.error("Analysis returned no usable hairstyle recommendations.")
            raise _error(
                502,
                "no_recommendations",
                "The AI did not suggest any hairstyles for that photo. Try a clearer photo.",
            )

        return {
            "analysis": result,
            "recommendations": client_view["recommendations"],
            "profile": client_view["profile"],
            "summary": client_view["summary"],
            "meta": {
                "filename": image.filename,
                "content_type": image.content_type,
                "gender": gender,
                "hair_length": hair_length,
                "occasion": occasion,
                "model": (result.get("_meta") or {}).get("model"),
                # What the reading was actually based on, so a client can say
                # "read from 8 angles" rather than implying it.
                "image_count": len(photos),
                "angles": [angle for angle in labels if angle],
            },
        }

    except HTTPException:
        raise
    except (RuntimeError, FileNotFoundError, ValueError) as exc:
        # Known, expected failure modes (missing key, bad image, invalid model
        # config, model returned non-JSON).
        raise _provider_failure(exc) from exc
    except Exception as exc:
        if exc.__class__.__module__.startswith("openai"):
            raise _provider_failure(exc) from exc
        logger.exception("Unexpected error during image analysis")
        raise _error(500, "internal_error", "Internal server error.") from None
    finally:
        for temp_path in temp_paths:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    logger.warning("Failed to remove temp file %s", temp_path)


# ─────────────────────────────────────────────────────────────────────────────
# GENERATION
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/generate", tags=["generation"])
async def generate_image(
    image: UploadFile = File(...),
    hairstyle_name: str = Form(..., max_length=120),
    hairstyle_description: str = Form("", max_length=600),
    hairstyle_id: str = Form("", max_length=80),
    gender: Gender | None = Form(None),
    hair_length: HairLength | None = Form(None),
    occasion: Occasion | None = Form(None),
    face_shape: str = Form("", max_length=60),
    hair_texture: str = Form("", max_length=60),
    hair_color: str = Form("", max_length=60),
    # What `/analyze` saw on the head. Optional, and the render is markedly
    # more honest with them: they are what keeps the cut under the length
    # that actually exists.
    hair_length_observed: str = Form("", max_length=200),
    current_hairstyle: str = Form("", max_length=200),
    hairline: str = Form("", max_length=200),
    hair_density: str = Form("", max_length=60),
    beard_style: str = Form("", max_length=60),
    # The photo's length bucket and the bucket the style needs. Both known
    # and the style needing more is a 422 `needs_more_length` before any
    # model is called: a cut cannot add hair, so the render is never asked to.
    hair_length_category: str = Form("", max_length=20),
    style_length: str = Form("", max_length=20),
    # A 360 render says which view this photograph is, and sends the front
    # render back as `style_reference` so every angle matches one haircut.
    angle: str = Form("", max_length=20),
    style_reference: UploadFile | None = File(None),
) -> dict[str, Any]:
    """Edit the customer's photo so they are wearing the chosen hairstyle.

    The photo never leaves memory here: it is validated, sent to the image model
    and returned as base64 in the response. Nothing is written to disk or kept.
    """
    photo = await _read_photo(image, max_edge=GENERATION_MAX_EDGE)
    reference = (
        await _read_photo(style_reference, max_edge=GENERATION_MAX_EDGE)
        if style_reference is not None and style_reference.filename
        else None
    )
    view = _angles(angle, 1)[0]

    request = HairstyleRequest(
        name=hairstyle_name,
        description=hairstyle_description,
        hairstyle_id=hairstyle_id,
        gender="" if gender in (None, "unspecified") else gender,
        hair_length="" if hair_length in (None, "unknown") else hair_length,
        occasion=occasion or "",
        face_shape=face_shape,
        hair_texture=hair_texture,
        hair_color=hair_color,
        hair_length_observed=hair_length_observed,
        current_hairstyle=current_hairstyle,
        hairline=hairline,
        hair_density=hair_density,
        beard_style=beard_style,
        hair_length_category=hair_length_category,
        style_length=style_length,
        angle=view,
    )

    try:
        result = await run_in_threadpool(
            lambda: generate_hairstyle_image(photo, request, style_reference=reference)
        )
    except ImageGenerationError as exc:
        raise _error(exc.status, exc.code, exc.message) from exc
    except Exception:
        logger.exception("Unexpected error during hairstyle generation")
        raise _error(500, "internal_error", "Internal server error.") from None

    return {
        "hairstyle": {
            "id": hairstyle_id,
            "name": request.name.strip()[:120],
            "description": request.description.strip()[:600],
        },
        "image": {
            "b64": result.image_b64,
            "mime_type": result.mime_type,
            "size": result.size,
        },
        "meta": {
            "model": result.model,
            "latency_ms": result.latency_ms,
            "source_width": photo.width,
            "source_height": photo.height,
            "angle": view,
            "matched_to_reference": reference is not None,
        },
    }


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=os.getenv("RELOAD", "false").lower() == "true")
