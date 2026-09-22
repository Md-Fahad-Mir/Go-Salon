import { useId } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Hide the visible text but keep it for screen readers. */
  hideLabel?: boolean;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, hideLabel = false, disabled = false }: ToggleProps) {
  const id = useId();
  return (
    <label className="switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" />
      <span className={hideLabel ? 'sr-only' : 'switch-label'}>{label}</span>
    </label>
  );
}
