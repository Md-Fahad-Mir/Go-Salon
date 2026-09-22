interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, hint, disabled }: ToggleProps) {
  return (
    <label className="switch">
      <span className="switch-text">
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <input type="checkbox" role="switch" checked={checked} aria-checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}
