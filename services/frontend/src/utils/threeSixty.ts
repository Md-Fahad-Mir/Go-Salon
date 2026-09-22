/* Rendering one haircut all the way round a head.

   The problem this solves: four independent calls to an image model, each
   given the same words, produce four different haircuts. "Low fade" is a range,
   and nothing makes one call's fade land at the same height as another's.

   The fix is to render the front first and then hand that render back to the
   model as a *second reference* for every other angle — so the other views are
   matched against a picture of the finished cut rather than against a
   description of it. The AI service puts the two references in one request and
   tells the model which is which; see `_STYLE_REFERENCE_BLOCK` in
   `services/ai/hair_generate.py`.

   The front therefore has to finish before anything else starts. The rest then
   run together, because they only depend on it and not on each other. */

import type { CapturedAngle, GeneratedView, HeadAngle, TryOnStyle } from '../types';
import { api } from './api';
import { ApiError } from './apiError';
import type { GenerateInput } from './aiService';
import { PREVIEW_ANGLES, REQUIRED_ANGLE, inRingOrder } from './angles';
import { photoStore } from './storage';

export type RingContext = Omit<
  GenerateInput,
  'hairstyleId' | 'hairstyleName' | 'hairstyleDescription' | 'angle' | 'styleReference' | 'styleLength'
>;

export interface RingProgress {
  done: number;
  total: number;
  angle: HeadAngle;
}

/** Which of the captured views a preview is actually rendered for.

    The intersection of the ring the customer captured and the four the viewer
    shows — always including the front, which everything else is matched to.
    Capturing all eight buys a better *reading*; it does not buy eight renders,
    because each one is a separate call the customer waits and pays for. */
export const anglesToRender = (captured: CapturedAngle[]): CapturedAngle[] => {
  const wanted = new Set<HeadAngle>(PREVIEW_ANGLES);
  const chosen = captured.filter((view) => wanted.has(view.angle));
  const ordered = inRingOrder(chosen);
  // Front first: it is the reference every other render is matched against.
  return [
    ...ordered.filter((view) => view.angle === REQUIRED_ANGLE),
    ...ordered.filter((view) => view.angle !== REQUIRED_ANGLE),
  ];
};

interface RenderRingInput {
  captured: CapturedAngle[];
  style: TryOnStyle;
  context: RingContext;
  /** Key under which each render is stored, so the caller owns the naming. */
  keyFor: (angle: HeadAngle) => string;
  onProgress?: (progress: RingProgress) => void;
}

/** Render the chosen style on every view worth rendering, consistently. */
export async function renderRing({
  captured,
  style,
  context,
  keyFor,
  onProgress,
}: RenderRingInput): Promise<GeneratedView[]> {
  const targets = anglesToRender(captured);
  const front = targets[0];
  if (!front || front.angle !== REQUIRED_ANGLE) {
    throw new ApiError('missing_front', 'The front view is missing from this capture.');
  }

  const total = targets.length;
  let finished = 0;
  const announce = (angle: HeadAngle) => {
    finished += 1;
    onProgress?.({ done: finished, total, angle });
  };

  const sourceOf = async (view: CapturedAngle): Promise<Blob> => {
    const blob = await photoStore.get(view.photoKey);
    if (!blob) throw new ApiError('missing_photo', 'The photo is no longer on this device.');
    return blob;
  };

  const renderOne = async (view: CapturedAngle, reference?: Blob): Promise<GeneratedView> => {
    const source = await sourceOf(view);
    const render = await api.tryOn.generate(source, style, {
      ...context,
      angle: view.angle,
      styleReference: reference,
    });
    const resultKey = keyFor(view.angle);
    await photoStore.put(resultKey, render.blob);
    announce(view.angle);
    return { angle: view.angle, sourceKey: view.photoKey, resultKey };
  };

  // 1. The front, alone — it is what the rest are matched to.
  const frontView = await renderOne(front);
  const frontRender = await photoStore.get(frontView.resultKey);

  // 2. Everything else, together. One angle failing does not lose the others:
  //    a preview of three sides is worth more than an error.
  const rest = await Promise.all(
    targets.slice(1).map(async (view) => {
      try {
        return await renderOne(view, frontRender);
      } catch {
        announce(view.angle);
        return null;
      }
    }),
  );

  return inRingOrder([frontView, ...rest.filter((view): view is GeneratedView => view !== null)]);
}
