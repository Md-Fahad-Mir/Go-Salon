import { Check } from 'lucide-react';
import { useId } from 'react';

interface Choice<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

interface ChoiceListProps<T extends string> {
  label: string;
  hint?: string;
  error?: string;
  value: T | undefined;
  onChange: (value: T) => void;
  options: Array<Choice<T>>;
}

/** A short list of mutually exclusive answers — who a barber's clients are,
    what kind of place a salon is. Takes resolved strings, so the caller keeps
    control of the wording, and reuses the app's own option row. */
export function ChoiceList<T extends string>({
  label,
  hint,
  error,
  value,
  onChange,
  options,
}: ChoiceListProps<T>) {
  const labelId = useId();
  return (
    <div className="field">
      <span className="field-label" id={labelId}>{label}</span>
      <div className="stack-sm" role="radiogroup" aria-labelledby={labelId}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="option"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(option.id)}
          >
            <span className="option-body">
              <span className="option-title">{option.label}</span>
              {option.hint ? <span className="option-sub">{option.hint}</span> : null}
            </span>
            {value === option.id ? <Check size={18} aria-hidden="true" className="option-end" /> : null}
          </button>
        ))}
      </div>
      {error ? (
        <p className="field-error" role="alert">{error}</p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
