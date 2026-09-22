import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name — icon buttons never have visible text. */
  label: string;
  children: ReactNode;
  variant?: 'plain' | 'solid' | 'scrim' | 'accent';
  active?: boolean;
  /** Small coral dot for unread state. */
  dot?: boolean;
}

export function IconButton({ label, children, variant = 'plain', active, dot, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn('icon-btn', variant !== 'plain' && `icon-btn-${variant}`, className)}
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...rest}
    >
      {children}
      {dot ? <span className="dot-badge" aria-hidden="true" /> : null}
    </button>
  );
}
