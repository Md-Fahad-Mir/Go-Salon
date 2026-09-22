import { AlertTriangle, ArrowRight, Check, ImagePlus, RefreshCw, RotateCcw, SwitchCamera, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CapturedAngle, HeadAngle } from '../../types';
import { ROUTES } from '../../constants';
import { AngleRing } from '../../components/ai-tryon/AngleRing';
import { newPhotoKey } from '../../components/ai-tryon/tryonActions';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { EmptyState } from '../../components/common/EmptyState';
import { Spinner } from '../../components/common/Spinner';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useCamera, type CameraFacing } from '../../hooks/useCamera';
import { useT } from '../../hooks/useLanguage';
import type { TKey } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { useTryOnStore } from '../../store/useTryOnStore';
import { ANGLES, REQUIRED_ANGLE, angleSpec } from '../../utils/angles';
import { assessCapture, type CaptureProblem } from '../../utils/captureQuality';
import { compressImage } from '../../utils/image';
import { photoStore } from '../../utils/storage';
import { formatNumber } from '../../utils/format';
import { MAX_PHOTO_BYTES, photoError } from '../../utils/validators';

/* Why each rejected frame was rejected, in the customer's language. Saying
   "capture the back again, your hair is not clearly visible" is the difference
   between a customer who fixes it and one who gives up. */
const PROBLEM_KEYS: Record<CaptureProblem, TKey> = {
  dark: 'tryon.captureDark',
  bright: 'tryon.captureBright',
  blurry: 'tryon.captureBlurry',
  flat: 'tryon.captureFlat',
  no_face: 'tryon.captureNoFace',
  many_faces: 'tryon.captureManyFaces',
  unreadable: 'tryon.captureUnreadable',
};

type Shots = Partial<Record<HeadAngle, { key: string; url: string }>>;

/** The guided walk around one head.

    Eight stops, and only the front is compulsory. That is not a shortcut: the
    phone in a customer's hand physically cannot photograph the back of their
    own head with its selfie camera, so the screen offers the rear camera and
    the gallery for those stops and renders whatever was actually captured. A
    flow that demanded all eight would simply be a flow nobody finished. */
export default function Capture360Page() {
  const t = useT();
  const navigate = useNavigate();
  const toast = useAppStore((s) => s.toast);
  const startThreeSixty = useTryOnStore((s) => s.startThreeSixty);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [facing, setFacing] = useState<CameraFacing>('user');
  const { videoRef, status, start, stop, capture } = useCamera(facing);
  const [current, setCurrent] = useState<HeadAngle>('front');
  const [shots, setShots] = useState<Shots>({});
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<CaptureProblem | null>(null);
  const [busy, setBusy] = useState(false);

  const spec = angleSpec(current);
  const captured = ANGLES.map((angle) => angle.id).filter((id) => shots[id]);
  const hasFront = Boolean(shots[REQUIRED_ANGLE]);
  const live = status === 'live';
  const failed = status === 'denied' || status === 'unsupported' || status === 'error';

  // Restart the stream when the camera side changes, and stop it on the way out
  // so the indicator light does not stay on behind the next screen.
  useEffect(() => {
    void start();
    return stop;
  }, [start, stop]);

  // Object URLs are owned by this screen for as long as it is open.
  useEffect(
    () => () => {
      Object.values(shots).forEach((shot) => shot && URL.revokeObjectURL(shot.url));
    },
    // Revoking on every change would kill the thumbnails still on screen, so
    // this is deliberately an unmount-only cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** The next stop that has nothing yet, so finishing one moves the customer on. */
  const advance = (justDone: HeadAngle) => {
    const next = ANGLES.find((angle) => angle.id !== justDone && !shots[angle.id]);
    if (next) setCurrent(next.id);
  };

  const accept = async (blob: Blob, angle: HeadAngle) => {
    setChecking(true);
    setProblem(null);
    try {
      const verdict = await assessCapture(blob, angle);
      if (!verdict.ok) {
        setProblem(verdict.problem ?? 'unreadable');
        return;
      }
      // Same size as the single-photo flow: detail thrown away here can never
      // come back, and it shows in the hairline.
      const compressed = await compressImage(blob, {
        maxSize: 1536,
        quality: 0.9,
        targetBytes: 2 * 1024 * 1024,
      });
      const key = newPhotoKey();
      await photoStore.put(key, compressed);
      setShots((previous) => {
        const existing = previous[angle];
        if (existing) URL.revokeObjectURL(existing.url);
        return { ...previous, [angle]: { key, url: URL.createObjectURL(compressed) } };
      });
      advance(angle);
    } catch {
      setProblem('unreadable');
    } finally {
      setChecking(false);
    }
  };

  const shoot = async () => {
    const blob = await capture();
    if (blob) await accept(blob, current);
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (photoError(file)) {
      toast(
        'error',
        t('tryon.photoNotImage'),
        file.size > MAX_PHOTO_BYTES ? t('tryon.photoTooLarge') : t('tryon.photoNotImage'),
      );
      return;
    }
    void accept(file, current);
  };

  const drop = (angle: HeadAngle) => {
    setShots((previous) => {
      const existing = previous[angle];
      if (existing) {
        URL.revokeObjectURL(existing.url);
        void photoStore.remove(existing.key);
      }
      const next = { ...previous };
      delete next[angle];
      return next;
    });
    setCurrent(angle);
  };

  /** Hand the ring to the try-on session and go on to the existing picker. */
  const done = () => {
    const ring: CapturedAngle[] = ANGLES.map((angle) => angle.id)
      .filter((id) => shots[id])
      .map((id) => ({ angle: id, photoKey: shots[id]!.key }));
    if (!ring.some((item) => item.angle === REQUIRED_ANGLE)) return;
    setBusy(true);
    startThreeSixty(ring);
    navigate(ROUTES.tryOnSelect, { replace: true });
  };

  return (
    <Screen>
      <Header title={t('tryon.captureTitle')} back backTo={ROUTES.tryOn} />
      <ScreenBody className="tryon-capture360">
        <p className="caption center">{t('tryon.captureIntro')}</p>

        <AngleRing captured={captured} current={current} onPick={setCurrent} />

        <div className="tryon-step-head">
          <strong>
            {t('tryon.angleStep', {
              index: formatNumber(ANGLES.findIndex((angle) => angle.id === current) + 1),
              total: formatNumber(ANGLES.length),
              name: t(spec.label),
            })}
          </strong>
          <span className="caption">{t(spec.hint)}</span>
          {!spec.selfieReachable ? (
            <span className="small dim">{t('tryon.angleNeedsHelp')}</span>
          ) : null}
        </div>

        {shots[current] ? (
          /* This stop is done: show what was taken, and the two things a
             customer wants next — redo it, or move on. */
          <>
            <div className="tryon-frame">
              <img src={shots[current]!.url} alt={t(spec.label)} />
              <span className="tryon-shot-done" aria-hidden="true">
                <Check size={18} strokeWidth={3} />
              </span>
            </div>
            <div className="row">
              <Button
                variant="secondary"
                block
                icon={<RotateCcw size={18} aria-hidden="true" />}
                onClick={() => drop(current)}
              >
                {t('tryon.retake')}
              </Button>
              <Button block icon={<ArrowRight size={18} aria-hidden="true" />} onClick={() => advance(current)}>
                {t('tryon.angleNext')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="tryon-frame tryon-viewfinder" data-status={status} data-facing={facing}>
              <video ref={videoRef} muted playsInline autoPlay aria-label={t('tryon.cameraPreview')} />
              {live ? (
                <svg className="tryon-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    d="M0 0H100V100H0Z M50 12 C68 12 78 30 78 52 C78 74 66 90 50 90 C34 90 22 74 22 52 C22 30 32 12 50 12Z"
                    fillRule="evenodd"
                  />
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
                    icon={<AlertTriangle size={24} aria-hidden="true" />}
                    title={t('tryon.cameraUnavailable')}
                    description={t('tryon.cameraFailed')}
                    action={
                      <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                        {t('tryon.choosePhotoInstead')}
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </div>

            {problem ? (
              <Callout tone="warning" icon={<AlertTriangle size={20} aria-hidden="true" />} title={t('tryon.captureRejected')}>
                {t(PROBLEM_KEYS[problem])}
              </Callout>
            ) : null}

            <div className="tryon-capture-actions">
              <button
                type="button"
                className="tryon-shutter"
                aria-label={t('tryon.takePhoto')}
                disabled={!live || checking || busy}
                onClick={() => void shoot()}
              >
                <span aria-hidden="true" />
              </button>
              {checking ? <Spinner size="sm" label={t('tryon.checkingPhotoLabel')} /> : null}
            </div>

            <div className="row tryon-capture-alt">
              <Button
                variant="ghost"
                size="sm"
                icon={<SwitchCamera size={16} aria-hidden="true" />}
                onClick={() => setFacing((side) => (side === 'user' ? 'environment' : 'user'))}
              >
                {facing === 'user' ? t('tryon.useRearCamera') : t('tryon.useFrontCamera')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<ImagePlus size={16} aria-hidden="true" />}
                onClick={() => fileRef.current?.click()}
              >
                {t('tryon.chooseFromGallery')}
              </Button>
            </div>
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFile}
        />

        {captured.length ? (
          <section className="section tryon-shotlist">
            <h3 className="label">{t('tryon.captured')}</h3>
            <ul className="tryon-thumbs">
              {ANGLES.filter((angle) => shots[angle.id]).map((angle) => (
                <li key={angle.id}>
                  <img src={shots[angle.id]!.url} alt={t(angle.label)} />
                  <span className="tryon-thumb-name">{t(angle.label)}</span>
                  <button
                    type="button"
                    className="tryon-thumb-drop"
                    aria-label={t('tryon.retakeAngle', { name: t(angle.label) })}
                    onClick={() => drop(angle.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="stack-sm">
          <Button block size="lg" loading={busy} disabled={!hasFront} onClick={done}>
            {t('tryon.captureDone', { count: formatNumber(captured.length) })}
          </Button>
          {!hasFront ? (
            <p className="caption center">{t('tryon.captureNeedsFront')}</p>
          ) : captured.length < ANGLES.length ? (
            <p className="caption center">
              <RefreshCw size={12} aria-hidden="true" /> {t('tryon.capturePartial')}
            </p>
          ) : null}
        </div>
      </ScreenBody>
    </Screen>
  );
}
