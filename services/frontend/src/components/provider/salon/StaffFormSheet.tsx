import { useState } from 'react';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderService } from '../../../types';
import { formatBdt, formatDuration } from '../../../utils/format';
import { isValidPhone, toE164 } from '../../../utils/validators';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { Callout } from '../../common/Callout';
import { Input } from '../../common/Input';
import { PasswordInput } from '../../auth/PasswordInput';
import { PhoneInput } from '../../common/PhoneInput';
import { PickList } from './PickList';

/** What the owner fills in to add a chair. */
export interface NewStaffDraft {
  phone: string;
  name: string;
  title: string;
  commissionRate: number;
  password: string;
  /** Services this chair should be named on, applied after it exists. */
  serviceIds: string[];
}

interface StaffFormSheetProps {
  open: boolean;
  onClose: () => void;
  services: ProviderService[];
  saving?: boolean;
  /** The server's message when the number could not be used, so the form can
      point at the field rather than only toasting. */
  phoneError?: string;
  onSave: (draft: NewStaffDraft) => void;
}

/** Adding a chair.

    An employee never signs themselves up — this form *is* how the account
    comes to exist. The owner sets a first password and hands it over; the
    person proves the number with a code the first time they sign in.

    A number that already belongs to a barber is attached instead of duplicated,
    and the server decides which of the two happened. The name and password are
    only needed for a brand-new account, so they are marked as such rather than
    demanded.

    The new chair keeps the salon's opening hours until somebody changes them,
    so there is nothing to ask about hours here. */
export function StaffFormSheet({
  open,
  onClose,
  services,
  saving,
  phoneError,
  onSave,
}: StaffFormSheetProps) {
  const t = useT();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [commission, setCommission] = useState('40');
  const [password, setPassword] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  const rate = Number(commission);
  const errors = {
    phone: isValidPhone(phone) ? undefined : t('salon.errStaffPhone'),
    name: name.trim() ? undefined : t('salon.errName'),
    password: password.length >= 8 ? undefined : t('salon.errStaffPassword'),
    commission:
      !commission.trim() || Number.isNaN(rate) || rate < 0 || rate > 100
        ? t('salon.errCommission')
        : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);
  const show = (error?: string) => (touched ? error : undefined);

  const submit = () => {
    if (!valid) {
      setTouched(true);
      return;
    }
    onSave({
      phone: toE164(phone),
      name: name.trim(),
      title: title.trim(),
      commissionRate: Math.round(rate),
      password,
      serviceIds,
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('salon.addStaff')}
      description={t('salon.addStaffHint')}
      footer={<Button block loading={saving} onClick={submit}>{t('action.save')}</Button>}
    >
      <div className="stack">
        <PhoneInput value={phone} onChange={setPhone} error={phoneError ?? show(errors.phone)} />
        <Callout tone="info">{t('salon.addStaffExisting')}</Callout>

        <Input
          label={t('salon.fieldName')}
          placeholder={t('salon.fieldNamePlaceholder')}
          hint={t('salon.fieldNameHint')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={show(errors.name)}
          autoComplete="off"
        />
        <Input
          label={t('salon.fieldTitle')}
          placeholder={t('salon.fieldTitlePlaceholder')}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          optional
          autoComplete="off"
        />
        <PasswordInput
          label={t('salon.fieldStaffPassword')}
          hint={t('salon.fieldStaffPasswordHint')}
          value={password}
          onChange={setPassword}
          error={show(errors.password)}
          autoComplete="new-password"
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
          error={show(errors.commission)}
          suffix={<span className="ps-suffix">%</span>}
        />
        <PickList
          label={t('salon.fieldStaffServices')}
          options={services.map((service) => ({
            id: service.id,
            label: service.name,
            hint: `${formatBdt(service.price)} · ${formatDuration(service.duration)}`,
          }))}
          selected={serviceIds}
          onChange={setServiceIds}
          emptyLabel={t('salon.emptyServicesBody')}
        />
      </div>
    </BottomSheet>
  );
}
