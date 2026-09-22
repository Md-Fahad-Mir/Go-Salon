import { AlertCircle, Check } from 'lucide-react';
import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useT } from '../../hooks/useLanguage';
import { cn } from '../../utils/cn';

interface FieldChrome {
  label?: string;
  hint?: string;
  error?: string;
  success?: string;
  optional?: boolean;
  className?: string;
}

interface FieldProps extends FieldChrome {
  id: string;
  children: ReactNode;
}

/** Label / control / message wrapper shared by every text control. */
export function Field({ id, label, hint, error, success, optional, className, children }: FieldProps) {
  const t = useT();
  return (
    <div className={cn('field', className)}>
      {label ? (
        <label className="field-label" htmlFor={id}>
          {label}
          {optional ? <span className="optional"> · {t('field.optional')}</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          <AlertCircle size={14} aria-hidden="true" /> {error}
        </p>
      ) : success ? (
        <p className="field-success" id={`${id}-hint`}>{success}</p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends FieldChrome, Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  icon?: ReactNode;
  /** Trailing content; pass `true` for a green check. */
  suffix?: ReactNode | true;
  inputClassName?: string;
}

export function Input({
  label, hint, error, success, optional, className, icon, suffix, inputClassName, id: givenId, ...rest
}: InputProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  const describedBy = error ? `${id}-error` : hint || success ? `${id}-hint` : undefined;
  const control = (
    <input
      id={id}
      className={cn('input', inputClassName)}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      {...rest}
    />
  );
  return (
    <Field id={id} label={label} hint={hint} error={error} success={success} optional={optional} className={className}>
      {icon || suffix ? (
        <div className="input-wrap" data-suffix={suffix ? 'true' : undefined}>
          {icon ? <span className="input-icon">{icon}</span> : null}
          {control}
          {suffix === true ? (
            <span className="input-suffix success"><Check size={18} aria-hidden="true" /></span>
          ) : suffix ? (
            <span className="input-suffix">{suffix}</span>
          ) : null}
        </div>
      ) : (
        control
      )}
    </Field>
  );
}

interface TextareaProps extends FieldChrome, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {}

export function Textarea({ label, hint, error, success, optional, className, id: givenId, ...rest }: TextareaProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Field id={id} label={label} hint={hint} error={error} success={success} optional={optional} className={className}>
      <textarea
        id={id}
        className="textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...rest}
      />
    </Field>
  );
}

interface SelectProps extends FieldChrome, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function Select({ label, hint, error, success, optional, className, options, placeholder, id: givenId, ...rest }: SelectProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <Field id={id} label={label} hint={hint} error={error} success={success} optional={optional} className={className}>
      <select id={id} className="select" aria-invalid={error ? true : undefined} {...rest}>
        {placeholder ? <option value="" disabled>{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </Field>
  );
}
