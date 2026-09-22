import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, hint, disabled }: CheckboxProps) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span className="check-box" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
      <span className="check-label">
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}
