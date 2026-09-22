import type { ReactNode } from 'react';
import type { ButtonVariant } from '../../common/Button';
import { cn } from '../../../utils/cn';

interface ContactButtonProps {
  /** A `tel:` or `sms:` URL. */
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  variant?: ButtonVariant;
  block?: boolean;
}

/* The customer app has no dialler button of its own — its ExternalButton opens
   a new tab, which a `tel:` link must never do — so the provider side keeps a
   small anchor styled exactly like <Button>. */
export function ContactButton({ href, children, icon, variant = 'secondary', block = true }: ContactButtonProps) {
  return (
    <a href={href} className={cn('btn', `btn-${variant}`, block && 'btn-block')}>
      {icon}
      {children}
    </a>
  );
}
