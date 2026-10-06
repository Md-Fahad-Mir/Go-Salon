/* The salon's own face in the middle of its join code.

   The server draws the code and nothing else — it has no image library, on
   purpose (see `qr_response`) — so the badge is composed here, on a canvas,
   into one PNG that is both what the screen shows and what "Save" hands over.
   The copy on the counter and the copy on the phone are the same picture.

   The server makes the code at error-correction level H, which reads through
   roughly 30% of it being covered. The badge is a fifth of the image's edge,
   about 6% of its area, so a phone camera never notices it is there.

   Anything that goes wrong here — no canvas, a logo that will not load —
   falls back to the plain code. A code without a logo still opens the door;
   a code that will not render does not. */

import { initialsOf } from './format';
import { loadImage } from './image';

/** Badge edge as a share of the image's. */
const BADGE = 0.2;
/** White frame around the logo, as a share of the badge. */
const FRAME = 0.1;
/** The server's PNG is about 500px; saved copies are scaled up, pixel for
    pixel, to at least this so a print stays sharp. */
const MIN_EDGE = 1024;
/** A logo hosted somewhere slow must not hold the code hostage: past this,
    the initials go on instead. */
const LOGO_WAIT_MS = 4000;

/** Fixed rather than read from the theme: this is a printed thing, and it
    should not come out differently for an owner who uses dark mode. */
const INK = '#1c1917';
const GOLD = '#e0b078';

export interface QrLogo {
  /** The business name — its initials stand in when there is no picture. */
  name: string;
  /** A data URL or an https link; anything else (an icon name) is ignored. */
  src?: string | null;
}

const isPicture = (src: string | null | undefined): src is string =>
  Boolean(src && /^(data:image\/|https?:\/\/)/.test(src));

const within = <T>(work: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    work,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('Timed out.')), ms)),
  ]);

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, edge: number, radius: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, edge, edge, radius);
};

const encode = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image.'))), 'image/png');
  });

/** Draws the logo (or the initials) into the square at x, y. */
const drawMark = async (ctx: CanvasRenderingContext2D, logo: QrLogo, x: number, y: number, edge: number) => {
  const radius = edge * 0.22;
  if (isPicture(logo.src)) {
    try {
      const picture = await within(
        loadImage(logo.src, logo.src.startsWith('http') ? 'anonymous' : undefined),
        LOGO_WAIT_MS,
      );
      const side = Math.min(picture.naturalWidth, picture.naturalHeight);
      ctx.save();
      roundedRect(ctx, x, y, edge, radius);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        picture,
        (picture.naturalWidth - side) / 2,
        (picture.naturalHeight - side) / 2,
        side,
        side,
        x,
        y,
        edge,
        edge,
      );
      ctx.restore();
      return;
    } catch {
      // A link that is gone, a host too slow to wait for, or one that will
      // not allow it on a canvas: the initials below are still the salon's.
    }
  }
  roundedRect(ctx, x, y, edge, radius);
  ctx.fillStyle = INK;
  ctx.fill();
  const display = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
  ctx.fillStyle = GOLD;
  ctx.font = `600 ${Math.round(edge * 0.42)}px ${display || 'serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initialsOf(logo.name).toUpperCase() || '·', x + edge / 2, y + edge / 2 + edge * 0.03);
};

/** The join code with the salon's logo set in its centre, as a PNG. */
export async function brandQr(code: Blob, logo: QrLogo): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return code;

  const url = URL.createObjectURL(code);
  try {
    const qr = await loadImage(url);
    const scale = Math.max(1, Math.ceil(MIN_EDGE / qr.naturalWidth));
    const size = qr.naturalWidth * scale;
    canvas.width = size;
    canvas.height = size;

    // Whole-pixel scaling with smoothing off: modules stay hard-edged squares.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, 0, 0, size, size);

    const badge = Math.round(size * BADGE);
    const at = Math.round((size - badge) / 2);
    roundedRect(ctx, at, at, badge, badge * 0.26);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const inset = Math.round(badge * FRAME);
    await drawMark(ctx, logo, at + inset, at + inset, badge - inset * 2);

    return await encode(canvas);
  } catch {
    return code;
  } finally {
    URL.revokeObjectURL(url);
  }
}
