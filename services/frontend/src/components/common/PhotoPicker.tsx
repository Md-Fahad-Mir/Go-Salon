import { Camera } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { cropSquare, readAsDataUrl } from '../../utils/image';
import { photoError } from '../../utils/validators';
import { Avatar } from './Avatar';
import { Button } from './Button';

interface PhotoPickerProps {
  /** A data URL, an https link, or empty for none. */
  value: string;
  onChange: (value: string) => void;
  /** Falls back to initials while there is no picture. */
  name: string;
  hint?: string;
}

/** Add a picture, swap it, or take it off again.
 *
 *  Cropped square on the way in, because every place one of these is shown is
 *  round — letting a landscape photo through only moves the cropping to the
 *  reader's imagination. Removal is a plain button rather than a confirm: the
 *  sheet it sits in has not saved yet, so nothing is lost until it does. */
export function PhotoPicker({ value, onChange, name, hint }: PhotoPickerProps) {
  const t = useT();
  const toast = useAppStore((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = photoError(file);
    if (problem) {
      toast('error', t('profile.photoBadTitle'), problem);
      return;
    }
    setBusy(true);
    try {
      onChange(await readAsDataUrl(await cropSquare(file, 320)));
    } catch {
      toast('error', t('profile.photoReadFail'), t('profile.photoTryAnother'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pf-avatar-picker">
      <Avatar name={name} src={value || undefined} size="2xl" ring />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void pick(event)}
      />
      <div className="row">
        <Button
          size="sm"
          variant="outline"
          icon={<Camera size={16} aria-hidden="true" />}
          loading={busy}
          onClick={() => fileRef.current?.click()}
        >
          {value ? t('profile.changePhoto') : t('profile.addPhoto')}
        </Button>
        {value ? (
          <Button size="sm" variant="ghost" onClick={() => onChange('')}>
            {t('profile.remove')}
          </Button>
        ) : null}
      </div>
      {hint ? <p className="caption dim center">{hint}</p> : null}
    </div>
  );
}
