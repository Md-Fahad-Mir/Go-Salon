import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'unsupported' | 'error';

export type CameraFacing = 'user' | 'environment';

/** Camera preview via getUserMedia, with a still capture to a JPEG Blob.
    No library: the whole thing is a <video> and a <canvas>.

    `facing` defaults to the front camera, which is every existing caller. The
    360 capture switches to the rear one for the back of the head — a selfie
    camera cannot photograph the back of the head of the person holding it. */
export function useCamera(facing: CameraFacing = 'user') {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string | undefined>();

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      setError('This browser cannot open the camera. Choose a photo instead.');
      return;
    }
    setStatus('starting');
    setError(undefined);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus('live');
    } catch (err) {
      const name = (err as DOMException)?.name;
      setStatus(name === 'NotAllowedError' ? 'denied' : 'error');
      setError(
        name === 'NotAllowedError'
          ? 'Camera access was turned off. You can allow it in browser settings, or choose a photo.'
          : 'Could not start the camera. Choose a photo instead.',
      );
    }
  }, [facing]);

  const capture = useCallback((): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || status !== 'live') return Promise.resolve(null);
    const canvas = document.createElement('canvas');
    const size = Math.min(video.videoWidth, video.videoHeight) || 720;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    // Mirror the front camera so the capture matches the preview the user
    // framed. The rear camera is not mirrored: it is pointed at the world, and
    // flipping it would put a parting on the wrong side of the head.
    if (facing === 'user') {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92));
  }, [status, facing]);

  useEffect(() => stop, [stop]);

  return { videoRef, status, error, start, stop, capture };
}
