import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ACCOUNT_TYPE_KEYS } from '../../components/auth/accountTypes';
import { BrandMark } from '../../components/auth/BrandMark';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { RichText } from '../../components/auth/RichText';
import { SocialButtons } from '../../components/auth/SocialButtons';
import { authErrorMessage, fieldMessage } from '../../components/auth/errors';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { PhoneInput } from '../../components/common/PhoneInput';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { ROUTES } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { ApiValidationError } from '../../utils/apiClient';
import { isValidPhone, phoneError, toE164 } from '../../utils/validators';

/** Signing in: a phone number and a password.

    No code. A phone is proved once, when the account is made; asking for one
    on every sign-in would be security theatre paid for by the user. An
    account that never finished proving its number is sent to do that now —
    which is also how an employee whose account their owner created gets in
    the first time. */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const { login, startVerification, landingRouteForUser, accountType, chooseAccountType } = useAuth();
  const toast = useAppStore((s) => s.toast);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ApiValidationError | null>(null);

  const valid = isValidPhone(phone) && password.length > 0;

  /* `phoneError` tells us *whether* the number is wrong; the copy comes from
     the dictionary so it reads in the active language. It does not say which
     operator prefixes are valid — that is a rule the field enforces, not a
     lesson the person needs read to them. */
  const phoneProblem =
    fieldMessage(failure, 'phone') ?? (phoneError(phone) ? t('auth.errPhoneDigits') : undefined);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const user = await login(toE164(phone), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? landingRouteForUser(user), { replace: true });
    } catch (error) {
      if (error instanceof ApiValidationError && error.code === 'phone_not_verified') {
        // The password was right; the number was never proved. Send a code
        // and let them finish what was started.
        try {
          await startVerification(toE164(phone));
        } catch {
          // A code may already be in flight (the cooldown says so). Either
          // way the next screen is the one that takes it.
        }
        navigate(ROUTES.otp);
        return;
      }
      setFailure(error instanceof ApiValidationError ? error : null);
      setSubmitting(false);
    }
  };

  const social = () => toast('info', t('auth.socialSoonTitle'), t('auth.socialSoonBody'));

  return (
    <Screen>
      <Header back backTo={ROUTES.welcome} />
      <ScreenBody className="auth-body">
        <form className="stack-lg" onSubmit={(event) => void submit(event)} noValidate>
          <div className="auth-intro">
            <BrandMark size="lg" markOnly />
            <h2>{t('auth.signInTitle')}</h2>
            <p>{t('auth.signInSub')}</p>
          </div>

          {accountType ? (
            <div className="auth-chosen">
              <span className="auth-chosen-text">
                {t('auth.creatingAs', { type: t(ACCOUNT_TYPE_KEYS[accountType]) })}
              </span>
              <button type="button" className="link-btn" onClick={() => chooseAccountType(null)}>
                {t('auth.changeType')}
              </button>
            </div>
          ) : null}

          {failure ? (
            <Callout tone="danger" icon={<AlertCircle size={18} aria-hidden="true" />}>
              {authErrorMessage(t, failure)}
            </Callout>
          ) : null}

          <PhoneInput
            value={phone}
            onChange={(value) => {
              setPhone(value);
              if (failure) setFailure(null);
            }}
            label={t('auth.mobileNumber')}
            error={phoneProblem}
            autoFocus
            disabled={submitting}
          />

          <PasswordInput
            value={password}
            onChange={(value) => {
              setPassword(value);
              if (failure) setFailure(null);
            }}
            label={t('auth.passwordLabel')}
            autoComplete="current-password"
            meter={false}
            rules={false}
            error={fieldMessage(failure, 'password')}
          />

          <Button type="submit" block size="lg" disabled={!valid} loading={submitting}>
            {t('auth.signIn')}
          </Button>

          <p className="auth-foot-link small center">
            <Link to={ROUTES.forgotPassword} className="link-btn">{t('auth.forgotPassword')}</Link>
          </p>
        </form>

        <div className="divider-text" aria-hidden="true">{t('auth.or')}</div>

        <SocialButtons onPick={social} disabled={submitting} />

        <p className="auth-foot-link small dim center">
          {t('auth.noAccount')}{' '}
          <Link to={ROUTES.register} className="link-btn">{t('auth.createAccount')}</Link>
        </p>

        <p className="auth-terms small dim center mt-auto">
          <RichText
            template={t('auth.loginTerms')}
            nodes={{
              terms: <span className="auth-link">{t('auth.terms')}</span>,
              privacy: <span className="auth-link">{t('auth.privacy')}</span>,
            }}
          />
        </p>
      </ScreenBody>
    </Screen>
  );
}
