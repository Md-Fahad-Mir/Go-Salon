import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProRegisterWizard, type WizardStep } from '../../../components/auth/ProRegisterWizard';
import { RegisterStepAccount } from '../../../components/auth/RegisterStepAccount';
import { RegisterStepBarber } from '../../../components/auth/RegisterStepBarber';
import { RegisterStepLocation } from '../../../components/auth/RegisterStepLocation';
import { authErrorMessage, fieldMessage } from '../../../components/auth/errors';
import { ROUTES } from '../../../constants';
import { useAuth } from '../../../hooks/useAuth';
import { useT } from '../../../hooks/useLanguage';
import { useProRegistration } from '../../../hooks/useProRegistration';
import { useAppStore } from '../../../store/useAppStore';
import { ApiValidationError } from '../../../utils/apiClient';
import type { Audience } from '../../../types';
import { textProblem, yearsProblem } from '../../../utils/validators';

/** Signing up a barber or hairstylist working for themselves.

    One account type covers the lot — a gents barber, a women's hairstylist,
    someone who does both. Which they are is `audience`, asked as "who are
    your clients", not as a different kind of account. */
export default function BarberRegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const pro = useProRegistration();
  const { registerProfessional } = useAuth();
  const toast = useAppStore((state) => state.toast);

  const [audience, setAudience] = useState<Audience | undefined>();
  const [businessName, setBusinessName] = useState('');
  const [experience, setExperience] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiValidationError | null>(null);

  const workValid =
    Boolean(audience) &&
    !yearsProblem(experience) &&
    serviceIds.length > 0 &&
    !(businessName.trim() && textProblem(businessName, { max: 60 }));

  const toggleService = (id: string) =>
    setServiceIds((current) =>
      current.includes(id) ? current.filter((one) => one !== id) : [...current, id],
    );

  const submit = async () => {
    const base = pro.base();
    if (!base || !audience || submitting) return;
    setSubmitting(true);
    try {
      await registerProfessional({
        ...base,
        accountType: 'barber',
        audience,
        businessName: businessName.trim() || undefined,
        experienceYears: Number(experience),
        serviceIds,
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
      labelKey: 'auth.stepWork',
      valid: workValid,
      render: (showErrors) => (
        <RegisterStepBarber
          audience={audience}
          businessName={businessName}
          experience={experience}
          serviceIds={serviceIds}
          onAudience={setAudience}
          onBusinessName={setBusinessName}
          onExperience={setExperience}
          onToggleService={toggleService}
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
          titleKey="auth.proLocationTitle"
          subKey="auth.proLocationSub"
          geoHintKey="auth.proGeoHint"
        />
      ),
    },
  ];

  return (
    <ProRegisterWizard
      accountType="barber"
      steps={steps}
      submitting={submitting}
      onSubmit={() => void submit()}
    />
  );
}
