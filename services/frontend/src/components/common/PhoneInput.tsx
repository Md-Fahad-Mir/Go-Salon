import { Check, ChevronDown } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import {
  callingCodeOf,
  countryOfNumber,
  countryOptions,
  examplePhone,
  flagOf,
  fromInternational,
  fromNational,
  isValidPhone,
  nationalDisplay,
  preferredCountry,
  rememberCountry,
  type CountryCode,
} from '../../utils/phone';
import { Field } from './Input';

interface PhoneInputProps {
  /** The number in E.164 — "+8801712345678" — or '' while nothing has been
      typed. Ready to send as it is. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: string;
  hint?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  optional?: boolean;
}

/** A country and the number, as one field: the flag and calling code open a
    list of every country, and the rest takes the number the way that country
    writes it, spaced as it is typed. A number pasted or autofilled with its
    calling code ("+44 7911 123456", "00880…") picks its own country. */
export function PhoneInput({ value, onChange, error, label, hint, autoFocus, disabled, optional }: PhoneInputProps) {
  const { t, locale } = useLanguage();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<CountryCode>(() => countryOfNumber(value) ?? preferredCountry());
  /* "+4" — an international prefix still being typed. Not a number yet, so
     it is held here, not handed up, until its calling code is complete. */
  const [draft, setDraft] = useState('');

  const valid = isValidPhone(value);
  /* The picked country, unless the number says otherwise: one handed in from
     outside (a saved profile loading) carries its own code, and a complete
     one names its exact country — +1 is the US, Canada and much of the
     Caribbean, and only the area code tells them apart. */
  const country =
    (valid ? countryOfNumber(value) : undefined) ??
    (value && !value.startsWith(`+${callingCodeOf(picked)}`) ? countryOfNumber(value) : undefined) ??
    picked;
  const callingCode = callingCodeOf(country);
  const options = useMemo(() => countryOptions(locale), [locale]);

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
    rememberCountry(next);
    setDraft('');
    // Digits already typed stay, read as a number in the new country.
    const national = value.startsWith(`+${callingCode}`) ? value.slice(callingCode.length + 1) : '';
    onChange(national ? fromNational(national, next) : '');
    inputRef.current?.focus();
  };

  return (
    <Field id={id} label={label ?? t('form.phoneLabel')} hint={hint} error={error} optional={optional}>
      <div className="input-group" data-invalid={error ? 'true' : undefined}>
        <span className="input-prefix phone-country">
          <span aria-hidden="true">{flagOf(country)}</span>
          <span aria-hidden="true">+{callingCode}</span>
          <ChevronDown size={14} aria-hidden="true" className="phone-country-chevron" />
          <select
            className="phone-country-select"
            aria-label={t('form.countryCode')}
            value={country}
            onChange={(event) => pick(event.target.value as CountryCode)}
            disabled={disabled}
          >
            {options.map((option) => (
              <option key={option.code} value={option.code}>
                {`${option.flag} ${option.name} (+${option.callingCode})`}
              </option>
            ))}
          </select>
        </span>
        <input
          ref={inputRef}
          id={id}
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={examplePhone(country)}
          value={draft || nationalDisplay(value, country)}
          onChange={(event) => type(event.target.value)}
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
