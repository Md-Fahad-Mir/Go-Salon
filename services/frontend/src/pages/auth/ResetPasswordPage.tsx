import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { RichText } from '../../components/auth/RichText';
import { authErrorMessage } from '../../components/auth/errors';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { OTPInput } from '../../components/common/OTPInput';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { OTP_LENGTH, ROUTES } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { ApiValidationError } from '../../utils/apiClient';
import { maskPhone } from '../../utils/format';
import { isOtpComplete, passwordProblem } from '../../utils/validators';

const emptyCode = (): string[] => Array.from({ length: OTP_LENGTH }, () => '');

interface ResetState {
  phone?: string;
}

/** Finishing a password reset.

    Two calls, in order: the code is checked first and spends itself, handing
    back a short-lived token; the new password is set with that token. The
    code is never replayed, and a password cannot be set without one.

    Arriving with no phone means the reset was never started — a refresh, or a
    bookmarked URL — so it goes back a step. */
export default function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyResetOtp, resetPassword } = useAuth();
  const toast = useAppStore((state) => state.toast);

  const phone = (location.state as ResetState | null)?.phone;

  const [digits, setDigits] = useState<string[]>(emptyCode);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiValidationError | null>(null);

  if (!phone) return <Navigate to={ROUTES.forgotPassword} replace />;

  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = isOtpComplete(digits) && !passwordProblem(password) && confirm === password;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setFailure(null);
    try {
      const { resetToken } = await verifyResetOtp(phone, digits.join(''));
      await resetPassword({ resetToken, password, confirmPassword: confirm });
      toast('success', t('auth.resetDoneTitle'), t('auth.resetDoneBody'));
      navigate(ROUTES.login, { replace: true });
    } catch (error) {
      setFailure(error instanceof ApiValidationError ? error : null);
      setDigits(emptyCode());
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Header back backTo={ROUTES.forgotPassword} />
      <ScreenBody className="auth-body">
        <form className="stack-lg" onSubmit={(event) => void submit(event)} noValidate>
          <div className="auth-intro">
            <h2>{t('auth.resetTitle')}</h2>
            <p>
              <RichText
                template={t('auth.resetSent')}
                nodes={{ contact: <strong className="tabular">{maskPhone(phone)}</strong> }}
              />
            </p>
          </div>

          {failure ? (
            <Callout tone="danger" icon={<AlertCircle size={18} aria-hidden="true" />}>
              {authErrorMessage(t, failure)}
            </Callout>
          ) : null}

          <OTPInput
            value={digits}
            onChange={(next) => {
              setDigits(next);
              if (failure) setFailure(null);
            }}
            invalid={Boolean(failure)}
            disabled={saving}
            label={t('auth.resetCodeLabel')}
          />

          <div className="stack">
            <PasswordInput
              value={password}
              onChange={setPassword}
              label={t('auth.newPasswordLabel')}
              hint={t('auth.passwordRule')}
            />
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              label={t('auth.confirmPasswordLabel')}
              meter={false}
              rules={false}
              error={mismatch ? t('auth.errPasswordMatch') : undefined}
            />
          </div>

          <Button type="submit" block size="lg" disabled={!ready} loading={saving}>
            {t('auth.savePassword')}
          </Button>

          <p className="tiny dim center">{t('auth.otpExpiry')}</p>
        </form>
      </ScreenBody>
    </Screen>
  );
}
