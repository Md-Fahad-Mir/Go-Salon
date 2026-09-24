import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProRegisterWizard, type WizardStep } from '../../../components/auth/ProRegisterWizard';
import { RegisterStepAccount } from '../../../components/auth/RegisterStepAccount';
import { RichText } from '../../../components/auth/RichText';
import { authErrorMessage, fieldMessage } from '../../../components/auth/errors';
import { Checkbox } from '../../../components/common/Checkbox';
import { ROUTES } from '../../../constants';
import { useAuth } from '../../../hooks/useAuth';
import { useProRegistration } from '../../../hooks/useProRegistration';
import { useT } from '../../../hooks/useLanguage';
import { useAppStore } from '../../../store/useAppStore';
import { ApiValidationError } from '../../../utils/apiClient';

/** The customer sign-up: the account, and then the code.

    One screen where there were three. It used to ask for a hair profile and
    an area as well, and a customer now reaches this from a salon's QR code,
    standing at its counter with somebody waiting — the only thing worth
    asking before the code is texted is who they are. The backend agrees:
    `CustomerRegistrationSerializer` requires the phone, a name, a password and
    the terms, and treats gender, hair type, hair length and location as
    optional with empty defaults. So those are simply not collected and not
    sent, and the profile screen still takes them later.

    The terms checkbox is the one thing the dropped screens held that the
    server will not do without — `accepted_terms` must be true — so it moved
    here rather than going with them. The request is built from
    `useProRegistration.accountFields()`, the same normaliser `base()` uses for
    the professional sign-ups; `base()` itself is theirs, because it requires
    the location only they collect.

    It ends the same way every sign-up does — the account is made unverified
    and the backend texts a code, so the next screen is the one that takes it.
    Nothing is signed in until that code is right. */
export default function CustomerRegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const shared = useProRegistration();
  const { registerCustomer } = useAuth();
  const toast = useAppStore((state) => state.toast);

  const { terms, onTerms } = shared.where;
  const termsError = useId();
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiValidationError | null>(null);

  // An email is optional for a customer: receipts are a courtesy, not a
  // business record.
  const accountValid = shared.accountValid || shared.accountValidWithoutEmail;

  const submit = async () => {
    if (!accountValid || !terms || submitting) return;
    setSubmitting(true);
    try {
      await registerCustomer({
        accountType: 'customer',
        ...shared.accountFields(),
        acceptedTerms: terms,
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
      valid: accountValid && terms,
      render: (showErrors) => (
        <div className="stack-lg">
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
          {/* The wizard reveals what is missing rather than greying out its
              button, by focusing the first `[aria-invalid="true"]` — so the
              box is marked invalid for it to find, and says why underneath. */}
          <div className="stack-sm">
            <Checkbox
              checked={terms}
              onChange={onTerms}
              invalid={showErrors && !terms}
              describedBy={showErrors && !terms ? termsError : undefined}
              label={
                <RichText
                  template={t('auth.agreeTerms')}
                  nodes={{
                    terms: <span className="auth-link">{t('auth.termsOfService')}</span>,
                    privacy: <span className="auth-link">{t('auth.privacy')}</span>,
                  }}
                />
              }
            />
            {showErrors && !terms ? (
              <p className="field-error" id={termsError} role="alert">{t('auth.errTermsRequired')}</p>
            ) : null}
          </div>
        </div>
      ),
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
