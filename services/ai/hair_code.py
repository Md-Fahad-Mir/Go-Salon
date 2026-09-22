

import base64
import json
import logging
import os
import re
import sys
from datetime import datetime
from collections.abc import Sequence
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus, urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from openai import OpenAI

import openrouter

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
# Provider config lives in `openrouter` so both endpoints share one key, base
# URL and set of attribution headers. Model IDs are namespaced provider/model.
MODEL = openrouter.ANALYSIS_MODEL  # Default: openai/gpt-4o, a vision model available to every account
PROVIDER_TIMEOUT = openrouter.ANALYSIS_TIMEOUT
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
YOUTUBE_MAX_RESULTS = max(1, int(os.getenv("YOUTUBE_MAX_RESULTS", "3")))
YOUTUBE_SAFE_SEARCH = os.getenv("YOUTUBE_SAFE_SEARCH", "moderate")
YOUTUBE_TIMEOUT = float(os.getenv("YOUTUBE_TIMEOUT", "10"))

_PLACEHOLDER_KEYS = {"", "your-youtube-api-key", "your_youtube_api_key_here", "mock-key-for-local-dev"}


def _has_usable_youtube_key() -> bool:
    if not YOUTUBE_API_KEY:
        return False
    key = YOUTUBE_API_KEY.strip()
    if key.lower() in _PLACEHOLDER_KEYS:
        return False
    if key.startswith("http://") or key.startswith("https://"):
        return False
    return True

# Model Priority List (will use first available). Ordered from strongest
# generally-available vision-capable model down to cheaper fallbacks.
PREFERRED_MODELS = [
    "openai/gpt-4o",            # Stable: strong vision + reasoning
    "openai/gpt-4o-mini",       # Budget: fast and cheap
    "google/gemini-2.5-flash",  # Fallback on another provider, in case OpenAI is down on OpenRouter
    "openai/gpt-5",             # Used automatically if/when the account can route to it
]

OUTPUT_DIR = Path("./reports")


# ─────────────────────────────────────────────────────────────────────────────
# PROMPT  (analysis + recommendations together)
# ─────────────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are an expert AI consultant in facial aesthetics, dermatology,
trichology, hairstyling, and color theory. Analyze the photo deeply and honestly,
based only on visible features (no race/ethnicity assumptions).

For hairstyle recommendations, think like an experienced barber with this person
in the chair today. A haircut removes, shortens and reshapes the hair that is in
the photo; it cannot add any. Recommend only cuts a barber could achieve now from
the visible hair - never a style that needs more length, more density, a fuller
hairline, or hair that is not there.

Return ONE valid JSON object — no prose, no markdown, no code fences.
All scores are integers 0-100. If unobservable, use "unknown" / null / [] / false."""


SCHEMA = """
{
  "face_shape_analysis": {
    "detected_shape": "oval|round|square|rectangle|heart|diamond|triangle|oblong",
    "confidence_score": 0-100,
    "reasoning": "...",
    "facial_symmetry": {"score": 0-100, "notes": "..."},
    "jawline": "...", "cheekbones": "...", "chin_structure": "...",
    "forehead_proportions": "...", "facial_geometry_notes": "...",
    "golden_ratio_alignment": {"score": 0-100, "notes": "..."},
    "facial_architecture_summary": "..."
  },
  "skin_analysis": {
    "skin_tone": "...", "undertone": "warm|cool|neutral|olive",
    "texture": "...", "condition": "dry|oily|combination|normal",
    "acne_observation": "...", "dark_circles": "...", "redness": "...",
    "wrinkles": "...", "pores": "...",
    "smoothness_score": 0-100, "overall_skin_health_score": 0-100,
    "notes": "..."
  },
  "beard_analysis": {
    "has_beard": true_or_false,
    "style": "clean_shave|stubble|short_beard|full_beard|goatee|long_beard|other",
    "density": "...", "length": "...", "grooming_condition": "...", "notes": "..."
  },
  "hair_analysis": {
    "current_hairstyle": "...",
    "head_shape": "...",
    "crown_area": "unknown unless a top/back view was given",
    "back_of_head": "unknown unless a back view was given",
    "sides": "...", "nape": "unknown unless a back view was given",
    "length_observed": "estimate now, e.g. '~4 cm on top, ~1 cm at the sides'",
    "length_category": "very_short|short|medium|long|extra_long",
    "texture_classification": "straight|wavy|curly|coily",
    "pattern": "...", "density": "low|medium|high",
    "thickness": "fine|medium|thick", "volume": "...",
    "hairline_condition": "...", "curl_pattern": "...",
    "growth_direction": "...", "shine_level": "low|medium|high",
    "frizz_level": "low|medium|high", "hair_health_score": 0-100,
    "damage_observation": "...", "thinning_observation": "...",
    "split_ends": "...", "dry_or_oily": "...", "scalp_visibility": "...",
    "notes": "..."
  },
  "hair_color_analysis": {
    "current_color": "...", "tone": "...", "warm_cool_balance": "...",
    "estimated_natural_color": "...", "color_depth": "..."
  },
  "style_trend_analysis": {
    "current_classification": "modern|trendy|classic|outdated",
    "trend_score": 0-100, "celebrity_inspired_category": "...", "notes": "..."
  },
  "recommendations": {
    "hairstyles": [
      {
        "name": "...", "description": "...", "why_it_suits": "...",
        "compatibility_score": 0-100,
        "current_hair_fit": 0-100,
        "length_change": "shorter|same",
        "styling_difficulty": "easy|moderate|hard",
        "maintenance_level": "low|medium|high",
        "styling_tips": ["...", "...", "..."],
        "suitability": "casual|professional|both"
      }
    ],
    "hair_colors": {
      "best_matching": ["..."], "natural_options": ["..."],
      "bold_options": ["..."], "colors_to_avoid": ["..."],
      "reasoning": "..."
    },
    "beard_recommendations": [
      {"style": "...", "why_it_suits": "...", "compatibility_score": 0-100}
    ],
    "hair_care": {
      "growth_suggestions": ["..."], "repair_suggestions": ["..."],
      "hair_fall_prevention": ["..."], "scalp_care": ["..."],
      "home_remedies": ["..."], "maintenance_routine": ["..."],
      "product_recommendations": {
        "oils": ["..."], "shampoo": ["..."], "conditioner": ["..."],
        "serum": ["..."], "hair_masks": ["..."]
      }
    },
    "face_care": {
      "skin_care_advice": ["..."], "acne_prevention": ["..."],
      "hydration": ["..."], "texture_improvement": ["..."],
      "grooming_advice": ["..."]
    }
  },
  "summary": "3-5 sentence overall summary."
}
""".strip()


#: How each captured viewpoint is described to the model. The ids are the
#: frontend's, and the order is the ring the customer is walked around.
ANGLE_LABELS = {
    "front": "front",
    "front_left": "front-left three-quarter",
    "left": "left profile",
    "back_left": "back-left",
    "back": "back of the head",
    "back_right": "back-right",
    "right": "right profile",
    "front_right": "front-right three-quarter",
}


def build_angle_brief(angles: list[str]) -> str:
    """The instruction that turns N photographs into one reading of one head.

    Without it the model treats extra images as extra people, or answers from
    the first one and ignores the rest. With it, the back and crown — the parts
    a selfie can never show, and the parts that decide whether a fade will
    actually work — become observations rather than guesses.
    """
    named = [ANGLE_LABELS.get(a, a) for a in angles if a]
    listed = ", ".join(f"image {i}: {label}" for i, label in enumerate(named, 1))
    return (
        f"You are given {len(named)} photographs of the SAME person's head from "
        f"different angles ({listed}). They are one person, not several.\n"
        f"Read the hair from ALL of them together. The back, the crown, the nape "
        f"and the sides are visible here in a way a single front photo never is — "
        f"use them: length and density at the back and crown, how the sides are "
        f"cut, the neckline, growth direction, whorls, and any thinning that only "
        f"shows from behind or in profile.\n"
        f"Judge every hairstyle against the whole head. A cut that suits the face "
        f"but does not work with this person's crown, nape or side profile is not "
        f"a recommendation.\n\n"
    )


UNKNOWN_INPUTS = {"", "unknown", "unspecified", "none", "any"}


def _stated(value: str) -> str:
    """"" for an input the client could not tell us, so the prompt can omit it."""
    return "" if str(value).strip().lower() in UNKNOWN_INPUTS else str(value).strip()


def build_user_prompt(gender: str, hair_length: str, occasion: str, angles: list[str] | None = None) -> str:
    stated = [
        f"{label}: {value}"
        for label, value in (
            ("Gender", _stated(gender)),
            ("Hair length", _stated(hair_length)),
            ("Occasion", _stated(occasion)),
        )
        if value
    ]
    known = ", ".join(stated) if stated else "none given"
    occasion_line = (
        f"Prioritise options that suit the selected occasion ({_stated(occasion)}). "
        if _stated(occasion)
        else ""
    )
    return (
        (build_angle_brief(angles) if angles and len(angles) > 1 else "")
        + f"What the customer told us — {known}. The photo is the authority: where "
        f"it disagrees with what they said, trust the photo.\n\n"
        f"HAIR is the highest priority. First read the hair that is actually there: "
        f"length on top and at the sides, density, hairline (including any recession "
        f"or thinning), texture, volume and growth direction.\n\n"
        f"Then recommend 4-5 hairstyles, each named the way a barber would name it "
        f"(e.g. 'Low fade + textured crop', 'Classic taper', 'Blunt bob with soft "
        f"layers'), tailored to this face shape, head shape, hair texture, density, "
        f"hairline, skin tone & undertone and any beard. {occasion_line}"
        f"Every recommendation must pass two tests:\n"
        f"1. Suitability — it flatters this face and head. In `why_it_suits`, name "
        f"the specific features you observed that make it work. Score it in "
        f"`compatibility_score`.\n"
        f"2. Feasibility — a barber could cut it TODAY from the hair in the photo, by "
        f"cutting, trimming, tapering, fading or reshaping only. `length_change` "
        f"must be 'shorter' or 'same'. Never recommend a style that needs the hair "
        f"to grow, gain density, or cover a receding hairline. Score how directly "
        f"it can be cut from the current hair in `current_hair_fit`.\n"
        f"Different faces and different hair must get different lists — do not "
        f"fall back on the same generic styles. Use golden-ratio principles and "
        f"color harmony.\n\n"
        f"Return ONLY this JSON schema:\n{SCHEMA}"
    )


def build_tutorial_query(topic: str, gender: str = "", hair_length: str = "", occasion: str = "") -> str:
    parts = [topic.strip(), "tutorial"]
    if gender.strip():
        parts.append(gender.strip())
    if hair_length.strip():
        parts.append(hair_length.strip())
    if occasion.strip():
        parts.append(occasion.strip())
    return " ".join(part for part in parts if part)


def _youtube_search_url(query: str) -> str:
    return f"https://www.youtube.com/results?search_query={quote_plus(query)}"


def fetch_youtube_tutorials(query: str, max_results: int | None = None) -> list[dict]:
    query = query.strip()
    if not query:
        return []

    fallback = [
        {
            "title": f'Search YouTube for "{query}"',
            "url": _youtube_search_url(query),
            "source": "youtube_search",
        }
    ]

    if not _has_usable_youtube_key():
        logger.warning(
            "YOUTUBE_API_KEY not configured (or is a placeholder); "
            "falling back to a YouTube search link instead of specific videos."
        )
        return fallback

    limit = max_results or YOUTUBE_MAX_RESULTS
    params = {
        "part": "snippet",
        "type": "video",
        "order": "relevance",
        "maxResults": str(limit),
        "q": query,
        "safeSearch": YOUTUBE_SAFE_SEARCH,
        "key": YOUTUBE_API_KEY,
    }
    url = "https://www.googleapis.com/youtube/v3/search?" + urlencode(params)

    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=YOUTUBE_TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="ignore")[:500]
        except Exception:
            pass
        if exc.code == 403:
            logger.error("YouTube API request forbidden (quota exceeded or invalid key): %s", body)
        else:
            logger.error("YouTube API HTTP error %s: %s", exc.code, body)
        return fallback
    except (URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
        logger.error("YouTube API request failed for query %r: %s", query, exc)
        return fallback

    tutorials: list[dict] = []
    for item in payload.get("items") or []:
        snippet = item.get("snippet") or {}
        video_id = (item.get("id") or {}).get("videoId")
        if not video_id:
            continue

        thumbnails = snippet.get("thumbnails") or {}
        tutorials.append(
            {
                "title": snippet.get("title") or query,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "video_id": video_id,
                "channel_title": snippet.get("channelTitle"),
                "published_at": snippet.get("publishedAt"),
                "description": snippet.get("description"),
                "thumbnail_url": (thumbnails.get("medium") or thumbnails.get("default") or {}).get("url"),
                "source": "youtube_api",
            }
        )

    return tutorials or fallback


def enrich_analysis_with_tutorials(data: dict) -> dict:
    recommendations = data.get("recommendations") or {}
    if not isinstance(recommendations, dict):
        return data

    meta = data.get("_meta") or {}
    gender = str(meta.get("gender") or "").strip()
    hair_length = str(meta.get("hair_length") or "").strip()
    occasion = str(meta.get("occasion") or "").strip()
    hair_analysis = data.get("hair_analysis") or {}
    texture = str(hair_analysis.get("texture_classification") or "").strip()
    density = str(hair_analysis.get("density") or "").strip()

    for hairstyle in recommendations.get("hairstyles") or []:
        if not isinstance(hairstyle, dict):
            continue
        style_name = str(hairstyle.get("name") or "").strip()
        if not style_name:
            continue
        query = build_tutorial_query(f"{style_name} hairstyle", gender, hair_length, occasion)
        hairstyle["tutorials"] = fetch_youtube_tutorials(query)

    hair_care = recommendations.get("hair_care")
    if isinstance(hair_care, dict):
        care_bits = [part for part in [texture, density, gender, hair_length, occasion] if part]
        if care_bits:
            query = build_tutorial_query(f"hair care for {' '.join(care_bits)}", occasion=occasion)
            hair_care["tutorials"] = fetch_youtube_tutorials(query)

    for beard in recommendations.get("beard_recommendations") or []:
        if not isinstance(beard, dict):
            continue
        beard_style = str(beard.get("style") or "").strip()
        if not beard_style:
            continue
        query = build_tutorial_query(f"{beard_style} beard", gender, hair_length, occasion)
        beard["tutorials"] = fetch_youtube_tutorials(query)

    return data


# ─────────────────────────────────────────────────────────────────────────────
# ANALYSIS
# ─────────────────────────────────────────────────────────────────────────────
def encode_image(path: Path) -> tuple[str, str]:
    ext = path.suffix.lower().lstrip(".")
    if ext == "jpg":
        ext = "jpeg"
    if ext not in {"jpeg", "png", "webp", "gif"}:
        raise ValueError(f"Unsupported image format: .{ext}")
    return base64.b64encode(path.read_bytes()).decode("utf-8"), f"image/{ext}"


_RESOLVED_MODEL: dict[str, str] = {}


def get_best_available_model(client: OpenAI, preferred_model: str) -> str:
    """
    Check if the preferred model is available, otherwise find the best alternative.
    Returns the model name to use.

    The answer is cached per configured model: listing models on every request
    cost a round trip to OpenRouter before the analysis even started.
    """
    cached = _RESOLVED_MODEL.get(preferred_model)
    if cached:
        return cached

    try:
        # Try to list available models
        models = client.models.list()
        available_model_ids = {model.id for model in models.data}
    except Exception as exc:
        # If we can't list models, just use the configured one and let the
        # chat completion call surface any "model not found" error clearly.
        logger.warning("Could not list OpenRouter models (%s); using configured model %r", exc, preferred_model)
        return preferred_model

    if preferred_model in available_model_ids:
        _RESOLVED_MODEL[preferred_model] = preferred_model
        return preferred_model

    for model_name in PREFERRED_MODELS:
        if model_name in available_model_ids:
            logger.info("Configured model %r unavailable; using %r instead", preferred_model, model_name)
            _RESOLVED_MODEL[preferred_model] = model_name
            return model_name

    logger.warning(
        "Configured model %r is not in OpenRouter's model list and no fallback "
        "from PREFERRED_MODELS matched; the analysis request will likely fail. "
        "Set OPENROUTER_MODEL to a model your account can route to.",
        preferred_model,
    )
    return preferred_model


def analyze(
    image_path: Path | Sequence[Path],
    gender: str,
    hair_length: str,
    occasion: str,
    angles: Sequence[str] | None = None,
) -> dict:
    """Read one photo, or several angles of one head, in a single vision call.

    A `Path` and a list of them are both accepted so the CLI and the single-photo
    endpoint are unchanged. When more than one arrives they are sent as one
    message — the model has to see them together to answer about one head, and N
    separate calls could not agree on a hairline, let alone on a crown.
    """
    if not openrouter.has_api_key():
        raise RuntimeError("OPENROUTER_API_KEY not set in environment.")

    paths = [image_path] if isinstance(image_path, Path) else list(image_path)
    if not paths:
        raise ValueError("No image was given to analyse.")
    for path in paths:
        if not path.exists():
            raise FileNotFoundError(f"Image not found: {path}")
    labels = list(angles or [])

    client = openrouter.make_client(PROVIDER_TIMEOUT)

    # Automatically select the best available model
    model_to_use = get_best_available_model(client, MODEL)

    content: list[dict] = [
        {"type": "text", "text": build_user_prompt(gender, hair_length, occasion, labels)}
    ]
    for path in paths:
        b64, media_type = encode_image(path)
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{media_type};base64,{b64}",
                    "detail": "high",  # Use "high" for best quality analysis
                },
            }
        )

    # Prepare API parameters based on model capabilities
    api_params = {
        "model": model_to_use,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        "response_format": {"type": "json_object"},
    }
    
    # OpenRouter normalises token limits onto max_tokens for every model, so
    # max_completion_tokens is not sent. The gpt-5 family still rejects a custom
    # temperature (it only supports the default), so that one is left off.
    api_params["max_tokens"] = 4096
    if "gpt-5" not in model_to_use.lower():
        api_params["temperature"] = 0.3
    
    response = client.chat.completions.create(**api_params)

    content = response.choices[0].message.content or ""
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Model returned invalid JSON: {e}\nRaw: {content[:500]}")

    data["_meta"] = {
        "model": model_to_use,  # Store actual model used
        "configured_model": MODEL,
        "image_name": paths[0].name,
        "image_count": len(paths),
        "angles": labels,
        "gender": gender,
        "hair_length": hair_length,
        "occasion": occasion,
        "tokens_used": response.usage.total_tokens if response.usage else None,
    }
    return data


# ─────────────────────────────────────────────────────────────────────────────
# CLIENT VIEW  (a small, stable contract carved out of the model's big JSON)
# ─────────────────────────────────────────────────────────────────────────────
_SLUG_RE = re.compile(r"[^a-z0-9]+")

_DIFFICULTIES = {"easy", "moderate", "hard"}
_LEVELS = {"low", "medium", "high"}
_LENGTH_CHANGES = {"shorter", "same", "longer"}
_LENGTH_CATEGORIES = {"very_short", "short", "medium", "long", "extra_long"}


def slugify(value: str, fallback: str = "style") -> str:
    slug = _SLUG_RE.sub("-", str(value).lower()).strip("-")
    return slug[:48] or fallback


def _clamp_score(value: object, default: int = 0) -> int:
    try:
        return max(0, min(100, int(float(value))))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _optional_score(value: object) -> int | None:
    """A score the model may not have given. None, not 0: an absent read must
    not be shown as a very bad one."""
    if value is None or value == "":
        return None
    try:
        return _clamp_score(value)
    except (TypeError, ValueError):
        return None


def _text(value: object, default: str = "") -> str:
    if value is None or isinstance(value, (dict, list)):
        return default
    text = str(value).strip()
    return text if text and text.lower() != "unknown" else default


def _one_of(value: object, allowed: set[str], default: str) -> str:
    text = _text(value).lower().replace(" ", "_")
    return text if text in allowed else default


def normalize_recommendations(data: dict) -> list[dict]:
    """The hairstyle list, with every field the client depends on guaranteed.

    The model is asked for this shape but is not held to it, so anything missing
    is filled in here rather than left for the frontend to guess at. Each entry
    gets a stable id derived from its name: the client sends that id back with
    the generation request, so a recommendation can be traced end to end.
    """
    recommendations = data.get("recommendations")
    if not isinstance(recommendations, dict):
        return []

    out: list[dict] = []
    seen: set[str] = set()
    for index, item in enumerate(recommendations.get("hairstyles") or [], 1):
        if not isinstance(item, dict):
            continue
        name = _text(item.get("name"))
        if not name:
            continue

        base = f"rec-{index}-{slugify(name)}"
        style_id = base
        suffix = 2
        while style_id in seen:
            style_id = f"{base}-{suffix}"
            suffix += 1
        seen.add(style_id)

        tips = [
            _text(tip)
            for tip in (item.get("styling_tips") or [])
            if isinstance(tip, (str, int, float)) and _text(tip)
        ]
        out.append(
            {
                "id": style_id,
                "name": name,
                "description": _text(item.get("description")),
                "why_it_suits": _text(item.get("why_it_suits")),
                "compatibility_score": _clamp_score(item.get("compatibility_score")),
                # How directly a barber can cut this from the hair in the photo.
                # Separate from `compatibility_score` on purpose: "suits the
                # face" and "achievable today" are different questions, and a
                # style can pass one and fail the other.
                "current_hair_fit": _optional_score(item.get("current_hair_fit")),
                "length_change": _one_of(item.get("length_change"), _LENGTH_CHANGES, ""),
                "styling_difficulty": _one_of(item.get("styling_difficulty"), _DIFFICULTIES, "moderate"),
                "maintenance_level": _one_of(item.get("maintenance_level"), _LEVELS, "medium"),
                "styling_tips": tips[:5],
                "suitability": _text(item.get("suitability"), "both"),
                "tutorials": item.get("tutorials") or [],
            }
        )

    # A cut that needs the hair to grow is not a cut. The prompt forbids these,
    # but the model is not held to the prompt, so they are dropped here too —
    # unless that would empty the list, in which case the model ignored the
    # rule wholesale and the client is at least told which ones need length.
    achievable = [item for item in out if item["length_change"] != "longer"]
    if achievable:
        if len(achievable) < len(out):
            logger.info(
                "Dropped %d recommendation(s) that need longer hair than the photo shows.",
                len(out) - len(achievable),
            )
        out = achievable
    else:
        logger.warning("Every recommendation needs longer hair; keeping them, flagged.")

    # The strongest match first, so the client can render the list as-is.
    out.sort(key=lambda item: item["compatibility_score"], reverse=True)
    return out


def build_profile(data: dict) -> dict:
    """The handful of observations worth showing — and worth feeding back into
    the image prompt when the customer picks a style."""
    face = data.get("face_shape_analysis") or {}
    hair = data.get("hair_analysis") or {}
    color = data.get("hair_color_analysis") or {}
    skin = data.get("skin_analysis") or {}
    beard = data.get("beard_analysis") or {}
    return {
        "face_shape": _text(face.get("detected_shape")),
        "face_shape_confidence": _clamp_score(face.get("confidence_score")),
        "hair_texture": _text(hair.get("texture_classification")),
        "hair_density": _text(hair.get("density")),
        "hair_length_observed": _text(hair.get("length_observed")),
        "hair_length_category": _one_of(hair.get("length_category"), _LENGTH_CATEGORIES, ""),
        "current_hairstyle": _text(hair.get("current_hairstyle")),
        # Fed back into the render so the model keeps the hairline it was
        # given rather than restoring one.
        "hairline": _text(hair.get("hairline_condition")),
        # Only a 360 capture answers these; a single front photo leaves them
        # blank rather than guessing, and the card omits what is blank.
        "head_shape": _text(hair.get("head_shape")),
        "crown_area": _text(hair.get("crown_area")),
        "back_of_head": _text(hair.get("back_of_head")),
        "sides": _text(hair.get("sides")),
        "nape": _text(hair.get("nape")),
        "thinning": _text(hair.get("thinning_observation")),
        "scalp_visibility": _text(hair.get("scalp_visibility")),
        "hair_health_score": _clamp_score(hair.get("hair_health_score")),
        "hair_color": _text(color.get("current_color")),
        "skin_tone": _text(skin.get("skin_tone")),
        "undertone": _text(skin.get("undertone")),
        "has_beard": bool(beard.get("has_beard")),
        "beard_style": _text(beard.get("style")),
    }


def summarize_for_client(data: dict) -> dict:
    """`/analyze`'s stable half: normalised recommendations, profile and summary."""
    return {
        "recommendations": normalize_recommendations(data),
        "profile": build_profile(data),
        "summary": _text(data.get("summary")),
    }


# ─────────────────────────────────────────────────────────────────────────────
# REPORT  (Markdown)
# ─────────────────────────────────────────────────────────────────────────────
def s(v, default="—"):
    """Safe value getter."""
    return default if v is None or v == "" else v


def _bullets(items):
    return "\n".join(f"- {x}" for x in (items or []))


def to_markdown(data: dict) -> str:
    out: list[str] = []
    meta = data.get("_meta", {})

    out.append("# Face & Hair AI Analysis Report")
    out.append(f"\n_Generated: {datetime.now():%Y-%m-%d %H:%M:%S}_\n")
    out.append(f"**Image:** `{s(meta.get('image_name'))}`  ")
    out.append(f"**Gender:** {s(meta.get('gender'))}  |  "
               f"**Hair length:** {s(meta.get('hair_length'))}  |  "
               f"**Occasion:** {s(meta.get('occasion'))}  ")
    out.append(f"**Model:** `{s(meta.get('model'))}`\n")

    if data.get("summary"):
        out.append("## Summary\n" + data["summary"] + "\n")

    # ---- Face shape
    fs = data.get("face_shape_analysis", {}) or {}
    sym = fs.get("facial_symmetry", {}) or {}
    gr = fs.get("golden_ratio_alignment", {}) or {}
    out.append("## Face Shape Analysis")
    out.append(f"- **Detected shape:** **{s(fs.get('detected_shape'))}** "
               f"({s(fs.get('confidence_score'))}/100)")
    out.append(f"- **Reasoning:** {s(fs.get('reasoning'))}")
    out.append(f"- **Symmetry:** {s(sym.get('score'))}/100 — {s(sym.get('notes'))}")
    out.append(f"- **Golden ratio:** {s(gr.get('score'))}/100 — {s(gr.get('notes'))}")
    for label, key in [
        ("Jawline", "jawline"), ("Cheekbones", "cheekbones"),
        ("Chin", "chin_structure"), ("Forehead", "forehead_proportions"),
        ("Geometry", "facial_geometry_notes"),
        ("Architecture", "facial_architecture_summary"),
    ]:
        out.append(f"- **{label}:** {s(fs.get(key))}")
    out.append("")

    # ---- Skin
    sk = data.get("skin_analysis", {}) or {}
    out.append("## Skin Analysis")
    for label, key in [
        ("Skin tone", "skin_tone"), ("Undertone", "undertone"),
        ("Texture", "texture"), ("Condition", "condition"),
        ("Acne", "acne_observation"), ("Dark circles", "dark_circles"),
        ("Redness", "redness"), ("Wrinkles", "wrinkles"), ("Pores", "pores"),
    ]:
        out.append(f"- **{label}:** {s(sk.get(key))}")
    out.append(f"- **Smoothness:** {s(sk.get('smoothness_score'))}/100")
    out.append(f"- **Skin health:** {s(sk.get('overall_skin_health_score'))}/100\n")

    # ---- Beard
    bd = data.get("beard_analysis", {}) or {}
    out.append("## Beard Analysis")
    for label, key in [
        ("Has beard", "has_beard"), ("Style", "style"),
        ("Density", "density"), ("Length", "length"),
        ("Grooming", "grooming_condition"),
    ]:
        out.append(f"- **{label}:** {s(bd.get(key))}")
    out.append("")

    # ---- Hair
    h = data.get("hair_analysis", {}) or {}
    out.append("## Hair Analysis")
    for label, key in [
        ("Current style", "current_hairstyle"), ("Length observed", "length_observed"),
        ("Texture", "texture_classification"), ("Pattern", "pattern"),
        ("Density", "density"), ("Thickness", "thickness"), ("Volume", "volume"),
        ("Hairline", "hairline_condition"), ("Curl pattern", "curl_pattern"),
        ("Growth direction", "growth_direction"), ("Shine", "shine_level"),
        ("Frizz", "frizz_level"), ("Damage", "damage_observation"),
        ("Thinning", "thinning_observation"), ("Split ends", "split_ends"),
        ("Dry/Oily", "dry_or_oily"), ("Scalp visibility", "scalp_visibility"),
    ]:
        out.append(f"- **{label}:** {s(h.get(key))}")
    out.append(f"- **Hair health:** {s(h.get('hair_health_score'))}/100\n")

    # ---- Hair color
    hc = data.get("hair_color_analysis", {}) or {}
    out.append("## Hair Color Analysis")
    for label, key in [
        ("Current color", "current_color"), ("Tone", "tone"),
        ("Warm/Cool", "warm_cool_balance"),
        ("Natural color (est.)", "estimated_natural_color"),
        ("Depth", "color_depth"),
    ]:
        out.append(f"- **{label}:** {s(hc.get(key))}")
    out.append("")

    # ---- Trend
    st = data.get("style_trend_analysis", {}) or {}
    out.append("## Style & Trend")
    out.append(f"- **Classification:** {s(st.get('current_classification'))} "
               f"({s(st.get('trend_score'))}/100)")
    out.append(f"- **Celebrity-inspired category:** "
               f"{s(st.get('celebrity_inspired_category'))}\n")

    # ---- Recommendations: hairstyles
    rec = data.get("recommendations", {}) or {}
    out.append("## Hairstyle Recommendations")
    for i, hs in enumerate(rec.get("hairstyles") or [], 1):
        out.append(f"### {i}. {s(hs.get('name'))} "
                   f"— {s(hs.get('compatibility_score'))}/100")
        if hs.get("description"):
            out.append(f"_{hs['description']}_")
        out.append(f"- **Why it suits:** {s(hs.get('why_it_suits'))}")
        out.append(f"- **Difficulty:** {s(hs.get('styling_difficulty'))}  |  "
                   f"**Maintenance:** {s(hs.get('maintenance_level'))}  |  "
                   f"**Suitability:** {s(hs.get('suitability'))}")
        if hs.get("styling_tips"):
            out.append("- **Tips:**\n" +
                       "\n".join(f"  - {t}" for t in hs["styling_tips"]))
        tutorials = hs.get("tutorials") or []
        if tutorials:
            out.append("- **Tutorials:**")
            for tutorial in tutorials:
                title = s(tutorial.get("title"))
                url = s(tutorial.get("url"))
                out.append(f"  - [{title}]({url})")
        out.append("")

    # ---- Hair colors
    hcr = rec.get("hair_colors", {}) or {}
    out.append("## Hair Color Recommendations")
    for label, key in [
        ("Best matching", "best_matching"), ("Natural options", "natural_options"),
        ("Bold options", "bold_options"), ("Colors to avoid", "colors_to_avoid"),
    ]:
        items = hcr.get(key) or []
        if items:
            out.append(f"- **{label}:** {', '.join(map(str, items))}")
    if hcr.get("reasoning"):
        out.append(f"\n_Reasoning:_ {hcr['reasoning']}")
    out.append("")

    # ---- Beard recs
    br = rec.get("beard_recommendations") or []
    if br:
        out.append("## Beard Recommendations")
        for b in br:
            out.append(f"- **{s(b.get('style'))}** "
                       f"({s(b.get('compatibility_score'))}/100) — "
                       f"{s(b.get('why_it_suits'))}")
        out.append("")

    # ---- Hair care
    hcare = rec.get("hair_care", {}) or {}
    if hcare:
        out.append("## Hair Care & Treatment")
        for label, key in [
            ("Growth", "growth_suggestions"), ("Repair", "repair_suggestions"),
            ("Hair fall prevention", "hair_fall_prevention"),
            ("Scalp care", "scalp_care"), ("Home remedies", "home_remedies"),
            ("Routine", "maintenance_routine"),
        ]:
            items = hcare.get(key) or []
            if items:
                out.append(f"\n**{label}:**\n" + _bullets(items))
        tutorials = hcare.get("tutorials") or []
        if tutorials:
            out.append("\n**Tutorials:**")
            for tutorial in tutorials:
                title = s(tutorial.get("title"))
                url = s(tutorial.get("url"))
                out.append(f"- [{title}]({url})")
        prods = hcare.get("product_recommendations", {}) or {}
        if any(prods.values()):
            out.append("\n**Products:**")
            for k, v in prods.items():
                if v:
                    out.append(f"- _{k.replace('_', ' ').title()}:_ "
                               f"{', '.join(map(str, v))}")
        out.append("")

    # ---- Face care
    fc = rec.get("face_care", {}) or {}
    if fc:
        out.append("## Face Care Recommendations")
        for label, key in [
            ("Skin care", "skin_care_advice"), ("Acne prevention", "acne_prevention"),
            ("Hydration", "hydration"), ("Texture", "texture_improvement"),
            ("Grooming", "grooming_advice"),
        ]:
            items = fc.get(key) or []
            if items:
                out.append(f"\n**{label}:**\n" + _bullets(items))
        out.append("")

    return "\n".join(out)


def save_results(data: dict, base_name: str) -> tuple[Path, Path]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = OUTPUT_DIR / f"{base_name}_{ts}.json"
    md_path = OUTPUT_DIR / f"{base_name}_{ts}.md"
    json_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    md_path.write_text(to_markdown(data), encoding="utf-8")
    return json_path, md_path


# ─────────────────────────────────────────────────────────────────────────────
# CLI ENTRY
# ─────────────────────────────────────────────────────────────────────────────
def main() -> None:
    print("=" * 60)
    print("  Face & Hair AI Analysis Tool")
    print("=" * 60)
    print(f"  Using Model: {MODEL}")
    print("=" * 60)
    print()
    
    # Check if API key is set
    if not openrouter.has_api_key():
        print("⚠️  ERROR: OpenRouter API key not configured!")
        print()
        print("Please follow these steps:")
        print("1. Open the '.env' file in this directory")
        print("2. Set OPENROUTER_API_KEY to your actual API key")
        print("3. Get your API key from: https://openrouter.ai/keys")
        print()
        print("Example .env file:")
        print("  OPENROUTER_API_KEY=sk-or-v1-...")
        print("  OPENROUTER_MODEL=openai/gpt-4o")
        print()
        sys.exit(1)
    
    # Get image path
    if len(sys.argv) > 1:
        image_input = sys.argv[1]
    else:
        # Show available images in current directory
        current_dir = Path(".")
        image_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
        available_images = [f for f in current_dir.iterdir() 
                          if f.is_file() and f.suffix.lower() in image_extensions]
        
        if available_images:
            print("Available images in current directory:")
            for img in sorted(available_images):
                print(f"  - {img.name}")
            print()
        
        image_input = input("Enter image filename (e.g., 1.png): ").strip()
    
    image_path = Path(image_input).expanduser().resolve()
    
    if not image_path.exists():
        print(f"❌ Error: Image not found at {image_path}")
        sys.exit(1)
    
    # Validate image format
    ext = image_path.suffix.lower().lstrip(".")
    if ext == "jpg":
        ext = "jpeg"
    if ext not in {"jpeg", "png", "webp", "gif"}:
        print(f"❌ Error: Unsupported image format '.{image_path.suffix}'")
        print(f"   Supported formats: .jpg, .jpeg, .png, .webp, .gif")
        print(f"   You entered: {image_path.name}")
        sys.exit(1)
    
    # Get gender
    if len(sys.argv) > 2:
        gender = sys.argv[2].lower()
    else:
        while True:
            gender = input("Enter gender (male/female): ").strip().lower()
            if gender in {"male", "female"}:
                break
            print("Error: Please enter 'male' or 'female'")
    
    # Get hair length
    if len(sys.argv) > 3:
        hair_length = sys.argv[3].strip().lower().replace(" ", "_")
    else:
        while True:
            hair_length = input("Enter hair length (short/medium/long/extra_long): ").strip().lower().replace(" ", "_")
            if hair_length in {"short", "medium", "long", "extra_long"}:
                break
            print("Error: Please enter 'short', 'medium', 'long', or 'extra_long'")

    # Get occasion
    valid_occasions = {"casual", "formal", "wedding", "party", "business", "date", "everyday"}
    if len(sys.argv) > 4:
        occasion = sys.argv[4].strip().lower()
    else:
        while True:
            occasion = input("Enter occasion (casual/formal/wedding/party/business/date/everyday): ").strip().lower()
            if occasion in valid_occasions:
                break
            print(f"Error: Please enter one of {', '.join(sorted(valid_occasions))}")
    
    print()
    print("-" * 60)

    print(f"Analyzing {image_path.name} ...")
    try:
        data = enrich_analysis_with_tutorials(analyze(image_path, gender, hair_length, occasion))
    except Exception as e:
        print(f"Failed: {e}")
        sys.exit(2)

    json_path, md_path = save_results(data, image_path.stem)

    # Quick console snapshot
    fs = data.get("face_shape_analysis", {}) or {}
    h = data.get("hair_analysis", {}) or {}
    sk = data.get("skin_analysis", {}) or {}
    print()
    print(f"Face shape : {fs.get('detected_shape')} ({fs.get('confidence_score')}/100)")
    print(f"Skin tone  : {sk.get('skin_tone')} ({sk.get('undertone')})")
    print(f"Hair       : {h.get('texture_classification')}, "
          f"density {h.get('density')}, health {h.get('hair_health_score')}/100")
    print()
    print("Top hairstyles:")
    for i, hs in enumerate((data.get("recommendations") or {}).get("hairstyles") or [], 1):
        print(f"  {i}. {hs.get('name')} — {hs.get('compatibility_score')}/100")
    print()
    print("-" * 60)
    print(f"✓ JSON saved : {json_path}")
    print(f"✓ Report     : {md_path}")
    print("-" * 60)
    print("\nAnalysis complete! Check the reports folder for detailed results.")
    print()


if __name__ == "__main__":
    main()