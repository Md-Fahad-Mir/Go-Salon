"""Hairstyle try-on image generation.

`hair_code` reads a photo and says what would suit the person; this module takes
the photo back plus one chosen hairstyle and returns a picture of *that same
person* wearing it. It edits the customer's own photo rather than generating a
new one, because the product promise is "you with this cut", not "someone with
this cut".

Provider: OpenRouter's image API (`POST /api/v1/images`), which takes the source
photo as an `input_references` entry rather than as a multipart upload. There is
no `input_fidelity` knob on OpenRouter, so keeping the face recognisable rests on
the model: `google/gemini-3.1-flash-image` edits the photo it is handed instead
of re-generating from it, which is what this product needs.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import re
import time
from dataclasses import dataclass, field

from dotenv import load_dotenv
from openai import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    OpenAI,
    PermissionDeniedError,
    RateLimitError,
)

from PIL import Image

import openrouter
from image_io import NormalizedImage

load_dotenv()

logger = logging.getLogger(__name__)

#: Image model, namespaced provider/model as OpenRouter requires. Must be one
#: that accepts image input — an output-only image model cannot edit a photo.
IMAGE_MODEL = openrouter.IMAGE_MODEL
IMAGE_QUALITY = os.getenv("OPENROUTER_IMAGE_QUALITY", "medium")  # low | medium | high | auto
IMAGE_OUTPUT_FORMAT = os.getenv("OPENROUTER_IMAGE_OUTPUT_FORMAT", "jpeg")  # jpeg | png | webp
IMAGE_OUTPUT_COMPRESSION = int(os.getenv("OPENROUTER_IMAGE_OUTPUT_COMPRESSION", "90"))
IMAGE_TIMEOUT = openrouter.IMAGE_TIMEOUT

#: OpenRouter's image endpoint. Relative to the configured base URL, so the SDK
#: client's auth, retries, timeout and exception mapping all still apply.
_IMAGES_PATH = "/images"

#: Not every image model on OpenRouter honours every rendering hint, and an
#: unknown one comes back as a 400. These are the ones we can drop and still
#: deliver a render, so a rejection retries without them instead of failing.
_OPTIONAL_PARAMS = ("quality", "output_format", "output_compression", "aspect_ratio")

_OUTPUT_MIME = {"jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}

#: Rendered shapes. Matching the customer's framing keeps the before/after
#: comparison honest instead of cropping their photo. OpenRouter takes these as
#: an `aspect_ratio`, so each shape carries the ratio it is requested by.
_SIZE_SQUARE = "1024x1024"
_SIZE_LANDSCAPE = "1536x1024"
_SIZE_PORTRAIT = "1024x1536"

_ASPECT_RATIOS = {_SIZE_SQUARE: "1:1", _SIZE_LANDSCAPE: "3:2", _SIZE_PORTRAIT: "2:3"}

#: Length buckets, shortest first. The analysis reports the hair in the photo
#: as one of the five; a catalogue style declares which of the three it needs.
#: A style whose bucket sits above the photo's cannot be cut from that hair.
_LENGTH_RANK = {"very_short": 0, "short": 0, "medium": 1, "long": 2, "extra_long": 2}

MAX_NAME_LENGTH = 80
MAX_DESCRIPTION_LENGTH = 400
MAX_CONTEXT_LENGTH = 60
#: Room for a sentence like "~4 cm on top, tapered to ~1 cm at the sides".
MAX_OBSERVATION_LENGTH = 160


#: How each captured viewpoint is described to the image model. Same ids as the
#: analysis and the frontend, so one angle is one word everywhere.
_ANGLE_VIEWS = {
    "front": "from directly in front",
    "front_left": "from the front-left, a three-quarter view",
    "left": "from the left-hand side, in profile",
    "back_left": "from behind and to the left",
    "back": "from directly behind - this is the back of the head",
    "back_right": "from behind and to the right",
    "right": "from the right-hand side, in profile",
    "front_right": "from the front-right, a three-quarter view",
}

#: Views with no face in them. Saying so matters: told to preserve a face it
#: cannot see, a model will helpfully rotate the head until there is one.
_FACELESS_VIEWS = {"back", "back_left", "back_right"}


class ImageGenerationError(RuntimeError):
    """A generation failure with a client-safe message and HTTP status.

    Provider errors are deliberately flattened here: the caller gets a code it
    can branch on and a sentence it can show, never the raw provider payload.
    """

    def __init__(self, code: str, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass(frozen=True)
class HairstyleRequest:
    """The chosen style plus whatever the analysis knows about the customer."""

    name: str
    description: str = ""
    hairstyle_id: str = ""
    gender: str = ""
    hair_length: str = ""
    occasion: str = ""
    face_shape: str = ""
    hair_texture: str = ""
    hair_color: str = ""
    #: What the analysis saw on the head today. These set the ceiling the cut
    #: has to stay under, so they matter more to the render than anything else
    #: the analysis knows.
    hair_length_observed: str = ""
    current_hairstyle: str = ""
    hairline: str = ""
    hair_density: str = ""
    beard_style: str = ""
    #: The photo's length bucket (from `/analyze`) and the bucket the chosen
    #: style needs (from the catalogue). When both are known and the style
    #: needs more, the request is refused before any model sees it — see
    #: `check_length_feasible`. Either missing means nothing can be judged.
    hair_length_category: str = ""
    style_length: str = ""
    #: Which of the eight views this photograph is, for a 360 render. Empty for
    #: the ordinary single-photo try-on, which is always a front view.
    angle: str = ""


@dataclass
class GenerationResult:
    image_b64: str
    mime_type: str
    size: str
    model: str
    latency_ms: int
    prompt_used: str = field(repr=False, default="")


# ─────────────────────────────────────────────────────────────────────────────
# INPUT SANITISATION
# ─────────────────────────────────────────────────────────────────────────────
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_WHITESPACE = re.compile(r"\s+")


def sanitize_text(value: str | None, max_length: int) -> str:
    """Flatten a client-supplied string into one short, single-line phrase.

    The hairstyle name and description are echoed into the image prompt, so they
    are treated as untrusted: control characters and newlines go (they are what
    lets injected text pose as a new instruction block), and the length is
    capped so no single field can dominate the prompt.
    """
    if not value:
        return ""
    cleaned = _CONTROL_CHARS.sub(" ", value)
    cleaned = _WHITESPACE.sub(" ", cleaned).strip()
    return cleaned[:max_length].strip()


# ─────────────────────────────────────────────────────────────────────────────
# PROMPT
# ─────────────────────────────────────────────────────────────────────────────
#: The edit brief. `{hairstyle}` is substituted with the sanitised style name.
#:
#: Written as a retouching job rather than a generation job, and weighted towards
#: *how hair physically sits on a head* — hairline, graduation, scalp show-through,
#: light direction, an irregular perimeter. Prohibitions alone produced hair that
#: obeyed every rule and still read as a wig, because "do not look fake" does not
#: tell a model what real hair does.
#:
#: The customer-supplied slots sit near the top and the rules run underneath, so
#: the last thing the model reads is always ours.
#:
#: The brief is worded as a haircut, not a replacement. "Replace the hair with X"
#: licensed the model to paint on whatever X needs — including length the person
#: does not have. A barber cuts from what is there, and so must the model.
_EDIT_BRIEF = """
PHOTO RETOUCH BRIEF - A HAIRCUT ON THIS PERSON'S OWN HAIR

This is a real photograph of a real person. Retouch it. Do not generate a new
image, a new person, or a new interpretation of this person.

THE ONE PERMITTED CHANGE: give this person a {hairstyle}, cut from the hair
that is already on their head in this photograph.
""".strip()

#: The constraint the whole product rests on, and the first rule the model reads:
#: a haircut can only take hair away. Stated physically - a ceiling on length, a
#: hairline that stays put, density that stays what it is - because "be
#: realistic" gives the model nothing to check against.
_CUT_ONLY_RULES = """
## A HAIRCUT ONLY REMOVES HAIR

A barber can shorten, thin out, taper, fade, reshape and restyle the hair that
is there. A barber cannot add hair. The hair visible in this photograph is the
absolute maximum the result may contain:

- No hair in the result may be longer than it is in the photograph - anywhere on the head. The new cut is the same length or shorter, everywhere.
- Do not add hair, thickness, density, volume or coverage the photograph does not show. Thin hair stays thin. Short sides stay short or go shorter.
- Keep this person's hairline exactly where it is, including any recession, high temples, thinning or bald areas. Do not lower it, fill it in, thicken it or hide it - unless hair that already exists is simply combed over it.
- If the requested {hairstyle} normally needs more length than this person has, produce the version of it that THIS hair can give at its current length - the same shape and character, cut shorter - rather than inventing the missing length.
- Keep the hair's natural texture (straight, wavy, curly, coily). Styling it - combing, parting, texturising, a little product - is allowed; changing what the hair is, is not.

The result must be something this person could walk out of a barber's chair with today, without growing, adding or transplanting any hair.
""".strip()

_EDIT_RULES = """
## HOW THE NEW HAIR MUST SIT ON THIS HEAD

Cut the new style onto the head that is already in the photograph:

- Start from this person's own hairline, temples, cowlick and crown. The cut follows their skull shape and forehead; it is never a template dropped on top.
- Graduate lengths the way a barber would, with a genuine blend between the short and long sections rather than a sudden step.
- Where the hair is cut very short, let the scalp show faintly through it, as real short hair does.
- Keep the density, coarseness and natural growth direction of this person's own hair.
- The perimeter must be made of individual strands with a slightly irregular edge - never a smooth painted outline, a solid silhouette or a wig cap sitting on the skin.
- Let a few loose strands break the outline, as real hair does.
- Allow slight natural asymmetry. Real haircuts are not mirror-perfect.
- The hair takes the same key light as the face: same direction, same softness, same colour temperature, with highlights only where that light would fall.
- It casts the same kind of soft contact shadow onto the forehead, temples and ears that real hair casts.
- Match the person's existing hair colour, including its natural variation and roots, unless the requested hairstyle explicitly names a different colour.

## WHAT MUST NOT CHANGE

Everything except the hair stays exactly as photographed: face shape and proportions, eyes, eyebrows, nose, lips, mouth, ears, jawline, cheekbones, chin, forehead, skin tone and texture, facial hair and beard, expression, apparent age, head and body position, clothing, accessories, background, camera angle and perspective, framing, lighting, shadows, exposure and colour balance.

Do not add, remove or alter any object. Do not add another person. Do not change the person's gender, build or appearance. The face must remain visually identical to the input.

## PHOTOGRAPHIC MATCH

The output must keep the photographic character of the original: the same lens rendering, depth of field, sharpness and softness, sensor noise and grain, white balance and micro-contrast.

Keep skin exactly as photographed - pores, stubble shadow, blemishes, shine, lines and catchlights all stay. Do not smooth, clean up, even out, slim, sharpen or relight the face. Do not raise contrast or saturation.

## FAILURE MODES - REJECT THESE

Do not produce: hair that is longer, fuller or denser anywhere than in the input; a hairline that has been lowered, filled in or restored; a wig or helmet of hair sitting on the head; hair pasted over the forehead with a hard cut-out edge; a smooth painted hair silhouette; plastic, waxy or over-smoothed skin; a beauty-filter or portrait-mode look; a cinematic regrade; an illustration, painting, 3D render or CGI face; exaggerated volume; a face that belongs to someone else.

## MINIMAL EDIT

Change the hair region and the few pixels where hair meets skin. Everything else in the frame must come through untouched. If a pixel does not need to change to deliver the haircut, do not change it.

The result must be indistinguishable from a photograph taken of this same person, with this same camera, in this same light, immediately after a barber cut a {hairstyle} from the hair they walked in with.
""".strip()


def check_length_feasible(request: HairstyleRequest) -> None:
    """Refuse a style that needs more hair than the photo shows.

    The prompt tells the model a haircut only removes hair, and for a style
    that fits it obeys. But a style whose *name* says "shoulder-length" beats
    the rule: the model grows the hair anyway. The only reliable defence is to
    never send that request. Nothing is judged when either bucket is unknown —
    an AI recommendation carries no `style_length`, having already been vetted
    against the photo by the analysis.
    """
    have = _LENGTH_RANK.get(sanitize_text(request.hair_length_category, MAX_CONTEXT_LENGTH).lower())
    need = _LENGTH_RANK.get(sanitize_text(request.style_length, MAX_CONTEXT_LENGTH).lower())
    if have is None or need is None or need <= have:
        return
    logger.info(
        "Refusing %r: it needs %s hair and the photo shows %s.",
        request.name, request.style_length, request.hair_length_category,
    )
    raise ImageGenerationError(
        "needs_more_length",
        "That style needs more length than the hair in the photo. "
        "A barber cannot cut it from what is there today.",
        status=422,
    )


def build_angle_block(angle: str) -> str:
    """Pin the render to the viewpoint the photograph was taken from."""
    view = _ANGLE_VIEWS.get(angle)
    if not view:
        return ""
    lines = [
        "## THE VIEWPOINT OF THIS PHOTOGRAPH",
        "",
        f"This photograph shows the person {view}. Render the haircut as it looks "
        f"from exactly this viewpoint. Do not rotate, turn or re-pose the head, "
        f"and do not render a different view of it.",
    ]
    if angle in _FACELESS_VIEWS:
        lines.append(
            "No face is visible from here, and none should become visible. Do not "
            "add a face, do not turn the head towards the camera. The ears, the "
            "neckline and the nape are what this view is about - keep them where "
            "they are and cut around them."
        )
    return "\n".join(lines)


#: What makes eight separate renders read as one haircut. The second reference
#: is the front view this service has already produced, so every other angle is
#: matched to a picture of the finished cut rather than to a description of it —
#: which is the only reason the fade height agrees all the way round the head.
_STYLE_REFERENCE_BLOCK = """
## THE SECOND REFERENCE IMAGE - THE HAIRCUT TO MATCH

You have been given two reference images.

- The FIRST is the photograph you are editing. Its person, face, head position, viewpoint, lighting, background and clothing are what the result must keep.
- The SECOND is the SAME person, already wearing the exact haircut you must render, seen from the front.

Take the haircut from the second image and nothing else: the same length on top, the same fade or taper height and the same gradient, the same parting, the same texture and separation, the same perimeter and neckline. Match them as closely as the viewpoint allows.

Where this viewpoint shows part of the head the second image cannot, continue the cut the way a barber would: the fade wraps around the head at a consistent height, the sides blend into the back, and the top length carries over the crown without a step.

Do not copy the second image's viewpoint, pose, framing, lighting or background. Only the haircut.
""".strip()


def build_generation_prompt(request: HairstyleRequest, *, has_style_reference: bool = False) -> str:
    """Compose the edit instruction for one hairstyle try-on."""
    name = sanitize_text(request.name, MAX_NAME_LENGTH)
    if not name:
        raise ImageGenerationError(
            "invalid_hairstyle",
            "A hairstyle name is required to generate a preview.",
            status=422,
        )

    description = sanitize_text(request.description, MAX_DESCRIPTION_LENGTH)
    observed = sanitize_text(request.hair_length_observed, MAX_OBSERVATION_LENGTH)

    lines = [_EDIT_BRIEF.replace("{hairstyle}", name)]
    if observed and observed.lower() != "unknown":
        # The ceiling sits in the brief, beside the style name, not only in
        # the rules further down: the name is what the model weights most.
        lines.append(
            f"THE CEILING: the hair in this photograph is {observed}. Nothing in "
            f"the result may be longer than that, anywhere on the head."
        )
    if description:
        lines.append(f"WHAT THAT HAIRSTYLE LOOKS LIKE: {description}")

    context = [
        ("Person", sanitize_text(request.gender, MAX_CONTEXT_LENGTH)),
        # What is on the head now. The observed length is the ceiling the cut
        # must stay under; the requested hairstyle decides the shape beneath it.
        ("Hair in the photo today", sanitize_text(request.hair_length_observed, MAX_OBSERVATION_LENGTH)),
        ("Current cut", sanitize_text(request.current_hairstyle, MAX_OBSERVATION_LENGTH)),
        ("Hairline to keep as it is", sanitize_text(request.hairline, MAX_OBSERVATION_LENGTH)),
        ("Hair density", sanitize_text(request.hair_density, MAX_CONTEXT_LENGTH)),
        ("Natural hair texture", sanitize_text(request.hair_texture, MAX_CONTEXT_LENGTH)),
        ("Current hair colour to keep", sanitize_text(request.hair_color, MAX_CONTEXT_LENGTH)),
        ("Facial hair to keep", sanitize_text(request.beard_style, MAX_CONTEXT_LENGTH)),
        ("Hair length the customer stated", sanitize_text(request.hair_length, MAX_CONTEXT_LENGTH)),
        ("Face shape observed", sanitize_text(request.face_shape, MAX_CONTEXT_LENGTH)),
        ("Occasion the style is for", sanitize_text(request.occasion, MAX_CONTEXT_LENGTH)),
    ]
    known = [f"{label}: {value}" for label, value in context if value and value.lower() != "unknown"]
    if known:
        lines.append(
            "WHAT THIS PERSON HAS NOW, FROM THE FACE AND HAIR ANALYSIS - the hair "
            "in the photo sets the maximum length; the requested hairstyle decides "
            "the shape within it - " + "; ".join(known) + "."
        )

    angle_block = build_angle_block(sanitize_text(request.angle, MAX_CONTEXT_LENGTH).lower())
    if angle_block:
        lines += ["", angle_block]
    if has_style_reference:
        lines += ["", _STYLE_REFERENCE_BLOCK]
    lines += ["", _CUT_ONLY_RULES.replace("{hairstyle}", name), "", _EDIT_RULES.replace("{hairstyle}", name)]
    return "\n".join(lines)


def choose_size(image: NormalizedImage) -> str:
    """Pick the rendered shape closest to the customer's own framing."""
    ratio = image.aspect_ratio
    if ratio >= 1.2:
        return _SIZE_LANDSCAPE
    if ratio <= 0.84:
        return _SIZE_PORTRAIT
    return _SIZE_SQUARE


def _data_url(image: NormalizedImage) -> str:
    """The source photo as an inline data URL.

    OpenRouter takes reference images as URLs, and this photo is a customer's
    face: it is inlined rather than uploaded somewhere first, so it never exists
    anywhere but in this one request.
    """
    return f"data:{image.mime_type};base64,{base64.b64encode(image.data).decode('ascii')}"


# ─────────────────────────────────────────────────────────────────────────────
# GENERATION
# ─────────────────────────────────────────────────────────────────────────────
def generate_hairstyle_image(
    image: NormalizedImage,
    request: HairstyleRequest,
    *,
    model: str | None = None,
    style_reference: NormalizedImage | None = None,
) -> GenerationResult:
    """Render the customer's photo wearing `request.name`.

    `style_reference` is an already-rendered view of the same person wearing the
    same cut — the front one, in a 360 set. It goes in as a second reference so
    the other angles match a picture of the finished haircut instead of each
    re-interpreting the words for it.

    Raises `ImageGenerationError` for every failure mode, with a status the API
    layer can pass straight through.
    """
    if not openrouter.has_api_key():
        logger.error("OPENROUTER_API_KEY is not set; refusing to call the image API.")
        raise ImageGenerationError(
            "provider_unconfigured",
            "Image generation is not configured on the server.",
            status=503,
        )

    check_length_feasible(request)
    prompt = build_generation_prompt(request, has_style_reference=style_reference is not None)
    model_to_use = model or IMAGE_MODEL
    size = choose_size(image)
    client = openrouter.make_client(IMAGE_TIMEOUT)

    output_format = IMAGE_OUTPUT_FORMAT.lower()
    if output_format not in _OUTPUT_MIME:
        logger.warning("Unknown OPENROUTER_IMAGE_OUTPUT_FORMAT %r; falling back to jpeg.", output_format)
        output_format = "jpeg"

    params: dict[str, object] = {
        "model": model_to_use,
        "prompt": prompt,
        "n": 1,
        # The photo to edit, first. Everything the model changes, it changes
        # here; a second reference, when present, only says what the cut is.
        "input_references": [
            {"type": "image_url", "image_url": {"url": _data_url(reference)}}
            for reference in ([image, style_reference] if style_reference else [image])
        ],
        "aspect_ratio": _ASPECT_RATIOS[size],
        "quality": IMAGE_QUALITY,
        "output_format": output_format,
    }
    if output_format in {"jpeg", "webp"}:
        params["output_compression"] = max(0, min(100, IMAGE_OUTPUT_COMPRESSION))

    started = time.monotonic()
    try:
        payload = _call_images_edit(client, params)
    except (AuthenticationError, PermissionDeniedError) as exc:
        logger.error("Image provider rejected our credentials: %s", exc)
        raise ImageGenerationError(
            "provider_unconfigured",
            "Image generation is not configured on the server.",
            status=503,
        ) from exc
    except RateLimitError as exc:
        logger.warning("Image provider rate limit hit: %s", exc)
        raise ImageGenerationError(
            "rate_limited",
            "The image service is busy right now. Try again in a moment.",
            status=429,
        ) from exc
    except APITimeoutError as exc:
        logger.warning("Image generation timed out after %ss", IMAGE_TIMEOUT)
        raise ImageGenerationError(
            "provider_timeout",
            "Generating the preview took too long. Try again.",
            status=504,
        ) from exc
    except APIConnectionError as exc:
        logger.error("Could not reach the image provider: %s", exc)
        raise ImageGenerationError(
            "provider_unreachable",
            "The image service could not be reached. Try again shortly.",
            status=502,
        ) from exc
    except BadRequestError as exc:
        raise _translate_bad_request(exc) from exc
    except Exception as exc:  # noqa: BLE001 - provider SDKs raise broadly
        logger.exception("Unexpected failure calling the image provider")
        raise ImageGenerationError(
            "generation_failed",
            "The preview could not be generated. Try again.",
            status=502,
        ) from exc

    latency_ms = int((time.monotonic() - started) * 1000)
    first = _first_image(payload)
    b64 = first.get("b64_json") if first else None
    if not isinstance(b64, str) or not b64:
        logger.error("Image provider returned no image payload for model %r", model_to_use)
        raise ImageGenerationError(
            "empty_result",
            "The image service returned no picture. Try again.",
            status=502,
        )

    try:
        raw = base64.b64decode(b64, validate=True)
    except (ValueError, TypeError) as exc:
        logger.error("Image provider returned data that is not valid base64")
        raise ImageGenerationError(
            "malformed_result",
            "The generated image could not be read. Try again.",
            status=502,
        ) from exc

    # `output_format` is only a hint on OpenRouter and several image models
    # ignore it, so the bytes are conformed here instead. It matters: the same
    # render as a PNG is roughly ten times the base64 the browser downloads.
    b64, mime_type, rendered_size = _conform(raw, b64, output_format, str(first.get("media_type") or ""))
    rendered_size = rendered_size or size

    logger.info(
        "Generated %r%s with %s (%s, %s)%s in %sms",
        request.name,
        f" [{request.angle}]" if request.angle else "",
        model_to_use,
        rendered_size,
        IMAGE_QUALITY,
        " matched to the front render" if style_reference else "",
        latency_ms,
    )
    return GenerationResult(
        image_b64=b64,
        mime_type=str(mime_type),
        size=rendered_size,
        model=model_to_use,
        latency_ms=latency_ms,
        prompt_used=prompt,
    )


def _first_image(payload: object) -> dict[str, object] | None:
    """Pull the first image object out of an OpenRouter `/images` response."""
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if not isinstance(data, list) or not data:
        return None
    first = data[0]
    return first if isinstance(first, dict) else None


#: Pillow's name for each format we hand back.
_PIL_FORMAT = {"jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}


def _conform(raw: bytes, b64: str, output_format: str, reported_mime: str) -> tuple[str, str, str]:
    """Return the render as `(base64, mime type, "WIDTHxHEIGHT")`.

    Re-encodes when the model returned something other than the configured
    format. Anything unreadable is passed through untouched: a render we cannot
    parse is still a render, and the client is told what it actually got.
    """
    want_mime = _OUTPUT_MIME[output_format]
    try:
        with Image.open(io.BytesIO(raw)) as rendered:
            size = f"{rendered.width}x{rendered.height}"
            if (rendered.format or "").upper() == _PIL_FORMAT[output_format]:
                return b64, want_mime, size

            logger.info(
                "Model returned %s; re-encoding to %s.",
                rendered.format or reported_mime or "an unknown format",
                output_format,
            )
            buffer = io.BytesIO()
            save_args: dict[str, object] = {}
            if output_format in {"jpeg", "webp"}:
                save_args["quality"] = max(1, min(100, IMAGE_OUTPUT_COMPRESSION))
            rendered.convert("RGB").save(buffer, format=_PIL_FORMAT[output_format], **save_args)
            return base64.b64encode(buffer.getvalue()).decode("ascii"), want_mime, size
    except Exception:  # noqa: BLE001 - an image we cannot re-encode still ships
        logger.warning("Could not re-encode the generated image; passing it through as-is.")
        return b64, reported_mime or want_mime, ""


def _call_images_edit(client: OpenAI, params: dict[str, object]) -> object:
    """POST the edit to OpenRouter, retrying once without the optional hints.

    Support for `quality`, `output_format` and `aspect_ratio` varies by model on
    OpenRouter, and an unsupported one is a 400. Swapping OPENROUTER_IMAGE_MODEL
    to a pickier model should degrade to a plain render, not a failed request.

    `client.post` is used rather than `client.images`: OpenRouter has no
    OpenAI-compatible image-edit route, but going through the SDK client keeps
    the auth, base URL, timeout, retries and exception classes identical to
    every other call in this service.
    """
    try:
        return client.post(_IMAGES_PATH, body=params, cast_to=object)
    except BadRequestError as exc:
        dropped = [name for name in _OPTIONAL_PARAMS if name in params and _mentions(exc, name)]
        if not dropped:
            raise
        logger.warning(
            "Model %r rejected %s; retrying without it.",
            params.get("model"),
            ", ".join(dropped),
        )
        retry = {k: v for k, v in params.items() if k not in dropped}
        return client.post(_IMAGES_PATH, body=retry, cast_to=object)


def _mentions(exc: BadRequestError, param: str) -> bool:
    return param in str(exc).lower()


def _translate_bad_request(exc: BadRequestError) -> ImageGenerationError:
    """Turn a provider 400 into something a customer can act on."""
    text = str(exc).lower()
    if "moderation" in text or "safety" in text or "rejected" in text:
        logger.info("Image provider blocked the request on moderation grounds.")
        return ImageGenerationError(
            "content_blocked",
            "The image service would not process this photo or style. Try a different photo.",
            status=422,
        )
    if "model" in text and (
        "not found" in text
        or "does not exist" in text
        or "access" in text
        # OpenRouter's wording when no provider can serve the model
        or "no endpoints" in text
        or "no allowed providers" in text
    ):
        logger.error("Configured image model is unavailable: %s", exc)
        return ImageGenerationError(
            "model_unavailable",
            "The configured image model is unavailable on this server.",
            status=503,
        )
    logger.error("Image provider rejected the request: %s", exc)
    return ImageGenerationError(
        "generation_failed",
        "The preview could not be generated from that photo. Try another photo.",
        status=422,
    )
