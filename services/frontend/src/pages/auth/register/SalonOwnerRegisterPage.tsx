import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProRegisterWizard, type WizardStep } from '../../../components/auth/ProRegisterWizard';
import { RegisterStepAccount } from '../../../components/auth/RegisterStepAccount';
import { RegisterStepLocation } from '../../../components/auth/RegisterStepLocation';
import { RegisterStepSalon } from '../../../components/auth/RegisterStepSalon';
import { PLACE_KINDS, type PlaceKind } from '../../../components/auth/registerOptions';
import { authErrorMessage, fieldMessage } from '../../../components/auth/errors';
import { ROUTES } from '../../../constants';
import { useAuth } from '../../../hooks/useAuth';
import { useT } from '../../../hooks/useLanguage';
import { useProRegistration } from '../../../hooks/useProRegistration';
import { useAppStore } from '../../../store/useAppStore';
import { ApiValidationError } from '../../../utils/apiClient';
import { isValidPhone, textProblem, toE164 } from '../../../utils/validators';

/** Signing up whoever runs the place.

    A gents salon, a women's beauty parlour and a unisex salon are the same
    kind of account — an owner — differing by what sort of place it is. That
    is `type` + `audience`, both fields the catalogue already stores. */
export default function SalonOwnerRegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const pro = useProRegistration();
  const { registerProfessional } = useAuth();
  const toast = useAppStore((state) => state.toast);

  const [kind, setKind] = useState<PlaceKind | undefined>();
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiValidationError | null>(null);

  const businessValid =
    Boolean(kind) &&
    !textProblem(businessName, { max: 60 }) &&
    !textProblem(address, { min: 6, max: 120 }) &&
    (!businessPhone.trim() || isValidPhone(businessPhone));

  const submit = async () => {
    const base = pro.base();
    if (!base || !kind || submitting) return;
    setSubmitting(true);
    try {
      await registerProfessional({
        ...base,
        accountType: 'salon_owner',
        ...PLACE_KINDS[kind],
        businessName: businessName.trim(),
        address: address.trim(),
        businessPhone: businessPhone.trim() ? toE164(businessPhone) : undefined,
      });
      // The account exists but its phone is unproved, so the next
      // screen is the code — not a session.
      navigate(ROUTES.otp);
    } catch (error) {
      const failed = error instanceof ApiValidationError ? error : null;
      setFailure(failed);
      toast('error', t('auth.registerFailedTitle'), authErrorMessage(t, error));
      setSubmitting(false);
    }
  };

  const steps: WizardStep[] = [
    {
      labelKey: 'auth.stepAccount',
      valid: pro.accountValid,
      render: (showErrors) => (
        <RegisterStepAccount
          {...pro.account}
          showErrors={showErrors}
          serverErrors={{
            phone: fieldMessage(failure, 'phone'),
            email: fieldMessage(failure, 'email'),
            password: fieldMessage(failure, 'password'),
          }}
        />
      ),
    },
    {
      labelKey: 'auth.stepBusiness',
      valid: businessValid,
      render: (showErrors) => (
        <RegisterStepSalon
          kind={kind}
          businessName={businessName}
          address={address}
          businessPhone={businessPhone}
          onKind={setKind}
          onBusinessName={setBusinessName}
          onAddress={setAddress}
          onBusinessPhone={setBusinessPhone}
          showErrors={showErrors}
        />
      ),
    },
    {
      labelKey: 'auth.stepWhere',
      valid: pro.whereValid,
      render: () => (
        <RegisterStepLocation
          {...pro.where}
          titleKey="auth.salonLocationTitle"
          subKey="auth.salonLocationSub"
          geoHintKey="auth.salonGeoHint"
        />
      ),
    },
  ];

  return (
    <ProRegisterWizard
      accountType="salon_owner"
      steps={steps}
      submitting={submitting}
      onSubmit={() => void submit()}
    />
  );
}
