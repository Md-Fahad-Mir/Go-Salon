import type { ReactNode } from 'react';
import type { ButtonSize, ButtonVariant } from '../common/Button';
import { cn } from '../../utils/cn';

interface ExternalButtonProps {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Open in a new tab (maps); off for tel: / mailto: links. */
  newTab?: boolean;
  className?: string;
}

/** An anchor styled exactly like <Button>, for maps, calls and mail. */
export function ExternalButton({
  href, children, icon, variant = 'secondary', size = 'md', block, newTab = true, className,
}: ExternalButtonProps) {
  return (
    <a
      href={href}
      className={cn('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', className)}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noreferrer' : undefined}
    >
      {icon}
      {children}
    </a>
  );
}
