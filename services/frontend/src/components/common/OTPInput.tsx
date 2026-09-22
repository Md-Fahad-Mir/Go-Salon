import { useEffect, useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { OTP_LENGTH } from '../../constants';
import { useT } from '../../hooks/useLanguage';

interface OTPInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}

/** Six single-digit boxes with auto-advance, backspace, paste and OS
    one-time-code autofill. */
export function OTPInput({ value, onChange, invalid, disabled, autoFocus = true, label }: OTPInputProps) {
  const t = useT();
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focus = (index: number) => refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))]?.focus();

  const fill = (from: number, digits: string) => {
    const next = [...value];
    let cursor = from;
    for (const ch of digits) {
      if (cursor >= OTP_LENGTH) break;
      next[cursor] = ch;
      cursor += 1;
    }
    onChange(next);
    focus(Math.min(cursor, OTP_LENGTH - 1));
  };

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      const next = [...value];
      next[index] = '';
      onChange(next);
      return;
    }
    // Autofill and paste land here as a multi-character value.
    if (digits.length > 1) {
      fill(index, digits);
      return;
    }
    const next = [...value];
    next[index] = digits;
    onChange(next);
    if (index < OTP_LENGTH - 1) focus(index + 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      if (value[index]) {
        const next = [...value];
        next[index] = '';
        onChange(next);
      } else if (index > 0) {
        const next = [...value];
        next[index - 1] = '';
        onChange(next);
        focus(index - 1);
      }
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      focus(index - 1);
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      focus(index + 1);
      event.preventDefault();
    }
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!digits) return;
    event.preventDefault();
    fill(index, digits);
  };

  return (
    <div
      className="otp"
      role="group"
      aria-label={label ?? t('form.verificationCode')}
      data-invalid={invalid ? 'true' : undefined}
    >
      {Array.from({ length: OTP_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          className="otp-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={OTP_LENGTH}
          value={value[index] ?? ''}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.target.select()}
          aria-label={t('form.digit', { index: index + 1 })}
          aria-invalid={invalid || undefined}
          data-filled={value[index] ? 'true' : undefined}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
