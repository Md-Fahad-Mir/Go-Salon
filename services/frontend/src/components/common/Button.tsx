import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'accent-soft'
  | 'danger'
  | 'danger-soft'
  | 'coral'
  | 'light';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  pill?: boolean;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  className?: string;
  children?: ReactNode;
}

interface ButtonProps extends BaseProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  loading?: boolean;
}

const classes = ({ variant = 'primary', size = 'md', block, pill, className }: BaseProps) =>
  cn(
    'btn',
    `btn-${variant}`,
    size !== 'md' && `btn-${size}`,
    block && 'btn-block',
    pill && 'btn-pill',
    className,
  );

export function Button({
  variant,
  size,
  block,
  pill,
  icon,
  iconEnd,
  className,
  loading,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes({ variant, size, block, pill, className })}
      disabled={disabled || loading}
      data-loading={loading ? 'true' : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon}
      {children}
      {iconEnd}
    </button>
  );
}

interface LinkButtonProps extends BaseProps {
  to: string;
  replace?: boolean;
  state?: unknown;
  onClick?: () => void;
}

/** A router link that looks exactly like a button. */
export function LinkButton({ to, replace, state, onClick, icon, iconEnd, children, ...style }: LinkButtonProps) {
  return (
    <Link to={to} replace={replace} state={state} onClick={onClick} className={classes(style)}>
      {icon}
      {children}
      {iconEnd}
    </Link>
  );
}
