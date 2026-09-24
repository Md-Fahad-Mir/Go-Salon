import { CameraOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { ROUTES } from '../../constants';
import { useCamera } from '../../hooks/useCamera';
import { useT } from '../../hooks/useLanguage';
import { joinTokenFrom } from '../../utils/joinCode';

/** How long a "that is not a salon code" notice stays up before the scanner
    stops mentioning it. Long enough to read, short enough that a second
    attempt is not shouted at. */
const NOTICE_MS = 2500;

/* The in-app scanner: point the camera at a salon's code and be joined.

   WHAT IT DOES NOT DO

   It does not join. It captures a token and hands it to `/join/:token` — the
   same screen a phone's own camera app opens when it resolves the QR. That is
   a stronger guarantee than sharing a function would be: there is no second
   join path to keep in step, because there is no second join. Everything
   after the token — the POST, becoming the active salon, the success card,
   the way into booking — happens in exactly one place.

   `replace`, so Back from the join does not return to a live camera.

   The camera itself is `useCamera('environment')`, unchanged: it already
   handles the permission prompt, a refusal, a browser with no `getUserMedia`
   and the rear-facing default, and stops its tracks on unmount. Decoding is
   the only thing added here — a frame onto a canvas and `jsQR` over the
   pixels, which is all a QR reader is. */
export default function ScanJoinPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { videoRef, status, start, stop } = useCamera('environment');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  /** Set once a code has been accepted, so a second frame of the same code
      cannot navigate twice while the first navigation is still settling. */
  const takenRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reject = useCallback(
    (message: string) => {
      setNotice(message);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
    },
    [],
  );

  /** One frame: draw it, read it, decide. */
  const readFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = canvas;

    if (takenRef.current || !video || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const found = jsQR(pixels.data, pixels.width, pixels.height);
    if (!found) return;

    const token = joinTokenFrom(found.data);
    if (token === null) {
      // A poster, a wifi code, a payment QR. Say so and keep looking — going
      // quiet here is indistinguishable from the camera not working.
      reject(t('tenant.scanNotOurs'));
      return;
    }

    takenRef.current = true;
    stop();
    navigate(ROUTES.join(token), { replace: true });
  }, [navigate, reject, stop, t, videoRef]);

  useEffect(() => {
    void start();
    return stop;
  }, [start, stop]);

  useEffect(() => {
    if (status !== 'live') return;
    let running = true;
    const tick = () => {
      if (!running) return;
      readFrame();
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [status, readFrame]);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  /* The camera's own failure states, told apart the way `useCamera` already
     tells them apart. Both offer the same way out, and it is a real one: the
     phone's camera app reads the very same code and opens the app at the join
     screen, so a refused permission is an inconvenience rather than a wall.

     Back means Settings, because Settings is where this screen is opened from.
     The Home target it used to have came from the days when Home listed the
     salons and offered the scanner under them; now it would throw somebody out
     of the place they were standing in.

     And it goes back the way the header's own arrow does — by popping — rather
     than by pushing Settings on top. A pushed Settings has this screen
     underneath it, so its Back arrow would land straight back on a camera that
     is still refused, and round again. Only a cold load, with nothing to pop,
     replaces this screen with Settings instead. */
  const leave = () =>
    location.key !== 'default' ? navigate(-1) : navigate(ROUTES.profileSettings, { replace: true });
  const blocked = status === 'denied' || status === 'unsupported' || status === 'error';

  return (
    <Screen>
      <Header title={t('tenant.scanTitle')} close backTo={ROUTES.profileSettings} />
      <ScreenBody className={blocked ? 'fullscreen-center' : undefined}>
        {blocked ? (
          <EmptyState
            icon={<CameraOff size={26} aria-hidden="true" />}
            tone="warning"
            title={
              status === 'denied' ? t('tenant.scanDeniedTitle') : t('tenant.scanUnsupportedTitle')
            }
            description={
              status === 'denied' ? t('tenant.scanDeniedBody') : t('tenant.scanUnsupportedBody')
            }
            action={
              <Button onClick={leave}>{t('tenant.backToSettings')}</Button>
            }
          />
        ) : (
          <div className="stack">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              aria-label={t('tenant.scanCameraLabel')}
            />
            <p className="small muted">
              {status === 'live' ? t('tenant.scanHint') : t('tenant.scanStarting')}
            </p>
            {/* Announced rather than only shown: somebody pointing a phone at a
                poster is not looking at the caption under the viewfinder. */}
            <p role="status" aria-live="polite" className="small">
              {notice ?? ''}
            </p>
          </div>
        )}
      </ScreenBody>
    </Screen>
  );
}
