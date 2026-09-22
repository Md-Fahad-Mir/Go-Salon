import { Camera } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderService, StaffRecord } from '../../../types';
import type { StaffPatch } from '../../../utils/staffService';
import { formatBdt, formatDuration } from '../../../utils/format';
import { cropSquare, readAsDataUrl } from '../../../utils/image';
import { photoError } from '../../../utils/validators';
import { Avatar } from '../../common/Avatar';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { Callout } from '../../common/Callout';
import { Input, Textarea } from '../../common/Input';
import { PickList } from './PickList';

interface SheetBase {
  open: boolean;
  onClose: () => void;
  member: StaffRecord;
  saving?: boolean;
}

interface EmploymentSheetProps extends SheetBase {
  onSave: (patch: StaffPatch) => void;
}

/** The job, as the salon defines it: what they are called on the price list
    and what share of each service is theirs.

    The person behind the chair — their name, photograph, bio, specialties and
    years — is a separate form, `PersonSheet`, because it is a separate record
    and they can edit it themselves as well. */
export function EmploymentSheet({ open, onClose, member, saving, onSave }: EmploymentSheetProps) {
  const t = useT();
  const [title, setTitle] = useState(member.title);
  const [commission, setCommission] = useState(String(member.commissionRate));
  const [touched, setTouched] = useState(false);

  const rate = Number(commission);
  const commissionError =
    !commission.trim() || Number.isNaN(rate) || rate < 0 || rate > 100
      ? t('salon.errCommission')
      : undefined;

  const submit = () => {
    if (commissionError) {
      setTouched(true);
      return;
    }
    onSave({ title: title.trim(), commission_rate: Math.round(rate) });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('salon.editEmployment')}
      footer={<Button block loading={saving} onClick={submit}>{t('action.save')}</Button>}
    >
      <div className="stack">
        <Input
          label={t('salon.fieldTitle')}
          placeholder={t('salon.fieldTitlePlaceholder')}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoComplete="off"
        />
        <Input
          label={t('salon.fieldCommission')}
          hint={t('salon.fieldCommissionHint')}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          value={commission}
          onChange={(event) => setCommission(event.target.value)}
          error={touched ? commissionError : undefined}
          suffix={<span className="ps-suffix">%</span>}
        />
        <Callout tone="info">{t('salon.theirsToEdit')}</Callout>
      </div>
    </BottomSheet>
  );
}

interface PersonSheetProps extends SheetBase {
  onSave: (patch: StaffPatch) => void;
}

/** The card a customer reads: who this person is, not what the salon pays
    them.
 *
 *  An owner creates the account, so it starts with a name and nothing else.
 *  Waiting for the person to sign in and write their own bio leaves the chair
 *  blank on the public roster in the meantime, so the owner can fill it in —
 *  and the person can still change it from their own profile afterwards. */
export function PersonSheet({ open, onClose, member, saving, onSave }: PersonSheetProps) {
  const t = useT();
  const [name, setName] = useState(member.name);
  const [bio, setBio] = useState(member.bio);
  const [specialties, setSpecialties] = useState(member.specialties.join(', '));
  const [years, setYears] = useState(String(member.experienceYears));
  const [avatar, setAvatar] = useState(member.avatar);
  const [touched, setTouched] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const nameError = name.trim() ? undefined : t('salon.errStaffName');

  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (photoError(file)) return;
    setPhotoBusy(true);
    try {
      setAvatar(await readAsDataUrl(await cropSquare(file, 320)));
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = () => {
    if (nameError) {
      setTouched(true);
      return;
    }
    onSave({
      name: name.trim(),
      bio: bio.trim(),
      avatar,
      specialties: specialties
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      experience_years: Math.max(0, Math.round(Number(years) || 0)),
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('salon.editPerson')}
      footer={<Button block loading={saving} onClick={submit}>{t('action.save')}</Button>}
    >
      <div className="stack">
        <div className="pf-avatar-picker">
          <Avatar name={name || member.name} src={avatar || undefined} size="2xl" ring />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => void pickPhoto(event)}
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
              <Button size="sm" variant="ghost" onClick={() => setAvatar('')}>
                {t('profile.remove')}
              </Button>
            ) : null}
          </div>
        </div>

        <Input
          label={t('salon.fieldStaffName')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={touched ? nameError : undefined}
          autoComplete="off"
          autoCapitalize="words"
          maxLength={60}
        />
        <Textarea
          label={t('pb.bio')}
          hint={t('salon.fieldStaffBioHint')}
          rows={4}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
        />
        <Input
          label={t('pb.specialties')}
          hint={t('pb.specialtiesHint')}
          value={specialties}
          onChange={(event) => setSpecialties(event.target.value)}
          autoComplete="off"
        />
        <Input
          label={t('pb.experience')}
          type="number"
          inputMode="numeric"
          min={0}
          max={70}
          value={years}
          onChange={(event) => setYears(event.target.value)}
        />
        <Callout tone="info">{t('salon.personAlsoTheirs')}</Callout>
      </div>
    </BottomSheet>
  );
}

interface StaffServicesSheetProps extends SheetBase {
  services: ProviderService[];
  onSave: (serviceIds: string[]) => void;
}

/** The catalogue as a checklist: what this person is cleared to perform.

    Eligibility is stored on the service, not on the chair, so this writes
    each service's own list — which is why it hands back service ids rather
    than a patch for the employee. */
export function StaffServicesSheet({
  open,
  onClose,
  member,
  services,
  saving,
  onSave,
}: StaffServicesSheetProps) {
  const t = useT();
  const [selected, setSelected] = useState<string[]>(member.serviceIds);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('salon.editStaffServices')}
      footer={
        <Button block loading={saving} onClick={() => onSave(selected)}>
          {t('action.save')}
        </Button>
      }
    >
      <div className="stack">
        {/* A service that names nobody is open to everyone, so an empty list
            here does not mean this chair can do nothing. */}
        <Callout tone="info">{t('salon.openToAllNote')}</Callout>
        <PickList
          label={t('salon.fieldStaffServices')}
          options={services.map((service) => ({
            id: service.id,
            label: service.name,
            hint: `${formatBdt(service.price)} · ${formatDuration(service.duration)}`,
          }))}
          selected={selected}
          onChange={setSelected}
          emptyLabel={t('salon.emptyServicesBody')}
        />
      </div>
    </BottomSheet>
  );
}
