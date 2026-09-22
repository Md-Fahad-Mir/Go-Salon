import { AlertCircle, KeyRound } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Input } from '../../components/common/Input';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { ROUTES } from '../../constants';
import { authErrorMessage } from '../../components/auth/errors';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../hooks/useLanguage';
import { ApiValidationError } from '../../utils/apiClient';
import { isValidPhone, toE164 } from '../../utils/validators';

/** Starting a password reset.

    The backend answers the same whether or not the number has an account, so
    this screen cannot be used to find out who holds one. It moves on either
    way and the code — which only a real account receives — is what decides. */
export default function ForgotPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const { forgotPassword } = useAuth();

  const [contact, setContact] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<ApiValidationError | null>(null);

  const value = contact.trim();
  const valid = isValidPhone(value);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || sending) return;
    setSending(true);
    setFailure(null);
    try {
      const phone = toE164(value);
      await forgotPassword(phone);
      navigate(ROUTES.resetPassword, { state: { phone } });
    } catch (error) {
      setFailure(error instanceof ApiValidationError ? error : null);
      setSending(false);
    }
  };

  return (
    <Screen>
      <Header back backTo={ROUTES.login} />
      <ScreenBody className="auth-body">
        <form className="stack-lg" onSubmit={(event) => void submit(event)} noValidate>
          <div className="auth-intro">
            <span className="icon-circle" aria-hidden="true"><KeyRound size={24} /></span>
            <h2>{t('auth.forgotTitle')}</h2>
            <p>{t('auth.forgotSub')}</p>
          </div>

          {failure ? (
            <Callout tone="danger" icon={<AlertCircle size={18} aria-hidden="true" />}>
              {authErrorMessage(t, failure)}
            </Callout>
          ) : null}

          <Input
            label={t('auth.contactLabel')}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            onBlur={() => setTouched(true)}
            error={touched && value && !valid ? t('auth.errContact') : undefined}
            inputMode="tel"
            hint={t('auth.contactHint')}
            placeholder={t('auth.contactPlaceholder')}
            autoComplete="username"
            autoFocus
            disabled={sending}
          />

          <Button type="submit" block size="lg" disabled={!valid} loading={sending}>
            {t('auth.sendResetCode')}
          </Button>
        </form>

        <Callout tone="info" className="mt-auto">{t('auth.forgotOtpNote')}</Callout>

        <p className="auth-foot-link small dim center">
          <Link to={ROUTES.login} className="link-btn">{t('auth.backToSignIn')}</Link>
        </p>
      </ScreenBody>
    </Screen>
  );
}
