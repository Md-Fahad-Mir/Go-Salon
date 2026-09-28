import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '../components/auth/BrandMark';
import { LinkButton } from '../components/common/Button';
import { Screen } from '../components/layout/Screen';
import { ROUTES } from '../constants';
import { useT } from '../hooks/useLanguage';

const VIDEO_SRC = '/media/welcome-hairstyle.mp4';
/* The first frame of the clip, same 720×1280 canvas, so the crop in auth.css
   frames it identically. Shown until the video can play, when autoplay is
   refused (iOS Low Power Mode) and for anyone who asked for reduced motion. */
const POSTER_SRC = '/media/welcome-hairstyle-poster.jpg';
/* The clip ends on the finished cut and starts on the untouched one, so a bare
   `loop` jumps. Dimming through the last stretch hides the seam in the dark. */
const LOOP_FADE_SECONDS = 0.6;

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The splash: the try-on film behind the brand, the promise, and two ways in. */
export default function WelcomePage() {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [still] = useState(prefersReducedMotion);
  const [seam, setSeam] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || still) return;
    /* React sets `muted` as a property only; iOS decides autoplay from the
       attribute, so set both before asking to play. A refusal leaves the
       poster, which is the right fallback. */
    video.muted = true;
    video.setAttribute('muted', '');
    void video.play?.()?.catch(() => undefined);
  }, [still]);

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    setSeam(video.currentTime > video.duration - LOOP_FADE_SECONDS);
  };

  return (
    <Screen>
      {/* Always in the night palette: the ink sits on film, not on the page. */}
      <div className="auth-welcome dark-theme">
        <div className="auth-welcome-bg" aria-hidden="true">
          <video
            ref={videoRef}
            className="auth-welcome-video"
            data-seam={seam ? 'true' : undefined}
            src={VIDEO_SRC}
            poster={POSTER_SRC}
            autoPlay={!still}
            muted
            loop
            playsInline
            preload={still ? 'none' : 'auto'}
            disablePictureInPicture
            disableRemotePlayback
            tabIndex={-1}
            onTimeUpdate={onTimeUpdate}
          />
        </div>

        <div className="auth-welcome-body">
          <div className="auth-welcome-intro">
            <BrandMark size="xl" />
            <h1 className="display">{t('app.tagline')}</h1>
            <p className="auth-welcome-sub">{t('auth.welcomeSub')}</p>
          </div>

          <div className="stack-sm auth-welcome-actions">
            <LinkButton to={ROUTES.register} block size="lg">
              {t('auth.getStarted')}
            </LinkButton>
            <LinkButton to={ROUTES.login} variant="ghost" block>
              {t('auth.haveAccount')}
            </LinkButton>
          </div>
        </div>
      </div>
    </Screen>
  );
}
