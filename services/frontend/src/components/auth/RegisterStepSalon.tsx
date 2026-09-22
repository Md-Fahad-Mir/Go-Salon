import { useState } from 'react';
import { useT } from '../../hooks/useLanguage';
import { isValidPhone, textProblem } from '../../utils/validators';
import { Input, Textarea } from '../common/Input';
import { PhoneInput } from '../common/PhoneInput';
import { ChoiceList } from './ChoiceList';
import type { PlaceKind } from './registerOptions';

interface RegisterStepSalonProps {
  kind: PlaceKind | undefined;
  businessName: string;
  address: string;
  businessPhone: string;
  onKind: (value: PlaceKind) => void;
  onBusinessName: (value: string) => void;
  onAddress: (value: string) => void;
  onBusinessPhone: (value: string) => void;
}

/** The business itself: what it is, what it is called and where it is. */
export function RegisterStepSalon({
  kind,
  businessName,
  address,
  businessPhone,
  onKind,
  onBusinessName,
  onAddress,
  onBusinessPhone,
  showErrors,
}: RegisterStepSalonProps & { showErrors: boolean }) {
  const t = useT();
  const [nameTouched, setNameTouched] = useState(false);
  const [addressTouched, setAddressTouched] = useState(false);

  const nameIssue = textProblem(businessName, { max: 60 });
  const addressIssue = textProblem(address, { min: 6, max: 120 });
  const phoneIssue = businessPhone.trim() && !isValidPhone(businessPhone);

  return (
    <div className="auth-step stack-lg">
      <div className="auth-intro">
        <h2 tabIndex={-1}>{t('auth.salonTitle')}</h2>
        <p>{t('auth.salonSub')}</p>
      </div>

      <ChoiceList<PlaceKind>
        label={t('auth.placeKindLabel')}
        hint={t('auth.placeKindHint')}
        error={showErrors && !kind ? t('auth.errPlaceKind') : undefined}
        value={kind}
        onChange={onKind}
        options={[
          { id: 'gents', label: t('auth.placeGents'), hint: t('auth.placeGentsHint') },
          { id: 'parlour', label: t('auth.placeParlour'), hint: t('auth.placeParlourHint') },
          { id: 'unisex', label: t('auth.placeUnisex'), hint: t('auth.placeUnisexHint') },
        ]}
      />

      <div className="stack">
        <Input
          label={t('auth.businessName')}
          value={businessName}
          onChange={(event) => onBusinessName(event.target.value)}
          onBlur={() => setNameTouched(true)}
          error={
            (nameTouched || showErrors) && nameIssue
              ? t(nameIssue === 'empty' ? 'auth.errBusinessName' : 'auth.errTradingNameLong')
              : undefined
          }
          placeholder={t('auth.businessNamePlaceholder')}
          maxLength={60}
        />
        <Textarea
          label={t('auth.addressLabel')}
          value={address}
          onChange={(event) => onAddress(event.target.value)}
          onBlur={() => setAddressTouched(true)}
          error={(addressTouched || showErrors) && addressIssue ? t('auth.errAddress') : undefined}
          hint={t('auth.addressHint')}
          placeholder={t('auth.addressPlaceholder')}
          rows={2}
          maxLength={120}
        />
        <PhoneInput
          value={businessPhone}
          onChange={onBusinessPhone}
          label={t('auth.businessPhone')}
          hint={t('auth.businessPhoneHint')}
          error={showErrors && phoneIssue ? t('auth.errPhoneDigits') : undefined}
        />
      </div>
    </div>
  );
}
