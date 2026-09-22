import { Camera, Mail, Trash2, UserRound } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { HairLength, HairType, Location, User, Gender } from '../../types';
import { DHAKA_AREAS, HAIR_LENGTHS, HAIR_TYPES, ROUTES } from '../../constants';
import { Avatar } from '../../components/common/Avatar';
import { Button, LinkButton } from '../../components/common/Button';
import { Chip, ChipRow } from '../../components/common/Chip';
import { EmptyState } from '../../components/common/EmptyState';
import { Input } from '../../components/common/Input';
import { GenderPicker } from '../../components/auth/GenderPicker';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { StickyFooter } from '../../components/layout/StickyFooter';
import { HAIR_LENGTH_KEYS, HAIR_TYPE_KEYS } from '../../components/profile/hairLabels';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { messageOf } from '../../utils/errorMessage';
import { formatPhone } from '../../utils/format';
import { cropSquare, readAsDataUrl } from '../../utils/image';
import { profileService, toUser } from '../../utils/profileService';
import { emailError, nameError, photoError } from '../../utils/validators';

type Area = (typeof DHAKA_AREAS)[number];

/** Approximate centres used when the area changes without a device fix. */
const AREA_CENTRES: Record<Area, { lat: number; lng: number }> = {
  Dhanmondi: { lat: 23.7461, lng: 90.3742 },
  Gulshan: { lat: 23.7925, lng: 90.4078 },
  Banani: { lat: 23.7937, lng: 90.4066 },
  Uttara: { lat: 23.8759, lng: 90.3795 },
  Mirpur: { lat: 23.8069, lng: 90.3687 },
  Bashundhara: { lat: 23.8148, lng: 90.427 },
  Mohammadpur: { lat: 23.7625, lng: 90.3585 },
  'Old Dhaka': { lat: 23.7104, lng: 90.4074 },
};

const isArea = (value: string | undefined): value is Area => DHAKA_AREAS.includes(value as Area);

function EditProfileForm({ user }: { user: User }) {
  const navigate = useNavigate();
  const updateUser = useAppStore((s) => s.updateUser);
  const toast = useAppStore((s) => s.toast);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const t = useT();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [avatar, setAvatar] = useState<string | undefined>(user.avatar);
  const [gender, setGender] = useState<Gender | undefined>(user.gender);
  const [hairType, setHairType] = useState<HairType | undefined>(user.hairType);
  const [hairLength, setHairLength] = useState<HairLength | undefined>(user.hairLength);
  const [area, setArea] = useState<Area | undefined>(isArea(user.location?.area) ? user.location?.area : undefined);
  const [touched, setTouched] = useState({ name: false, email: false });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const nameErr = nameError(name);
  const emailErr = emailError(email);
  const valid = !nameErr && !emailErr && !!hairType && !!hairLength && !!area;
  const dirty =
    name.trim() !== user.name ||
    (email.trim() || undefined) !== (user.email || undefined) ||
    avatar !== user.avatar ||
    gender !== user.gender ||
    hairType !== user.hairType ||
    hairLength !== user.hairLength ||
    area !== user.location?.area;

  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = photoError(file);
    if (problem) {
      toast('error', t('profile.photoBadTitle'), problem);
      return;
    }
    setPhotoBusy(true);
    try {
      const square = await cropSquare(file, 320);
      setAvatar(await readAsDataUrl(square));
    } catch {
      toast('error', t('profile.photoReadFail'), t('profile.photoTryAnother'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched({ name: true, email: true });
    if (!valid || !dirty || !area || saving) return;

    const location: Location =
      user.location && user.location.area === area
        ? user.location
        : { ...AREA_CENTRES[area], area, city: 'Dhaka', address: `${area}, Dhaka` };

    setSaving(true);
    try {
      /* The server is what decides this stuck, so the store is filled from
         what it sends back rather than from what was typed. */
      const saved = await profileService.update({
        name: name.trim(),
        email: email.trim(),
        avatar: avatar ?? '',
        gender: gender ?? '',
        hair_type: hairType ?? '',
        hair_length: hairLength ?? '',
        location: {
          area: location.area,
          city: location.city,
          address: location.address,
          latitude: location.lat,
          longitude: location.lng,
        },
      });
      updateUser(toUser(saved));
      toast('success', t('profile.updated'));
      navigate(ROUTES.profile, { replace: true });
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScreenBody>
        <form id="edit-profile" className="stack-lg pf-edit-form" onSubmit={(event) => void submit(event)} noValidate>
          <div className="pf-avatar-picker">
            <Avatar name={name || user.name} src={avatar} size="2xl" ring />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={pickPhoto}
            />
            <div className="row">
              <Button
                size="sm"
                variant="outline"
                icon={<Camera size={16} aria-hidden="true" />}
                loading={photoBusy}
                onClick={() => fileRef.current?.click()}
              >
                {avatar ? t('profile.changePhoto') : t('profile.addPhoto')}
              </Button>
              {avatar ? (
                <Button size="sm" variant="ghost" icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => setAvatar(undefined)}>
                  {t('profile.remove')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="stack">
            <Input
              label={t('profile.name')}
              value={name}
              autoComplete="name"
              icon={<UserRound size={18} aria-hidden="true" />}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              error={touched.name ? nameErr : undefined}
            />
            <Input
              label={t('profile.email')}
              optional
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t('profile.emailPlaceholder')}
              icon={<Mail size={18} aria-hidden="true" />}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              error={touched.email ? emailErr : undefined}
              hint={t('profile.emailHint')}
            />
            <Input
              label={t('profile.mobileNumber')}
              value={formatPhone(user.phone)}
              readOnly
              hint={t('profile.mobileHint')}
            />
          </div>

          {/* GenderPicker brings its own label and radiogroup. */}
          <GenderPicker value={gender} onChange={setGender} hint={false} labelKey="auth.genderShort" />

          <div className="stack-sm pf-choice" role="group" aria-labelledby="pf-hair-type">
            <span className="pf-field-label" id="pf-hair-type">{t('profile.hairTypeLabel')}</span>
            <div className="tile-grid">
              {HAIR_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className="tile"
                  aria-pressed={hairType === type.id}
                  onClick={() => setHairType(type.id)}
                >
                  <span className="tile-title">{t(HAIR_TYPE_KEYS[type.id].label)}</span>
                  <span className="tile-sub">{t(HAIR_TYPE_KEYS[type.id].hint)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="stack-sm pf-choice" role="group" aria-labelledby="pf-hair-length">
            <span className="pf-field-label" id="pf-hair-length">{t('profile.hairLengthLabel')}</span>
            <div className="tile-grid tile-grid-3">
              {HAIR_LENGTHS.map((length) => (
                <button
                  key={length.id}
                  type="button"
                  className="tile"
                  aria-pressed={hairLength === length.id}
                  onClick={() => setHairLength(length.id)}
                >
                  <span className="tile-title">{t(HAIR_LENGTH_KEYS[length.id].label)}</span>
                  <span className="tile-sub">{t(HAIR_LENGTH_KEYS[length.id].hint)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="stack-sm pf-choice pf-choice-areas" role="group" aria-labelledby="pf-area">
            <span className="pf-field-label" id="pf-area">{t('profile.areaLabel')}</span>
            <ChipRow scroll label={t('profile.areaLabel')}>
              {DHAKA_AREAS.map((option) => (
                <Chip key={option} active={area === option} onClick={() => setArea(option)}>
                  {option}
                </Chip>
              ))}
            </ChipRow>
            <p className="field-hint">{t('profile.areaHint')}</p>
          </div>
        </form>
      </ScreenBody>
      <StickyFooter>
        <Button type="submit" form="edit-profile" block loading={saving} disabled={!dirty || !valid}>
          {t('profile.saveChanges')}
        </Button>
      </StickyFooter>
    </>
  );
}

export default function EditProfilePage() {
  const user = useAppStore((s) => s.user);
  const t = useT();
  return (
    <Screen>
      <Header title={t('profile.editTitle')} back backTo={ROUTES.profile} />
      {user ? (
        <EditProfileForm key={user.id} user={user} />
      ) : (
        <ScreenBody className="fullscreen-center">
          <EmptyState
            icon={<UserRound size={26} aria-hidden="true" />}
            title={t('profile.signedOutTitle')}
            description={t('profile.signedOutEditBody')}
            action={<LinkButton to={ROUTES.welcome}>{t('profile.signIn')}</LinkButton>}
          />
        </ScreenBody>
      )}
    </Screen>
  );
}
