import { AlertCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { RichText } from '../../components/auth/RichText';
import { authErrorMessage } from '../../components/auth/errors';
import { Button } from '../../components/common/Button';
import { OTPInput } from '../../components/common/OTPInput';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { OTP_LENGTH, OTP_RESEND_SECONDS, ROUTES } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import { useCountdown } from '../../hooks/useCountdown';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { ApiValidationError } from '../../utils/apiClient';
import { firstNameOf, formatNumber, maskPhone } from '../../utils/format';
import { isOtpComplete } from '../../utils/validators';

const emptyCode = (): string[] => Array.from({ length: OTP_LENGTH }, () => '');

/** Proving the phone a sign-up was made with.

    The backend generated the code, holds it hashed and decides whether the
    one typed here is right — this screen only carries it there. Getting it
    right is what activates the account, so this is also where a new user's
    first session comes from. */
export default function OTPPage() {
  const navigate = useNavigate();
  const t = useT();
  const pending = useAppStore((s) => s.pendingVerification);
  const toast = useAppStore((s) => s.toast);
  const { verifyOtp, resendOtp, landingRouteForUser } = useAuth();
  const { seconds, running, restart } = useCountdown(pending?.resendIn ?? OTP_RESEND_SECONDS);

  const [digits, setDigits] = useState<string[]>(emptyCode);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [failure, setFailure] = useState<ApiValidationError | null>(null);
  /** Bumped after a failed attempt so the boxes remount and refocus. */
  const [attempt, setAttempt] = useState(0);
  const submitting = useRef(false);

  if (!pending) return <Navigate to={ROUTES.login} replace />;

  const complete = isOtpComplete(digits);

  const verify = async (code: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setVerifying(true);
    setFailure(null);
    try {
      const user = await verifyOtp(code);
      toast(
        'success',
        t('auth.welcomeToast', { name: firstNameOf(user.name) }),
        user.role === 'customer' ? t('auth.freeTryOns', { count: formatNumber(user.credits) }) : undefined,
      );
      // Where every sign-up ends, so it is where an interrupted journey has
      // to be picked back up: nothing between here and the login screen keeps
      // router state alive.
      const destination = useAppStore.getState().takePendingRedirect();
      navigate(destination ?? landingRouteForUser(user), { replace: true });
    } catch (error) {
      setFailure(error instanceof ApiValidationError ? error : null);
      setDigits(emptyCode());
      setVerifying(false);
      setAttempt((n) => n + 1);
      submitting.current = false;
    }
  };

  const handleChange = (next: string[]) => {
    setDigits(next);
    if (failure) setFailure(null);
    if (isOtpComplete(next)) void verify(next.join(''));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (complete) void verify(digits.join(''));
  };

  const resend = async () => {
    if (resending) return;
    setResending(true);
    try {
      // The backend says how long the next wait is; it is the one enforcing it.
      restart(await resendOtp());
      toast('info', t('auth.resendSentTitle'), t('auth.resendSentBody'));
    } catch (error) {
      if (error instanceof ApiValidationError && error.retryAfter) {
        restart(error.retryAfter);
      }
      toast('error', t('auth.resendFailedTitle'), authErrorMessage(t, error));
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen>
      {/* Not history, deliberately. Back from here usually means abandoning
          verification, and the screen behind is the sign-up form that has
          already been submitted — returning to it only earns a "that number
          is taken". Signing in is the way out. */}
      <Header back onBack={() => navigate(ROUTES.login, { replace: true })} />
      <ScreenBody className="auth-body">
        <form className="stack-lg" onSubmit={submit} noValidate>
          <div className="auth-intro">
            <h2>{t('auth.otpTitle')}</h2>
            <p>
              <RichText
                template={t('auth.otpSent')}
                nodes={{ phone: <strong className="tabular">{maskPhone(pending.phone)}</strong> }}
              />
            </p>
          </div>

          <div className="stack-sm">
            <OTPInput key={attempt} value={digits} onChange={handleChange} invalid={Boolean(failure)} disabled={verifying} />
            <div aria-live="assertive">
              {failure ? (
                <p className="field-error" role="alert">
                  <AlertCircle size={14} aria-hidden="true" /> {authErrorMessage(t, failure)}
                </p>
              ) : null}
            </div>
          </div>

          <Button type="submit" block size="lg" disabled={!complete} loading={verifying}>
            {t('auth.verify')}
          </Button>

          <p className="auth-resend caption center" aria-live="polite">
            {running ? (
              <RichText
                template={t('auth.resendIn')}
                nodes={{
                  seconds: (
                    <span className="tabular strong">
                      {t('auth.secondsShort', { value: formatNumber(seconds) })}
                    </span>
                  ),
                }}
              />
            ) : (
              <RichText
                template={t('auth.resendPrompt')}
                nodes={{
                  resend: (
                    <button type="button" className="link-btn" onClick={() => void resend()} disabled={resending}>
                      {resending ? t('auth.resending') : t('auth.resendCode')}
                    </button>
                  ),
                }}
              />
            )}
          </p>

          <p className="tiny dim center">{t('auth.otpExpiry')}</p>
        </form>
      </ScreenBody>
    </Screen>
  );
}
