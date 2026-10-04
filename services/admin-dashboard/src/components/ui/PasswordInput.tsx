import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../utils/cn';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** A password field with a show/hide toggle. Every prop — including the id
    and aria attributes `Field` injects — lands on the <input> itself, so the
    label stays wired to the control rather than to the wrapper. */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="input-affix">
      <input {...props} type={visible ? 'text' : 'password'} className={cn('input', className)} />
      <button
        type="button"
        className="input-affix-btn"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
