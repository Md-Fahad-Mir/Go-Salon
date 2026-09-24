/* A camera for jsdom, which has none.

   `useCamera` is the only camera integration in the app and had no tests
   before this, so this is the first stub of its kind — kept here rather than
   inline so the next screen that opens a camera does not invent a second one.

   Four things have to be faked, and each is a real gap in jsdom rather than a
   convenience: `getUserMedia` does not exist, a `<video>` never reports a
   size, `getContext('2d')` returns null, and `requestAnimationFrame` would
   run on a clock no test can wait for. */

import { vi } from 'vitest';

export type CameraOutcome = 'granted' | 'denied' | 'unsupported' | 'error';

const track = () => ({ stop: vi.fn() });

/** Installs a camera. Returns the fake stream's tracks, so a test can assert
    the app let go of the camera when it was done with it. */
export function fakeCamera(outcome: CameraOutcome = 'granted') {
  const tracks = [track()];

  if (outcome === 'unsupported') {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
    return { tracks };
  }

  const getUserMedia = vi.fn(async () => {
    if (outcome === 'denied') {
      const error = new Error('denied');
      error.name = 'NotAllowedError';
      throw error;
    }
    if (outcome === 'error') throw new Error('no camera');
    return { getTracks: () => tracks } as unknown as MediaStream;
  });

  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
  return { tracks, getUserMedia };
}

/** A `<video>` that reports a size and plays, and a canvas that can be read.
    Without both, the decode loop has nothing to look at. */
export function fakeVideoAndCanvas(size = 640) {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(size);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(size);

  const imageData = { data: new Uint8ClampedArray(size * size * 4), width: size, height: size };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => imageData),
  } as unknown as CanvasRenderingContext2D);
}

/** Runs the decode loop by hand. `requestAnimationFrame` in jsdom is tied to a
    timer, and a test that waits for one is a test that waits. This calls back
    a bounded number of times and then stops, so a scanner that never finds
    anything ends the test instead of hanging it. */
export function fakeAnimationFrames(limit = 3) {
  let calls = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    if (calls++ >= limit) return 0;
    queueMicrotask(() => cb(0));
    return calls;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
}
