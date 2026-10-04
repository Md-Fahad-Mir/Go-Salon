import { Orbit, Pause, Play, VideoOff } from 'lucide-react';
import { useRef, useState } from 'react';
import { useT } from '../../hooks/useLanguage';
import { usePhotoUrl } from '../../hooks/usePhotoUrl';
import { Art } from '../common/Art';
import { Badge } from '../common/Badge';
import { IconButton } from '../common/IconButton';
import { Spinner } from '../common/Spinner';

interface TurnaroundPlayerProps {
  /** IndexedDB key of the clip. */
  videoKey: string;
  /** IndexedDB key of the styled still it turns from — shown until the clip
      is ready, and instead of it if the clip has gone from the device. */
  posterKey: string;
  styleName: string;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The 360° try-on: a 2–3 second turn, looped, silent, inline.

    It plays on its own so the first thing on screen is the customer turning
    round — unless they have asked their device for less motion, in which case
    it waits for the play button. Tapping the video pauses it on whichever side
    they want a longer look at. */
export function TurnaroundPlayer({ videoKey, posterKey, styleName }: TurnaroundPlayerProps) {
  const t = useT();
  const video = usePhotoUrl(videoKey);
  const poster = usePhotoUrl(posterKey);
  const element = useRef<HTMLVideoElement>(null);
  const [autoPlay] = useState(() => !prefersReducedMotion());
  const [paused, setPaused] = useState(!autoPlay);

  const toggle = () => {
    const clip = element.current;
    if (!clip) return;
    if (clip.paused) void clip.play().catch(() => setPaused(true));
    else clip.pause();
  };

  return (
    <div className="tryon-turnaround">
      {video.url ? (
        <video
          ref={element}
          className="tryon-turnaround-video"
          src={video.url}
          poster={poster.url ?? undefined}
          autoPlay={autoPlay}
          loop
          muted
          playsInline
          aria-label={t('tryon.videoAlt', { name: styleName })}
          onClick={toggle}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
        />
      ) : (
        <Art ratio="portrait" src={poster.url} alt={t('tryon.videoAlt', { name: styleName })} className="tryon-turnaround-still">
          {video.loading ? (
            <span className="art-center" aria-hidden="true">
              <Spinner size="sm" />
            </span>
          ) : video.missing ? (
            <div className="art-center">
              <VideoOff size={22} aria-hidden="true" />
              <strong>{t('tryon.videoGoneTitle')}</strong>
              <span className="small">{t('tryon.videoGoneBody')}</span>
            </div>
          ) : null}
        </Art>
      )}
      <div className="tryon-turnaround-badge">
        <Badge tone="dark" plain pill>
          <Orbit size={12} aria-hidden="true" /> {t('tryon.badge360')}
        </Badge>
      </div>
      {video.url ? (
        <IconButton
          variant="scrim"
          className="tryon-turnaround-toggle"
          label={paused ? t('tryon.playVideo') : t('tryon.pauseVideo')}
          onClick={toggle}
        >
          {paused ? <Play size={20} /> : <Pause size={20} />}
        </IconButton>
      ) : null}
    </div>
  );
}
