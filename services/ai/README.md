# Hair AI service

FastAPI service behind the customer app's AI Try-On. Two endpoints, one
OpenRouter key, no database and no file storage — a photo arrives, is used, and
is gone.

```
services/frontend  ──►  POST /analyze   ──►  OpenRouter chat (openai/gpt-4o)
                                             face + hair read, hairstyle picks
                   ──►  POST /generate  ──►  OpenRouter images
                                             (google/gemini-3.1-flash-image)
                                             the same customer, new hairstyle
```

Both calls go through the `openai` SDK pointed at `https://openrouter.ai/api/v1`
— OpenRouter speaks the OpenAI wire format, so only the base URL, the key and
the model IDs differ. Provider config lives in `openrouter.py`.

## Run it

```bash
cp .env.example .env          # then put a real OPENROUTER_API_KEY in it
uv sync                       # or: pip install -r requirements.txt
python main.py                # http://localhost:8001  ·  docs at /docs
```

The frontend calls this service straight from the browser, so its origin must be
in `CORS_ORIGINS` (the Vite dev server, `http://localhost:5174`, is allowed by
default). Point the app at the service with `VITE_AI_API_URL` in
`services/frontend/.env.local`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness, configured models, whether a key is present |
| `POST` | `/analyze` | Read a photo — or up to 8 angles of one head → face/hair profile + hairstyle recommendations |
| `POST` | `/generate` | Photo + one chosen hairstyle → edited photo of that person |
| `GET` | `/docs` | Swagger UI |

### `POST /analyze`

`multipart/form-data`: `image` (jpg/png/webp/gif, ≤ `MAX_UPLOAD_MB`), `gender`
(`male` \| `female` \| `unspecified`), `hair_length` (`short` \| `medium` \|
`long` \| `extra long` \| `unknown`), `occasion` (`casual` \| `formal` \|
`wedding` \| `party` \| `business` \| `date` \| `everyday`).

Optionally `extra_images` (repeated, up to `MAX_ANGLE_IMAGES` - 1 of them) and
`angles`, a CSV naming every photograph in order from `front`, `front_left`,
`left`, `back_left`, `back`, `back_right`, `right`, `front_right`. They all go
to the vision model in **one message**, so the answer describes one head: the
crown, the nape and the side profile become observations instead of guesses,
and `profile.crown_area` / `back_of_head` / `sides` / `nape` are filled in
rather than left blank.

Answers with the model's full analysis under `analysis`, plus the normalised
`recommendations` / `profile` / `summary` a client should render. Every
recommendation carries a stable `id` (`rec-1-textured-crop`) to send back to
`/generate`, a `compatibility_score` (does it suit the face) and a separate
`current_hair_fit` (could a barber cut it from the hair in the photo today).
Those are different questions, and a pick has to pass both: the model is asked
only for cuts achievable from the visible hair, and any it still returns with
`length_change: "longer"` is dropped here. The `profile` carries what was seen
on the head — `hair_length_observed`, `hair_length_category`,
`current_hairstyle`, `hairline` — for the render to stay under. Roughly 15–25 s.

### `POST /generate`

`multipart/form-data`: `image`, `hairstyle_name` (required), and optionally
`hairstyle_description`, `hairstyle_id`, `gender`, `hair_length`, `occasion`,
`face_shape`, `hair_texture`, `hair_color`, `hair_length_observed`,
`current_hairstyle`, `hairline`, `hair_density`, `beard_style`,
`hair_length_category`, `style_length`, `angle`, `style_reference` — everything
from `face_shape` on comes from an earlier `/analyze`, except `style_length`
(`short` | `medium` | `long`),
which is what the chosen style needs. The observed ones matter most: they are
what keeps the cut under the length that actually exists. When both
`hair_length_category` and `style_length` are sent and the style needs more
than the photo shows, the answer is `422 needs_more_length` and no model is
called — the prompt alone does not stop an image model from obeying a style
whose name says "shoulder-length".

Answers with the edited photo as base64 (`image.b64`, `image.mime_type`).
Roughly 20–60 s. The prompt is built in `hair_generate.py` and is written for a
try-on: change the hair, keep the person — and cut, never grow. The hair in the
photo is the ceiling; a style that needs more is rendered as the closest version
that hair can give, not with invented length.

## Errors

Every failure answers `{"detail": {"code": "...", "message": "..."}}`. The
`message` is safe to show; the `code` is what a client branches on.

| Status | Codes |
| --- | --- |
| 400 | `unsupported_type`, `invalid_image`, `empty_image`, `image_too_small` |
| 413 | `image_too_large` |
| 422 | `invalid_hairstyle`, `needs_more_length`, `content_blocked`, `generation_failed` |
| 429 | `rate_limited` |
| 502 | `analysis_failed`, `provider_unreachable`, `no_recommendations`, `empty_result` |
| 503 | `provider_unconfigured`, `model_unavailable` |
| 504 | `provider_timeout` |

## Files

| File | What it does |
| --- | --- |
| `main.py` | FastAPI app: routing, upload limits, CORS, error shape |
| `openrouter.py` | Provider config: key, base URL, models, client factory |
| `hair_code.py` | Analysis: prompt, schema, chat call, client-facing view. One photo or a whole ring |
| `hair_generate.py` | Try-on render: prompt, image edit call, provider errors |
| `image_io.py` | Decode/validate/orient/shrink an upload, shared by both endpoints |
| `hair_analysis_final.py` | Standalone CLI for the analysis, not used by the API |

## Notes

- **One haircut, all the way round.** A 360 preview is several renders, and four
  independent calls given the same words produce four different haircuts —
  "low fade" is a range, and nothing makes one call's fade land where another's
  did. So the client renders the **front first** and sends that render back as
  a second `input_references` entry for every other angle, with `angle` saying
  which view this one is. The prompt names the two references and takes only
  the cut from the second: same top length, same fade height and gradient, same
  parting, same neckline. Back views are also told that no face is visible and
  none should become visible — told to preserve a face it cannot see, a model
  will rotate the head until there is one.
- **A haircut only removes hair.** Both prompts are built around it. `/analyze`
  is asked, as a barber would be, for cuts achievable today from the visible
  hair (`current_hair_fit`, `length_change`), and `/generate` is told the photo
  sets the maximum length everywhere on the head, the hairline stays where it
  is, and density stays what it is. The old brief said the requested style
  "decides the final length", which licensed the model to paint on hair the
  customer does not have.
- **Identity preservation** is down to the image model. OpenRouter has no
  `input_fidelity` parameter (the OpenAI-only knob this service used before),
  so `OPENROUTER_IMAGE_MODEL` must be a model that *edits* the reference photo
  rather than re-generating from it. `google/gemini-3.1-flash-image` is the
  default; `google/gemini-3-pro-image` is better and roughly 4x the price.
- **`POST /generate` does not use `client.images.edit()`.** OpenRouter has no
  OpenAI-compatible image-edit route; the photo goes to `POST /api/v1/images` as
  an `input_references` data URL. The call still goes through the SDK client, so
  auth, timeouts and the exception classes are the same as everywhere else.
- **Rendering hints are best-effort.** Support for `quality`, `output_format`
  and `aspect_ratio` varies by model: anything the model rejects is dropped and
  the request retried without it, and a render that comes back in the wrong
  format is re-encoded to `OPENROUTER_IMAGE_OUTPUT_FORMAT` before it is
  returned. `image.mime_type` and `image.size` always describe what you got.
- **Nothing is stored.** `/analyze` writes one temp file and deletes it in a
  `finally`; `/generate` keeps the photo in memory. There is no database, no
  object storage and no request log of image content.
- **Cost** is roughly one vision call per analysis and one image edit per
  render; the render is much the larger of the two.
