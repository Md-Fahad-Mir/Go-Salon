"""Shared image validation and normalisation for the API endpoints.

Both `/analyze` and `/generate` take a customer photo straight from a phone, so
both need the same guarantees before the bytes reach the provider: the upload
really is an image, it is the right way up, and it is small enough that we are
not paying vision tokens for pixels the model cannot use.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)

# What a client may send us. HEIC is deliberately absent: Pillow cannot decode
# it without an extra plugin, and phones convert on upload for `image/*` inputs.
SUPPORTED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
SUPPORTED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

#: Longest edge we keep. The vision model tops out well below this and the image
#: model renders at 1024, so anything larger is spend with no quality return.
DEFAULT_MAX_EDGE = 1024


class ImageValidationError(ValueError):
    """The upload is not something we can work with. Safe to show a client."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class NormalizedImage:
    """A decoded, re-encoded photo plus the facts callers need about it."""

    data: bytes
    mime_type: str
    suffix: str
    width: int
    height: int

    @property
    def aspect_ratio(self) -> float:
        return self.width / self.height if self.height else 1.0


def guess_suffix(filename: str | None, content_type: str | None) -> str:
    """Best-effort extension from the filename, falling back to the MIME type.

    Returns "" when neither looks like an image we support — the caller decides
    whether that is a 400 or just a missing hint.
    """
    suffix = Path(filename or "").suffix.lower()
    if suffix in SUPPORTED_SUFFIXES:
        return suffix
    return SUPPORTED_CONTENT_TYPES.get((content_type or "").lower(), "")


def normalize_upload(
    contents: bytes,
    *,
    max_edge: int = DEFAULT_MAX_EDGE,
    output_format: str = "JPEG",
) -> NormalizedImage:
    """Decode, orient, shrink and re-encode an uploaded photo.

    Decoding is the real validation: a file that only *claims* to be a JPEG in
    its name or Content-Type fails here rather than at the provider. EXIF
    orientation is baked in so a portrait selfie is not analysed sideways.
    """
    if not contents:
        raise ImageValidationError("empty_image", "The uploaded image is empty.")

    try:
        with Image.open(io.BytesIO(contents)) as probe:
            probe.verify()  # cheap structural check; consumes the file object
        with Image.open(io.BytesIO(contents)) as image:
            image = ImageOps.exif_transpose(image) or image
            image = image.convert("RGB")
            width, height = image.size
            if width < 64 or height < 64:
                raise ImageValidationError(
                    "image_too_small",
                    "That image is too small to analyse. Use a photo at least 64x64 pixels.",
                )

            longest = max(width, height)
            if longest > max_edge:
                scale = max_edge / longest
                image = image.resize(
                    (max(1, round(width * scale)), max(1, round(height * scale))),
                    Image.LANCZOS,
                )

            buffer = io.BytesIO()
            if output_format.upper() == "PNG":
                image.save(buffer, format="PNG", optimize=True)
                mime, suffix = "image/png", ".png"
            else:
                image.save(buffer, format="JPEG", quality=92, optimize=True)
                mime, suffix = "image/jpeg", ".jpg"

            return NormalizedImage(
                data=buffer.getvalue(),
                mime_type=mime,
                suffix=suffix,
                width=image.width,
                height=image.height,
            )
    except ImageValidationError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        logger.info("Rejected upload that could not be decoded: %s", exc)
        raise ImageValidationError(
            "invalid_image",
            "That file could not be read as an image. Use a JPG, PNG or WEBP photo.",
        ) from exc
