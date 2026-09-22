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
  `eureka-${slug(generation.hairstyleName) || 'look'}.jpg`;

/** Saves the rendered result to the device. False when the blob is gone. */
export async function downloadGeneration(generation: AIGeneration): Promise<boolean> {
  const blob = await photoStore.get(generation.resultKey);
  if (!blob) return false;
  downloadBlob(fileNameFor(generation), blob);
  return true;
}

export type ShareOutcome = 'shared' | 'copied' | 'failed' | 'missing';

/** Shares the photo itself where the platform allows files, otherwise the text.
    The caller passes its `t` so the shared caption follows the app language. */
export async function shareGeneration(generation: AIGeneration, t: TFunction): Promise<ShareOutcome> {
  const blob = await photoStore.get(generation.resultKey);
  if (!blob) return 'missing';
  const name = generation.hairstyleName;
  const title = t('tryon.shareTitle', { name });
  const text = t('tryon.shareText', { name });
  try {
    const file = new File([blob], fileNameFor(generation), { type: blob.type || 'image/jpeg' });
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
};

/** Which sentence to show for a failed analysis or generation. */
export const aiErrorKey = (error: unknown): TKey =>
  (error instanceof ApiError && ERROR_KEYS[error.code]) || 'tryon.errorGeneric';

/** Same, from a stored `ApiError.code` (the store keeps the code, not the Error). */
export const aiErrorKeyForCode = (code: string | null): TKey =>
  (code && ERROR_KEYS[code]) || 'tryon.errorGeneric';
