import { ChevronDown } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';
import { currencyName, currencyOptions, isWholeOnly } from '../../utils/currency';

interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type' | 'value' | 'onChange'> {
  /** ISO 4217 — "BDT". */
  currency: string;
  onCurrencyChange: (currency: string) => void;
  /** Kept as typed, so the box can be empty mid-edit. */
  amount: string;
  onAmountChange: (amount: string) => void;
  /** Currencies used elsewhere, listed but not choosable. */
  taken?: readonly string[];
  /** Names the picker for a screen reader. */
  currencyLabel?: string;
}

/** A currency picker and the amount, as one box — the phone field's shape.
    The code is what shows; the platform's own list of every currency opens
    over it, and typing a code into that list ("USD") finds it. Every other
    prop — `Field`'s id and aria attributes included — goes to the amount. */
export function MoneyInput({
  currency,
  onCurrencyChange,
  amount,
  onAmountChange,
  taken = [],
  currencyLabel = 'Currency',
  disabled,
  ...input
}: MoneyInputProps) {
  const whole = isWholeOnly(currency);
  return (
    <div className="money-input" data-disabled={disabled ? 'true' : undefined}>
      <span className="money-input-currency" title={currencyName(currency)}>
        <span aria-hidden="true">{currency}</span>
        <ChevronDown size={14} aria-hidden="true" />
        <select
          aria-label={currencyLabel}
          value={currency}
          onChange={(event) => onCurrencyChange(event.target.value)}
          disabled={disabled}
        >
          {currencyOptions().map((option) => (
            <option
              key={option.code}
              value={option.code}
              disabled={option.code !== currency && taken.includes(option.code)}
            >
              {option.label}
            </option>
          ))}
        </select>
      </span>
      <input
        {...input}
        type="number"
        inputMode={whole ? 'numeric' : 'decimal'}
        min={0}
        step={whole ? 1 : 0.01}
        value={amount}
        onChange={(event) => onAmountChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
