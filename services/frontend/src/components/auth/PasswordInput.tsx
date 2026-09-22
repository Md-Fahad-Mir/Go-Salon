import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../hooks/useLanguage';
import type { TKey } from '../../i18n';
import { passwordProblem, passwordStrength } from '../../utils/validators';
import { Input } from '../common/Input';

const PROBLEM_KEYS: Record<'short' | 'weak', TKey> = {
  short: 'auth.errPasswordShort',
  weak: 'auth.errPasswordWeak',
};

const STRENGTH_KEYS: TKey[] = [
  'auth.pwStrengthWeak',
  'auth.pwStrengthWeak',
  'auth.pwStrengthOk',
  'auth.pwStrengthStrong',
];

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  /** Optional fields stay quiet until something is typed. */
  optional?: boolean;
  /** Show the problem even before the field is touched. */
  showError?: boolean;
  /** Hide the meter where a second field is only confirming the first. */
  meter?: boolean;
  /** Judge the password against the strength rules. A confirm field turns
      this off: the only thing wrong with it is not matching. */
  rules?: boolean;
  autoComplete?: 'new-password' | 'current-password';
  autoFocus?: boolean;
  /** Wins over the field's own rules — "these two do not match". */
  error?: string;
}

/** A password field with a reveal toggle and a strength meter. Used by
    registration and by the reset screen, so both judge a password the same. */
export function PasswordInput({
  value,
  onChange,
  label,
  hint,
  optional,
  showError,
  meter = true,
  rules = true,
  autoComplete = 'new-password',
  autoFocus,
  error,
}: PasswordInputProps) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const [touched, setTouched] = useState(false);

  const problem = !rules ? undefined : value ? passwordProblem(value) : optional ? undefined : 'short';
  const show = Boolean(error) || ((touched || showError) && Boolean(value || !optional) && Boolean(problem));
  const strength = passwordStrength(value);

  return (
    <div className="stack-xs">
      <Input
        label={label ?? t('auth.passwordLabel')}
        hint={hint}
        optional={optional}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setTouched(true)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        error={error ?? (show && problem ? t(PROBLEM_KEYS[problem]) : undefined)}
        suffix={
          <button
            type="button"
            className="auth-pw-toggle"
            onClick={() => setVisible((on) => !on)}
            aria-pressed={visible}
          >
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            <span className="sr-only">{visible ? t('auth.hidePassword') : t('auth.showPassword')}</span>
          </button>
        }
      />
      {meter && value ? (
        <div className="auth-pw-meter">
          <div className="auth-pw-bars" aria-hidden="true">
            {[1, 2, 3].map((step) => (
              <span key={step} data-on={strength >= step ? 'true' : undefined} data-level={strength} />
            ))}
          </div>
          <span className="auth-pw-level" aria-live="polite">{t(STRENGTH_KEYS[strength])}</span>
        </div>
      ) : null}
    </div>
  );
}
