import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
  /** Marks the box as what is wrong with the form. The sign-up wizard reveals
      a problem by focusing the first `[aria-invalid="true"]`, and a checkbox
      that never set it could not be found — focus stayed on the button. */
  invalid?: boolean;
  /** The id of the message that says why. */
  describedBy?: string;
}

export function Checkbox({ checked, onChange, label, hint, disabled, invalid, describedBy }: CheckboxProps) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
      />
      <span className="check-box" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
      <span className="check-label">
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}
