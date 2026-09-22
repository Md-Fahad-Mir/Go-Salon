/* Canvas-based image helpers — no library needed.
   `compressImage` resizes to a bounding box and re-encodes as JPEG so a
   12 MP selfie becomes ~150 KB before it is stored or "sent". */

export const readAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that image.'));
    image.src = src;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image.'))),
      'image/jpeg',
      quality,
    );
  });

export interface CompressOptions {
  maxSize?: number; // longest edge, px
  quality?: number; // 0–1
  targetBytes?: number;
}

export const compressImage = async (
  source: Blob,
  { maxSize = 1024, quality = 0.86, targetBytes = 1024 * 1024 }: CompressOptions = {},
): Promise<Blob> => {
  const url = URL.createObjectURL(source);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    let q = quality;
    let blob = await canvasToBlob(canvas, q);
    while (blob.size > targetBytes && q > 0.5) {
      q -= 0.1;
      blob = await canvasToBlob(canvas, q);
    }
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Square centre-crop for avatars. */
export const cropSquare = async (source: Blob, size = 320): Promise<Blob> => {
  const url = URL.createObjectURL(source);
  try {
    const image = await loadImage(url);
    const edge = Math.min(image.width, image.height);
    const sx = (image.width - edge) / 2;
    const sy = (image.height - edge) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(image, sx, sy, edge, edge, 0, 0, size, size);
    return canvasToBlob(canvas, 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Rough "is there a face-sized bright region" check using luminance
    variance. Not a face detector — it only catches blank or pitch-dark
    frames so the mock can ask for a clearer photo. */
export const looksLikeAPortrait = async (source: Blob): Promise<boolean> => {
  const url = URL.createObjectURL(source);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    ctx.drawImage(image, 0, 0, 32, 32);
    const { data } = ctx.getImageData(0, 0, 32, 32);
    let sum = 0;
    let sumSq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += l;
      sumSq += l * l;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    return mean > 18 && mean < 240 && variance > 120;
  } catch {
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
};
