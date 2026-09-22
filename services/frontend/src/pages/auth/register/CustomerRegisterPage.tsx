import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProRegisterWizard, type WizardStep } from '../../../components/auth/ProRegisterWizard';
import { RegisterStepAccount } from '../../../components/auth/RegisterStepAccount';
import { RegisterStepHair } from '../../../components/auth/RegisterStepHair';
import { RegisterStepLocation } from '../../../components/auth/RegisterStepLocation';
import { authErrorMessage, fieldMessage } from '../../../components/auth/errors';
import { ROUTES } from '../../../constants';
import { useAuth } from '../../../hooks/useAuth';
import { useProRegistration } from '../../../hooks/useProRegistration';
import { useT } from '../../../hooks/useLanguage';
import { useAppStore } from '../../../store/useAppStore';
import type { Gender, HairLength, HairType } from '../../../types';
import { ApiValidationError } from '../../../utils/apiClient';

/** The customer sign-up: the account, their hair, their area.

    It ends the same way every sign-up does — the account is made unverified
    and the backend texts a code, so the next screen is the one that takes it.
    Nothing is signed in until that code is right. */
export default function CustomerRegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const shared = useProRegistration();
  const { registerCustomer } = useAuth();
  const toast = useAppStore((state) => state.toast);

  const [gender, setGender] = useState<Gender | undefined>();
  const [hairType, setHairType] = useState<HairType | undefined>();
  const [hairLength, setHairLength] = useState<HairLength | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiValidationError | null>(null);

  const submit = async () => {
    const base = shared.base();
    if (!base || !hairType || !hairLength || submitting) return;
    setSubmitting(true);
    try {
      await registerCustomer({
        ...base,
        accountType: 'customer',
        gender,
        hairType,
        hairLength,
      });
      navigate(ROUTES.otp);
    } catch (error) {
      setFailure(error instanceof ApiValidationError ? error : null);
      toast('error', t('auth.registerFailedTitle'), authErrorMessage(t, error));
      setSubmitting(false);
    }
  };

  const steps: WizardStep[] = [
    {
      labelKey: 'auth.stepAbout',
      // An email is optional for a customer: receipts are a courtesy, not a
      // business record.
      valid: shared.accountValid || shared.accountValidWithoutEmail,
      render: (showErrors) => (
        <RegisterStepAccount
          {...shared.account}
          emailRequired={false}
          titleKey="auth.nameTitle"
          subKey="auth.nameSub"
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
      labelKey: 'auth.stepHair',
      valid: Boolean(gender && hairType && hairLength),
      render: () => (
        <RegisterStepHair
          gender={gender}
          onGender={setGender}
          hairType={hairType}
          hairLength={hairLength}
          onHairType={setHairType}
          onHairLength={setHairLength}
        />
      ),
    },
    {
      labelKey: 'auth.stepArea',
      valid: shared.whereValid,
      render: () => <RegisterStepLocation {...shared.where} />,
    },
  ];

  return (
    <ProRegisterWizard
      accountType="customer"
      steps={steps}
      submitting={submitting}
      onSubmit={() => void submit()}
    />
  );
}
