/* Is this frame worth sending to the AI?

   Three cheap reads off a downscaled canvas — no library, no model, no network:
   how bright it is, how much detail it holds, and (where the browser has a face
   detector) whether a face is there and whether there is exactly one.

   The point is not to grade photographs. It is to catch the four frames that
   are certainly useless — a dark room, a blown-out window, a smeared frame from
   a moving phone, a lens cap — before the customer waits thirty seconds to be
   told the AI could not read them.

   Per-angle, because "no face" is a defect at the front and the expected answer
   from behind. A back-of-head shot that failed a face check would be rejected
   for being exactly what it should be. */

import { angleSpec } from './angles';
import { loadImage } from './image';
import type { HeadAngle } from '../types';

export type CaptureProblem = 'dark' | 'bright' | 'blurry' | 'flat' | 'no_face' | 'many_faces' | 'unreadable';

export interface CaptureAssessment {
  ok: boolean;
  problem?: CaptureProblem;
}

const SIZE = 96;

/* Windows chosen to reject only the certainly-unusable. A correctly exposed
   indoor selfie sits near 110; a lit face in daylight near 160. */
const MIN_MEAN = 30;
const MAX_MEAN = 232;
/** Luminance variance. A blank wall or a lens cap is flat; a head is not. */
const MIN_VARIANCE = 90;
/** Mean squared gradient — detail. A phone moved mid-capture smears below this. */
const MIN_SHARPNESS = 12;

interface Reads {
  mean: number;
  variance: number;
  sharpness: number;
}

const readPixels = (image: HTMLImageElement): Reads | null => {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  const luma = new Float32Array(SIZE * SIZE);
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < luma.length; i += 1) {
    const p = i * 4;
    const l = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
    luma[i] = l;
    sum += l;
    sumSq += l * l;
  }
  const mean = sum / luma.length;

  /* Detail as the mean squared difference between neighbouring pixels — the
     cheap stand-in for a Laplacian, and enough to separate "smeared" from
     "sharp" at this size. */
  let gradient = 0;
  let counted = 0;
  for (let y = 1; y < SIZE - 1; y += 1) {
    for (let x = 1; x < SIZE - 1; x += 1) {
      const i = y * SIZE + x;
      const dx = luma[i + 1] - luma[i - 1];
      const dy = luma[i + SIZE] - luma[i - SIZE];
      gradient += dx * dx + dy * dy;
      counted += 1;
    }
  }
  return {
    mean,
    variance: sumSq / luma.length - mean * mean,
    sharpness: counted ? gradient / counted : 0,
  };
};

/** Faces, where the browser can count them.

    `FaceDetector` is Chromium-only. Everywhere else this returns null and the
    caller simply does not apply a face rule — a check we cannot run is not a
    failure, and refusing a good photo because Safari has no detector would be
    worse than letting the AI answer. */
const countFaces = async (image: HTMLImageElement): Promise<number | null> => {
  const Detector = (window as unknown as {
    FaceDetector?: new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
      detect: (source: CanvasImageSource) => Promise<unknown[]>;
    };
  }).FaceDetector;
  if (!Detector) return null;
  try {
    const faces = await new Detector({ fastMode: true, maxDetectedFaces: 5 }).detect(image);
    return faces.length;
  } catch {
    return null;
  }
};

/** Judge one captured frame for one angle. */
export async function assessCapture(source: Blob, angle: HeadAngle): Promise<CaptureAssessment> {
  const url = URL.createObjectURL(source);
  try {
    const image = await loadImage(url);
    const reads = readPixels(image);
    // No canvas means no reads; that is not the customer's problem, so the
    // frame goes through and the AI gets the last word.
    if (!reads) return { ok: true };

    if (reads.mean < MIN_MEAN) return { ok: false, problem: 'dark' };
    if (reads.mean > MAX_MEAN) return { ok: false, problem: 'bright' };
    if (reads.variance < MIN_VARIANCE) return { ok: false, problem: 'flat' };
    if (reads.sharpness < MIN_SHARPNESS) return { ok: false, problem: 'blurry' };

    const faces = await countFaces(image);
    if (faces !== null) {
      if (faces > 1) return { ok: false, problem: 'many_faces' };
      if (faces === 0 && angleSpec(angle).expectsFace) return { ok: false, problem: 'no_face' };
    }
    return { ok: true };
  } catch {
    return { ok: false, problem: 'unreadable' };
  } finally {
    URL.revokeObjectURL(url);
  }
}
