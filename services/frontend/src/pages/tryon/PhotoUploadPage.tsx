import { AlertTriangle, ImagePlus, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants';
import { BuyCreditsSheet } from '../../components/ai-tryon/BuyCreditsSheet';
import { CameraCapture } from '../../components/ai-tryon/CameraCapture';
import { PhotoTipsSheet } from '../../components/ai-tryon/PhotoTipsSheet';
import { newPhotoKey } from '../../components/ai-tryon/tryonActions';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { IconButton } from '../../components/common/IconButton';
import { Spinner } from '../../components/common/Spinner';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { useTryOnStore } from '../../store/useTryOnStore';
import { compressImage, looksLikeAPortrait } from '../../utils/image';
import { photoStore } from '../../utils/storage';
import { MAX_PHOTO_BYTES, photoError } from '../../utils/validators';

type Mode = 'camera' | 'gallery';

interface UploadState {
  mode?: Mode;
  hairstyleId?: string;
}

interface Shot {
  blob: Blob;
  url: string;
  /** True when the portrait check could not find a face. */
  warning: boolean;
}

export default function PhotoUploadPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as UploadState;
  const credits = useAppStore((s) => s.user?.credits ?? 0);
  const toast = useAppStore((s) => s.toast);
  const setPhotoKey = useTryOnStore((s) => s.setPhotoKey);
  const setSelectedHairstyle = useTryOnStore((s) => s.setSelectedHairstyle);

  const [mode, setMode] = useState<Mode>(state.mode ?? 'camera');
  const [shot, setShot] = useState<Shot | null>(null);
  const [checking, setChecking] = useState(false);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  // The preview URL is revoked whenever the shot changes or the screen unmounts.
  useEffect(
    () => () => {
      if (shot) URL.revokeObjectURL(shot.url);
    },
    [shot],
  );

  const review = async (blob: Blob) => {
    setChecking(true);
    const portrait = await looksLikeAPortrait(blob).catch(() => true);
    setShot({ blob, url: URL.createObjectURL(blob), warning: !portrait });
    setChecking(false);
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // photoError decides whether the file is usable; the message shown is ours.
    if (photoError(file)) {
      setFileError(file.size > MAX_PHOTO_BYTES ? t('tryon.photoTooLarge') : t('tryon.photoNotImage'));
      return;
    }
    setFileError('');
    void review(file);
  };

  const retake = () => {
    setShot(null);
    setFileError('');
  };

  /** Compress, store, hand the key to the try-on session, move on. */
  const proceed = async () => {
    if (!shot) return;
    setBusy(true);
    try {
      // 1536, not 1024: the AI service renders the try-on with high input
      // fidelity, and detail thrown away here can never come back — it shows in
      // the hairline and the skin. Still ~400 KB, well under the upload limit.
      const compressed = await compressImage(shot.blob, {
        maxSize: 1536,
        quality: 0.9,
        targetBytes: 2 * 1024 * 1024,
      });
      const key = newPhotoKey();
      await photoStore.put(key, compressed);
      setPhotoKey(key);
      if (state.hairstyleId) setSelectedHairstyle(state.hairstyleId);
      navigate(ROUTES.tryOnSelect, { replace: true });
    } catch {
      toast('error', t('tryon.photoReadFailed'), t('tryon.photoReadFailedBody'));
      setBusy(false);
    }
  };

  const continueWithPhoto = () => {
    if (credits <= 0) {
      setBuyOpen(true);
      return;
    }
    void proceed();
  };

  return (
    <Screen>
      <Header
        title={t('tryon.photoTitle')}
        back
        actions={
          <IconButton label={t('tryon.photoTipsLabel')} onClick={() => setTipsOpen(true)}>
            <Info size={22} />
          </IconButton>
        }
      />
      <ScreenBody>
        {shot ? (
          <>
            <div className="tryon-frame">
              <img src={shot.url} alt={t('tryon.photoAlt')} />
            </div>
            {shot.warning ? (
              <Callout
                tone="warning"
                icon={<AlertTriangle size={20} aria-hidden="true" />}
                title={t('tryon.hairVisibleTitle')}
              >
                {t('tryon.hairVisibleBody')}
              </Callout>
            ) : (
              <p className="caption center">{t('tryon.photoLooksGood')}</p>
            )}
            <div className="stack-sm">
              <Button block size="lg" loading={busy} onClick={continueWithPhoto}>
                {shot.warning ? t('tryon.useAnyway') : t('tryon.usePhoto')}
              </Button>
              <Button block variant="ghost" onClick={retake} disabled={busy}>
                {mode === 'camera' ? t('tryon.retake') : t('tryon.chooseAnother')}
              </Button>
            </div>
          </>
        ) : mode === 'camera' ? (
          <CameraCapture
            onCapture={(blob) => void review(blob)}
            onPickGallery={() => setMode('gallery')}
            disabled={checking}
          />
        ) : (
          <>
            <label className="tryon-dropzone" data-busy={checking ? 'true' : undefined}>
              <input type="file" accept="image/*" className="sr-only" onChange={onFile} disabled={checking} />
              {checking ? (
                <Spinner size="lg" label={t('tryon.checkingPhotoLabel')} />
              ) : (
                <ImagePlus size={36} aria-hidden="true" />
              )}
              <strong>{checking ? t('tryon.checkingPhoto') : t('tryon.pickFromPhone')}</strong>
              <span className="small dim">{t('tryon.fileHint')}</span>
            </label>
            {fileError ? (
              <Callout tone="danger" icon={<AlertTriangle size={20} aria-hidden="true" />}>
                {fileError}
              </Callout>
            ) : null}
            <div className="center tryon-switch">
              <button type="button" className="link-btn" onClick={() => setMode('camera')}>
                {t('tryon.useCameraInstead')}
              </button>
            </div>
          </>
        )}
      </ScreenBody>

      <PhotoTipsSheet open={tipsOpen} onClose={() => setTipsOpen(false)} />
      <BuyCreditsSheet open={buyOpen} onClose={() => setBuyOpen(false)} onPurchased={() => void proceed()} />
    </Screen>
  );
}
