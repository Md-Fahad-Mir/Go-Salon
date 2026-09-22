import { CameraOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCamera, type CameraStatus } from '../../hooks/useCamera';
import type { TKey } from '../../i18n';
import { useT } from '../../hooks/useLanguage';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Spinner } from '../common/Spinner';

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onPickGallery: () => void;
  disabled?: boolean;
}

const FAILED = new Set(['denied', 'unsupported', 'error']);

/* useCamera reports the reason in English; the copy shown comes from here. */
const FAILURE_KEYS: Partial<Record<CameraStatus, TKey>> = {
  denied: 'tryon.cameraDenied',
  unsupported: 'tryon.cameraUnsupported',
  error: 'tryon.cameraFailed',
};

/** Front-camera viewfinder with a face guide and a shutter. */
export function CameraCapture({ onCapture, onPickGallery, disabled }: CameraCaptureProps) {
  const t = useT();
  const { videoRef, status, start, capture } = useCamera();
  const [slowSince, setSlowSince] = useState<CameraStatus | null>(null);

  useEffect(() => {
    void start();
  }, [start]);

  // Some browsers never answer the permission prompt: after a while, point
  // at the gallery instead of spinning forever.
  useEffect(() => {
    if (status !== 'starting') return;
    const timer = window.setTimeout(() => setSlowSince('starting'), 6000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const failed = FAILED.has(status);
  const live = status === 'live';
  const slow = status === 'starting' && slowSince === 'starting';

  const shoot = async () => {
    const blob = await capture();
    if (blob) onCapture(blob);
  };

  return (
    <div className="stack">
      <div className="tryon-frame tryon-viewfinder" data-status={status}>
        <video ref={videoRef} muted playsInline autoPlay aria-label={t('tryon.cameraPreview')} />
        {live ? (
          <svg className="tryon-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 0H100V100H0Z M50 12 C68 12 78 30 78 52 C78 74 66 90 50 90 C34 90 22 74 22 52 C22 30 32 12 50 12Z" fillRule="evenodd" />
            <ellipse cx="50" cy="51" rx="28" ry="39" />
          </svg>
        ) : null}
        {!live && !failed ? (
          <div className="tryon-frame-state">
            <Spinner size="lg" label={t('tryon.startingCameraLabel')} />
            <span className="small muted">{t('tryon.startingCamera')}</span>
          </div>
        ) : null}
        {failed ? (
          <div className="tryon-frame-state">
            <EmptyState
              icon={<CameraOff size={24} aria-hidden="true" />}
              title={t('tryon.cameraUnavailable')}
              description={t(FAILURE_KEYS[status] ?? 'tryon.cameraFailed')}
              action={
                <Button variant="secondary" size="sm" onClick={onPickGallery}>
                  {t('tryon.choosePhotoInstead')}
                </Button>
              }
            />
          </div>
        ) : null}
      </div>
      <p className="caption center tryon-capture-hint" aria-live="polite">
        {live
          ? t('tryon.faceGuideHint')
          : slow
            ? t('tryon.cameraSlowHint')
            : failed
              ? ''
              : t('tryon.cameraWaiting')}
      </p>
      <div className="tryon-capture-actions">
        <button
          type="button"
          className="tryon-shutter"
          aria-label={t('tryon.takePhoto')}
          disabled={!live || disabled}
          onClick={shoot}
        >
          <span aria-hidden="true" />
        </button>
        <button type="button" className="link-btn" onClick={onPickGallery}>
          {t('tryon.chooseFromGallery')}
        </button>
      </div>
    </div>
  );
}
