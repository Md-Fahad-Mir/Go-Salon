import { AlertCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import type { TKey } from '../../i18n';

import { formatNumber } from '../../utils/format';
import { Button } from '../common/Button';
import { ProgressSteps } from '../common/ProgressSteps';
import { Header } from '../layout/Header';
import { Screen, ScreenBody } from '../layout/Screen';
import { StickyFooter } from '../layout/StickyFooter';
import type { RegistrableAccountType } from '../../types';
import { ACCOUNT_TYPE_KEYS } from './accountTypes';

export interface WizardStep {
  labelKey: TKey;
  /** Whether this step's fields are good enough to move on. */
  valid: boolean;
  render: (showErrors: boolean) => ReactNode;
}

interface RegisterWizardProps {
  accountType: RegistrableAccountType;
  steps: WizardStep[];
  submitting: boolean;
  onSubmit: () => void;
  /** Why the server turned the sign-up down, shown above the form until it
      is dismissed or the person tries again. */
  serverError?: string | null;
  onDismissServerError?: () => void;
}

/** The shell every sign-up shares: the progress bar, the step the person is
    on, and the button that moves them along.

    Continue stays enabled on an incomplete step and reveals what is missing
    instead — a greyed-out button on a six-field form tells nobody why. */
export function ProRegisterWizard({
  accountType,
  steps,
  submitting,
  onSubmit,
  serverError,
  onDismissServerError,
}: RegisterWizardProps) {
  const t = useT();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [showErrors, setShowErrors] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const serverErrorRef = useRef<HTMLDivElement | null>(null);

  /* The submit button is at the foot of the screen and the box at its head,
     so the page is brought back up to it when it appears. */
  useEffect(() => {
    if (!serverError) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    serverErrorRef.current?.focus({ preventScroll: true });
  }, [serverError]);

  const total = steps.length;
  const current = steps[step - 1];
  const last = step === total;

  const goTo = (next: number) => {
    setStep(next);
    setShowErrors(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    requestAnimationFrame(() => hostRef.current?.querySelector<HTMLElement>('h2')?.focus());
  };

  const back = () => {
    if (step > 1) return goTo(step - 1);
    return navigate(ROUTES.register, { replace: true });
  };

  const next = () => {
    if (submitting) return;
    if (!current.valid) {
      setShowErrors(true);
      requestAnimationFrame(() =>
        hostRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    if (last) return onSubmit();
    goTo(step + 1);
  };

  return (
    <Screen>
      <Header back onBack={back} title={t(ACCOUNT_TYPE_KEYS[accountType])} />
      <ScreenBody className="auth-body auth-signup">
        <ProgressSteps
          step={step}
          total={total}
          label={t('auth.stepOf', {
            step: formatNumber(step),
            total: formatNumber(total),
            label: t(current.labelKey),
          })}
        />

        {serverError ? (
          <div ref={serverErrorRef} className="auth-server-error" role="alert" tabIndex={-1}>
            <AlertCircle size={18} aria-hidden="true" />
            <div className="auth-server-error-body">
              <strong>{t('auth.registerFailedTitle')}</strong>
              <p>{serverError}</p>
            </div>
            {onDismissServerError ? (
              <button
                type="button"
                className="auth-server-error-close"
                aria-label={t('action.close')}
                onClick={onDismissServerError}
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}

        <div ref={hostRef} key={step} className="auth-step-host">
          {current.render(showErrors)}
        </div>
      </ScreenBody>

      <StickyFooter>
        <Button block size="lg" onClick={next} loading={submitting}>
          {last ? t('auth.completeSignUp') : t('action.continue')}
        </Button>
      </StickyFooter>
    </Screen>
  );
}
