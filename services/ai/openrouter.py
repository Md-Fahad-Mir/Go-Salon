"""OpenRouter provider configuration, shared by every AI call in this service.

OpenRouter speaks the OpenAI wire format, so the `openai` SDK stays: only the
base URL, the key and the model IDs change. Keeping the client construction in
one place means the key is read once, the attribution headers are consistent,
and neither endpoint can drift onto a different base URL.

Nothing here logs the key — `has_api_key()` says whether one is present, and
that is all any caller needs to know.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

#: Vision model behind POST /analyze. Namespaced provider/model, as OpenRouter
#: requires. `openai/gpt-4o` is the direct equivalent of what this service used
#: before the migration, so the analysis output is unchanged.
ANALYSIS_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o")

#: Image model behind POST /generate. There is no `gpt-image-1` on OpenRouter
#: and no `input_fidelity` anywhere on its image API, so identity preservation
#: now rests entirely on the model: the Gemini image family edits the photo it
#: is given rather than re-generating from it, which is the behaviour this
#: product needs. See README for the alternatives.
IMAGE_MODEL = os.getenv("OPENROUTER_IMAGE_MODEL", "google/gemini-3.1-flash-image")

ANALYSIS_TIMEOUT = float(os.getenv("OPENROUTER_TIMEOUT", "90"))
IMAGE_TIMEOUT = float(os.getenv("OPENROUTER_IMAGE_TIMEOUT", "180"))

#: Optional OpenRouter attribution: shows this app on openrouter.ai rankings and
#: in the account's activity feed. Neither header is required to make a call.
_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "")
_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "Hair AI Analysis API")


def get_api_key() -> str | None:
    """Read the key at call time, so a `.env` reload is picked up on restart."""
    key = os.getenv("OPENROUTER_API_KEY")
    return key.strip() if key else None


def has_api_key() -> bool:
    """Whether a key is configured. Never says anything about the key itself."""
    return bool(get_api_key())


def default_headers() -> dict[str, str]:
    headers = {"X-Title": _APP_NAME}
    if _SITE_URL:
        headers["HTTP-Referer"] = _SITE_URL
    return headers


def make_client(timeout: float) -> OpenAI:
    """Build an OpenAI SDK client pointed at OpenRouter.

    Callers are expected to have checked `has_api_key()` first — the SDK raises
    on a missing key, and each endpoint has its own client-safe message for that.
    """
    return OpenAI(
        api_key=get_api_key(),
        base_url=BASE_URL,
        timeout=timeout,
        default_headers=default_headers(),
    )
