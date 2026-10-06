import { ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  callingCodeOf,
  countryOfNumber,
  countryOptions,
  DEFAULT_COUNTRY,
  examplePhone,
  flagOf,
  fromInternational,
  fromNational,
  isValidPhone,
  nationalDisplay,
  type CountryCode,
} from '../../utils/phone';

interface PhoneInputProps {
  /** E.164 — "+8801712345678" — or '' while empty. Send it as it is. */
  value: string;
  onChange: (value: string) => void;
  /* `Field` adds these three; they belong on the number box. */
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** 'username' on a sign-in form, so a password manager fills it. Off
      otherwise: an admin is usually typing somebody else's number. */
  autoComplete?: string;
}

/** A country picker and the number, as one box. The flag and calling code
    open the platform's own list of every country; the number is spaced the
    way its country writes it. A number pasted with its calling code
    ("+44 7400 123456", "00880…") picks its own country. */
export function PhoneInput({ value, onChange, disabled, autoComplete = 'off', ...input }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<CountryCode>(() => countryOfNumber(value) ?? DEFAULT_COUNTRY);
  /** An international prefix still being typed ("+4"). */
  const [draft, setDraft] = useState('');

  /* The picked country, unless the number says otherwise — a saved one
     carries its own code, and a complete one names its exact country. */
  const country =
    (isValidPhone(value) ? countryOfNumber(value) : undefined) ??
    (value && !value.startsWith(`+${callingCodeOf(picked)}`) ? countryOfNumber(value) : undefined) ??
    picked;
  const callingCode = callingCodeOf(country);

  const type = (text: string) => {
    if (/^\s*(\+|00)/.test(text)) {
      const found = fromInternational(text);
      if (!found) {
        setDraft(`+${text.replace(/^\s*(\+|00)/, '').replace(/\D/g, '')}`);
        onChange('');
        return;
      }
      setDraft('');
      setPicked(found.country);
      onChange(found.value);
      return;
    }
    setDraft('');
    onChange(fromNational(text, country));
  };

  const pick = (next: CountryCode) => {
    setPicked(next);
    setDraft('');
    const national = value.startsWith(`+${callingCode}`) ? value.slice(callingCode.length + 1) : '';
    onChange(national ? fromNational(national, next) : '');
    inputRef.current?.focus();
  };

  return (
    <div className="phone-input" data-disabled={disabled ? 'true' : undefined}>
      <span className="phone-input-country">
        <span aria-hidden="true">{flagOf(country)}</span>
        <span aria-hidden="true">+{callingCode}</span>
        <ChevronDown size={14} aria-hidden="true" />
        <select
          aria-label="Country code"
          value={country}
          onChange={(event) => pick(event.target.value as CountryCode)}
          disabled={disabled}
        >
          {countryOptions().map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
      <input
        {...input}
        ref={inputRef}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        placeholder={examplePhone(country)}
        value={draft || nationalDisplay(value, country)}
        onChange={(event) => type(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
