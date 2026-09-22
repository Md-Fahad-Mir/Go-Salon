/* Transport for the hair-AI service (services/ai, FastAPI).

   The browser talks to it directly — there is no backend in between — so this
   module owns the base URL, the timeouts, the multipart bodies and the
   snake_case → camelCase mapping. Everything it throws is an `ApiError` with a
   `code` the UI can branch on; the server's English `message` is kept only as a
   fallback for codes the UI has no copy for. */

import type {
  Gender,
  HairLength,
  HairProfile,
  HairstyleRecommendation,
  HeadAngle,
  MaintenanceLevel,
  Occasion,
  StylingDifficulty,
  TryOnAnalysis,
  TryOnRender,
} from '../types';
import { ApiError } from './apiError';

export const AI_BASE_URL = import.meta.env.VITE_AI_API_URL.replace(/\/+$/, '');

/* Both calls are slow by nature: analysis is a vision round trip (~15–25 s) and
   generation is an image edit (~20–60 s). The ceilings are generous enough that
   a normal request never trips them, and low enough that the UI is not stuck
   forever when the provider stalls. */
const ANALYZE_TIMEOUT_MS = 120_000;
const GENERATE_TIMEOUT_MS = 300_000;

/** The service's error envelope: `{"detail": {"code", "message"}}`, or FastAPI's
    own validation shape when the request never reached our handlers. */
interface ErrorEnvelope {
  detail?: string | { code?: string; message?: string } | Array<{ msg?: string; loc?: unknown[] }>;
}

interface RawRecommendation {
  id?: string;
  name?: string;
  description?: string;
  why_it_suits?: string;
  compatibility_score?: number;
  current_hair_fit?: number | null;
  length_change?: string;
  styling_difficulty?: string;
  maintenance_level?: string;
  styling_tips?: string[];
  suitability?: string;
}

interface RawProfile {
  face_shape?: string;
  face_shape_confidence?: number;
  hair_texture?: string;
  hair_density?: string;
  hair_length_observed?: string;
  hair_length_category?: string;
  current_hairstyle?: string;
  hairline?: string;
  head_shape?: string;
  crown_area?: string;
  back_of_head?: string;
  sides?: string;
  nape?: string;
  thinning?: string;
  scalp_visibility?: string;
  hair_health_score?: number;
  hair_color?: string;
  skin_tone?: string;
  undertone?: string;
  has_beard?: boolean;
  beard_style?: string;
}

interface RawAnalyzeResponse {
  recommendations?: RawRecommendation[];
  profile?: RawProfile;
  summary?: string;
  meta?: { model?: string; image_count?: number; angles?: string[] };
}

interface RawGenerateResponse {
  hairstyle?: { id?: string; name?: string; description?: string };
  image?: { b64?: string; mime_type?: string; size?: string };
  meta?: { model?: string; latency_ms?: number };
}

export interface AnalyzeInput {
  gender: Gender | 'unspecified';
  hairLength: HairLength | 'unknown';
  occasion: Occasion | 'everyday';
}

/** One captured view on its way to the service. */
export interface AnglePhoto {
  angle: HeadAngle;
  photo: Blob;
}

export interface GenerateInput {
  hairstyleId: string;
  hairstyleName: string;
  hairstyleDescription: string;
  gender?: Gender | 'unspecified';
  hairLength?: HairLength | 'unknown';
  occasion?: Occasion | 'everyday';
  faceShape?: string;
  hairTexture?: string;
  hairColor?: string;
  /* What the analysis saw on the head. These set the ceiling the render
     must stay under, so they matter more to it than the three above. */
  hairLengthObserved?: string;
  currentHairstyle?: string;
  hairline?: string;
  hairDensity?: string;
  beardStyle?: string;
  /* The photo's length bucket and the bucket the style needs. When the
     service has both and the style needs more, it answers 422
     `needs_more_length` without calling a model — a cut cannot add hair. */
  hairLengthCategory?: string;
  styleLength?: HairLength;
  /* 360 only: which view this photo is, and the front render to match the cut
     against. Without the reference every angle re-invents the haircut. */
  angle?: HeadAngle;
  styleReference?: Blob;
}

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const score = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
};

const DIFFICULTIES: StylingDifficulty[] = ['easy', 'moderate', 'hard'];
const LEVELS: MaintenanceLevel[] = ['low', 'medium', 'high'];
const LENGTH_CHANGES: NonNullable<HairstyleRecommendation['lengthChange']>[] = ['shorter', 'same', 'longer'];
const LENGTH_CATEGORIES: NonNullable<HairProfile['hairLengthCategory']>[] = [
  'very_short', 'short', 'medium', 'long', 'extra_long',
];

/** A score the service may not have given: absent stays absent, never 0. */
const optionalScore = (value: unknown): number | undefined =>
  value === undefined || value === null || value === '' ? undefined : score(value);

const oneOf = <T extends string>(value: unknown, allowed: T[], fallback: T): T => {
  const candidate = text(value).toLowerCase() as T;
  return allowed.includes(candidate) ? candidate : fallback;
};

/** Reads the failure out of a response body, whatever shape it came in. */
const errorFrom = async (response: Response): Promise<ApiError> => {
  let code = 'server_error';
  let message = 'The AI service could not complete that request.';
  try {
    const body = (await response.json()) as ErrorEnvelope;
    const detail = body.detail;
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      code = 'invalid_request';
      message = text(detail[0]?.msg, message);
    } else if (detail) {
      code = text(detail.code, code);
      message = text(detail.message, message);
    }
  } catch {
    /* A gateway or proxy can answer with HTML; the status is all we get. */
  }
  if (code === 'server_error' && response.status >= 400 && response.status < 500) {
    code = 'invalid_request';
  }
  return new ApiError(code, message, response.status);
};

async function postForm<T>(path: string, body: FormData, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${AI_BASE_URL}${path}`, {
      method: 'POST',
      body,
      signal: controller.signal,
    });
  } catch (error) {
    // An aborted fetch and an unreachable host both land here; only the first
    // is the user's patience running out.
    if ((error as DOMException)?.name === 'AbortError') {
      throw new ApiError('timeout', 'The AI service took too long to answer.');
    }
    throw new ApiError('network', 'The AI service could not be reached.');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw await errorFrom(response);

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('invalid_response', 'The AI service sent something we could not read.', response.status);
  }
}

const mapRecommendation = (raw: RawRecommendation, index: number): HairstyleRecommendation => ({
  id: text(raw.id, `rec-${index + 1}`),
  name: text(raw.name),
  description: text(raw.description),
  whyItSuits: text(raw.why_it_suits),
  compatibilityScore: score(raw.compatibility_score),
  currentHairFit: optionalScore(raw.current_hair_fit),
  lengthChange: oneOf(raw.length_change, LENGTH_CHANGES, ''),
  stylingDifficulty: oneOf(raw.styling_difficulty, DIFFICULTIES, 'moderate'),
  maintenanceLevel: oneOf(raw.maintenance_level, LEVELS, 'medium'),
  stylingTips: Array.isArray(raw.styling_tips) ? raw.styling_tips.map((tip) => text(tip)).filter(Boolean) : [],
  suitability: text(raw.suitability, 'both'),
});

const mapProfile = (raw: RawProfile | undefined): HairProfile => ({
  faceShape: text(raw?.face_shape),
  faceShapeConfidence: score(raw?.face_shape_confidence),
  hairTexture: text(raw?.hair_texture),
  hairDensity: text(raw?.hair_density),
  hairLengthObserved: text(raw?.hair_length_observed),
  hairLengthCategory: oneOf(raw?.hair_length_category, LENGTH_CATEGORIES, ''),
  currentHairstyle: text(raw?.current_hairstyle),
  hairline: text(raw?.hairline),
  headShape: text(raw?.head_shape),
  crownArea: text(raw?.crown_area),
  backOfHead: text(raw?.back_of_head),
  sides: text(raw?.sides),
  nape: text(raw?.nape),
  thinning: text(raw?.thinning),
  scalpVisibility: text(raw?.scalp_visibility),
  hairHealthScore: score(raw?.hair_health_score),
  hairColor: text(raw?.hair_color),
  skinTone: text(raw?.skin_tone),
  undertone: text(raw?.undertone),
  hasBeard: Boolean(raw?.has_beard),
  beardStyle: text(raw?.beard_style),
});

/** `POST /analyze` — read the photo, come back with hairstyles that suit it.

    `angles` turns it into a 360 read: every captured view goes up in the same
    request and the service sends them to the vision model as one message, so
    the answer describes one head rather than N of them. Leaving it out is the
    single-photo call this has always been. */
export async function analyzePhoto(
  photo: Blob,
  input: AnalyzeInput,
  photoKey: string,
  angles?: AnglePhoto[],
): Promise<TryOnAnalysis> {
  const form = new FormData();
  form.append('image', photo, 'photo.jpg');
  form.append('gender', input.gender);
  form.append('hair_length', input.hairLength);
  form.append('occasion', input.occasion);

  /* The front view is `image`; the rest ride along as `extra_images`, and
     `angles` names all of them in the same order. */
  if (angles?.length) {
    const [first, ...rest] = angles;
    form.set('image', first.photo, `${first.angle}.jpg`);
    rest.forEach((view) => form.append('extra_images', view.photo, `${view.angle}.jpg`));
    form.append('angles', angles.map((view) => view.angle).join(','));
  }

  const raw = await postForm<RawAnalyzeResponse>('/analyze', form, ANALYZE_TIMEOUT_MS);
  const recommendations = (raw.recommendations ?? [])
    .map(mapRecommendation)
    .filter((item) => Boolean(item.name));

  if (!recommendations.length) {
    throw new ApiError('no_recommendations', 'The AI did not suggest any hairstyles for that photo.');
  }

  return {
    recommendations,
    profile: mapProfile(raw.profile),
    summary: text(raw.summary),
    model: text(raw.meta?.model, 'unknown'),
    // What the service says it actually read, not what we hoped it would.
    angles: (raw.meta?.angles ?? []).filter(Boolean) as HeadAngle[],
    photoKey,
    createdAt: new Date().toISOString(),
  };
}

/** `POST /generate` — the customer's own photo, wearing the chosen style. */
export async function generateHairstyle(photo: Blob, input: GenerateInput): Promise<TryOnRender> {
  const form = new FormData();
  form.append('image', photo, 'photo.jpg');
  form.append('hairstyle_name', input.hairstyleName);
  form.append('hairstyle_description', input.hairstyleDescription);
  form.append('hairstyle_id', input.hairstyleId);
  // Context is optional on the wire: send only what the analysis actually knew.
  if (input.gender) form.append('gender', input.gender);
  if (input.hairLength) form.append('hair_length', input.hairLength);
  if (input.occasion) form.append('occasion', input.occasion);
  if (input.faceShape) form.append('face_shape', input.faceShape);
  if (input.hairTexture) form.append('hair_texture', input.hairTexture);
  if (input.hairColor) form.append('hair_color', input.hairColor);
  if (input.hairLengthObserved) form.append('hair_length_observed', input.hairLengthObserved);
  if (input.currentHairstyle) form.append('current_hairstyle', input.currentHairstyle);
  if (input.hairline) form.append('hairline', input.hairline);
  if (input.hairDensity) form.append('hair_density', input.hairDensity);
  if (input.beardStyle) form.append('beard_style', input.beardStyle);
  if (input.hairLengthCategory) form.append('hair_length_category', input.hairLengthCategory);
  if (input.styleLength) form.append('style_length', input.styleLength);
  if (input.angle) form.append('angle', input.angle);
  if (input.styleReference) form.append('style_reference', input.styleReference, 'front.jpg');

  const raw = await postForm<RawGenerateResponse>('/generate', form, GENERATE_TIMEOUT_MS);
  const b64 = text(raw.image?.b64);
  if (!b64) {
    throw new ApiError('invalid_response', 'The AI service returned no image.');
  }

  return {
    blob: base64ToBlob(b64, text(raw.image?.mime_type, 'image/jpeg')),
    model: text(raw.meta?.model, 'unknown'),
    latencyMs: Number(raw.meta?.latency_ms) || 0,
  };
}

/** Decodes the rendered image so it can go straight into IndexedDB. */
function base64ToBlob(b64: string, mimeType: string): Blob {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  } catch {
    throw new ApiError('invalid_response', 'The generated image could not be decoded.');
  }
}
