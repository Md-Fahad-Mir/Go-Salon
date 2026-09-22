import { useState } from 'react';
import { useT } from '../../hooks/useLanguage';
import type { TKey } from '../../i18n';
import { emailProblem, nameError, phoneError } from '../../utils/validators';
import { Input } from '../common/Input';
import { PhoneInput } from '../common/PhoneInput';
import { PasswordInput } from './PasswordInput';

const EMAIL_KEYS: Record<'empty' | 'invalid', TKey> = {
  empty: 'auth.errEmailRequired',
  invalid: 'auth.errEmail',
};

interface RegisterStepAccountProps {
  phone: string;
  name: string;
  email: string;
  password: string;
  onPhone: (value: string) => void;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  /** A business account needs somewhere to send receipts; a customer's is
      optional. */
  emailRequired?: boolean;
  titleKey?: TKey;
  subKey?: TKey;
  /** Whatever the server said was wrong with a field, by field name. */
  serverErrors?: Record<string, string | undefined>;
}

/** Step one of every sign-up: the number the account will be, and the
    password that opens it. The number is verified with a code straight after
    this form is submitted, which is the only time anyone is asked for one. */
export function RegisterStepAccount({
  phone,
  name,
  email,
  password,
  onPhone,
  onName,
  onEmail,
  onPassword,
  emailRequired = true,
  titleKey = 'auth.proAccountTitle',
  subKey = 'auth.proAccountSub',
  serverErrors = {},
  showErrors,
}: RegisterStepAccountProps & { showErrors: boolean }) {
  const t = useT();
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const trimmed = name.trim();
  const nameProblem = !nameError(name)
    ? undefined
    : !trimmed
      ? t('auth.errNameEmpty')
      : trimmed.length < 2
        ? t('auth.errNameShort')
        : t('auth.errNameLong');
  const emailIssue = emailProblem(email, emailRequired);

  return (
    <div className="auth-step stack-lg">
      <div className="auth-intro">
        <h2 tabIndex={-1}>{t(titleKey)}</h2>
        <p>{t(subKey)}</p>
      </div>

      <div className="stack">
        <PhoneInput
          value={phone}
          onChange={(value) => {
            onPhone(value);
            setPhoneTouched(true);
          }}
          label={t('auth.mobileNumber')}
          hint={t('auth.phoneSignUpHint')}
          /* `phoneError` stays quiet until the number is long enough to judge,
             which the hand-rolled test here did not: a half-typed number was
             being told off for its operator prefix, and the prefix was fine. */
          error={
            serverErrors.phone ??
            ((phoneTouched || showErrors) && phoneError(phone) ? t('auth.errPhoneDigits') : undefined)
          }
          autoFocus
        />
        <Input
          label={t('auth.nameLabel')}
          value={name}
          onChange={(event) => onName(event.target.value)}
          onBlur={() => setNameTouched(true)}
          error={serverErrors.name ?? ((nameTouched || showErrors) ? nameProblem : undefined)}
          placeholder={t('auth.namePlaceholder')}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={40}
        />
        <Input
          label={t('auth.emailLabel')}
          optional={!emailRequired}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => onEmail(event.target.value)}
          onBlur={() => setEmailTouched(true)}
          error={
            serverErrors.email ??
            ((emailTouched || showErrors) && emailIssue ? t(EMAIL_KEYS[emailIssue]) : undefined)
          }
          hint={emailRequired ? t('auth.proEmailHint') : t('auth.emailHint')}
          placeholder={t('auth.emailPlaceholder')}
        />
        <PasswordInput
          value={password}
          onChange={onPassword}
          showError={showErrors}
          hint={t('auth.passwordRule')}
          error={serverErrors.password}
        />
      </div>
    </div>
  );
}
