import { useState } from 'react';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderProfile } from '../../../types';
import type { ProfilePatch } from '../../../utils/profileService';
import { localDigits, toE164 } from '../../../utils/validators';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { Input, Textarea } from '../../common/Input';
import { PhoneInput } from '../../common/PhoneInput';
import { PhotoPicker } from '../../common/PhotoPicker';

interface DetailsSheetProps {
  open: boolean;
  onClose: () => void;
  profile: ProviderProfile;
  onSave: (patch: ProfilePatch) => void;
}

/** The shopfront: its picture, its name, the one-liner, the paragraph
    customers read, and the number they ring. */
export function SalonDetailsSheet({ open, onClose, profile, onSave }: DetailsSheetProps) {
  const t = useT();
  const [avatar, setAvatar] = useState(profile.avatar);
  const [name, setName] = useState(profile.businessName);
  const [tagline, setTagline] = useState(profile.tagline);
  const [bio, setBio] = useState(profile.bio);
  const [phone, setPhone] = useState(localDigits(profile.phone));
  const [touched, setTouched] = useState(false);

  const nameError = !name.trim() ? t('salon.errBusinessName') : undefined;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('salon.detailsTitle')}
      footer={
        <Button
          block
          onClick={() => {
            if (nameError) {
              setTouched(true);
              return;
            }
            onSave({
              avatar,
              business_name: name.trim(),
              tagline: tagline.trim(),
              bio: bio.trim(),
              business_phone: phone ? toE164(phone) : profile.phone,
            });
            onClose();
          }}
        >
          {t('action.save')}
        </Button>
      }
    >
      <div className="stack">
        <PhotoPicker
          value={avatar}
          onChange={setAvatar}
          name={name || profile.businessName}
          hint={t('salon.logoHint')}
        />
        <Input
          label={t('salon.fieldBusinessName')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={touched ? nameError : undefined}
        />
        <Input
          label={t('salon.fieldTagline')}
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
          maxLength={80}
        />
        <Textarea
          label={t('salon.fieldBio')}
          rows={4}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
        />
        <PhoneInput value={phone} onChange={setPhone} />
      </div>
    </BottomSheet>
  );
}


