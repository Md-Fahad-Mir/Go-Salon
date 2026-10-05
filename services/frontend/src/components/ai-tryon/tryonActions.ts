import type { AIGeneration } from '../../types';
import type { TFunction, TKey } from '../../i18n';
import { ApiError } from '../../utils/apiError';
import { downloadBlob, shareOrCopy } from '../../utils/share';
import { photoStore } from '../../utils/storage';

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const fileNameFor = (generation: AIGeneration): string =>
  `gosalon-${slug(generation.hairstyleName) || 'look'}${generation.videoKey ? '-360.mp4' : '.jpg'}`;

/** The result itself: the 360° clip when there is one, else the still. */
const resultBlob = (generation: AIGeneration): Promise<Blob | undefined> =>
  photoStore.get(generation.videoKey ?? generation.resultKey);

/** Every stored file a result owns — its still, its clip, and an older
    multi-angle result's other views — so deleting it orphans nothing. */
export const resultKeysOf = (generation: AIGeneration): string[] => [
  generation.resultKey,
  ...(generation.videoKey ? [generation.videoKey] : []),
  ...(generation.views ?? []).map((view) => view.resultKey),
];

/** The customer's own photos a result was made from. */
export const sourceKeysOf = (generation: AIGeneration): string[] => [
  generation.sourceKey,
  ...(generation.views ?? []).map((view) => view.sourceKey),
];

/** Saves the result to the device. False when the file is gone. */
export async function downloadGeneration(generation: AIGeneration): Promise<boolean> {
  const blob = await resultBlob(generation);
  if (!blob) return false;
  downloadBlob(fileNameFor(generation), blob);
  return true;
}

export type ShareOutcome = 'shared' | 'copied' | 'failed' | 'missing';

/** Shares the result itself where the platform allows files, otherwise the
    text. The caller passes its `t` so the shared caption follows the app
    language. */
export async function shareGeneration(generation: AIGeneration, t: TFunction): Promise<ShareOutcome> {
  const blob = await resultBlob(generation);
  if (!blob) return 'missing';
  const name = generation.hairstyleName;
  const title = t('tryon.shareTitle', { name });
  const text = t('tryon.shareText', { name });
  try {
    const type = blob.type || (generation.videoKey ? 'video/mp4' : 'image/jpeg');
    const file = new File([blob], fileNameFor(generation), { type });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    }
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') return 'failed';
  }
  return shareOrCopy({ title, text });
}

/** Generates the IndexedDB key for a fresh source photo. */
export const newPhotoKey = (): string =>
  `photo:${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36).padStart(3, '0')}`;

/* The AI service answers with a machine-readable `code`; its English `message`
   is for the logs. The customer reads our own copy, in their own language. */
const ERROR_KEYS: Record<string, TKey> = {
  network: 'tryon.errorNetwork',
  timeout: 'tryon.errorTimeout',
  provider_timeout: 'tryon.errorTimeout',
  rate_limited: 'tryon.errorBusy',
  provider_unreachable: 'tryon.errorBusy',
  provider_unconfigured: 'tryon.errorUnconfigured',
  model_unavailable: 'tryon.errorUnconfigured',
  invalid_image: 'tryon.errorPhoto',
  unsupported_type: 'tryon.errorPhoto',
  image_too_large: 'tryon.errorPhoto',
  image_too_small: 'tryon.errorPhoto',
  empty_image: 'tryon.errorPhoto',
  content_blocked: 'tryon.errorPhoto',
  no_recommendations: 'tryon.errorPhoto',
  needs_more_length: 'tryon.errorNeedsLength',
  /* The 360° video, through the backend. */
  ai_service_unreachable: 'tryon.errorBusy',
  ai_service_unconfigured: 'tryon.errorUnconfigured',
  hairstyle_unavailable: 'tryon.errorStyleGone',
  no_credits: 'tryon.errorNoCredits',
};

/** Which sentence to show for a failed try-on. */
export const aiErrorKey = (error: unknown): TKey =>
  (error instanceof ApiError && ERROR_KEYS[error.code]) || 'tryon.errorGeneric';
