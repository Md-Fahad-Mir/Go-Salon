import { Check } from 'lucide-react';
import { useId } from 'react';
import { useT } from '../../hooks/useLanguage';
import { formatLocalPhone, isValidPhone, localDigits } from '../../utils/validators';
import { Field } from './Input';

interface PhoneInputProps {
  /** Local digits after +880, e.g. "1712345678". */
  value: string;
  onChange: (digits: string) => void;
  error?: string;
  label?: string;
  hint?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  optional?: boolean;
}

/** +880 prefix, digits only, auto-spaced as you type. */
export function PhoneInput({ value, onChange, error, label, hint, autoFocus, disabled, optional }: PhoneInputProps) {
  const t = useT();
  const id = useId();
  const valid = isValidPhone(value);
  return (
    <Field id={id} label={label ?? t('form.phoneLabel')} hint={hint} error={error} optional={optional}>
      <div className="input-group" data-invalid={error ? 'true' : undefined}>
        <span className="input-prefix" aria-hidden="true">
          <span role="img" aria-label={t('form.bangladesh')}>🇧🇩</span> +880
        </span>
        <input
          id={id}
          className="input"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={t('form.phonePlaceholder')}
          value={formatLocalPhone(value)}
          onChange={(event) => onChange(localDigits(event.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          autoFocus={autoFocus}
          disabled={disabled}
        />
        {valid && !error ? (
          <span className="input-suffix" aria-label={t('form.looksGood')}><Check size={18} /></span>
        ) : null}
      </div>
    </Field>
  );
}
