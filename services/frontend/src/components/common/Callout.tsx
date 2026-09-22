import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface CalloutProps {
  tone?: 'default' | 'accent' | 'warning' | 'danger' | 'success' | 'info';
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Callout({ tone = 'default', icon, title, children, className }: CalloutProps) {
  return (
    <div className={cn('callout', tone !== 'default' && `callout-${tone}`, className)} role={tone === 'danger' ? 'alert' : undefined}>
      {icon}
      <div>
        {title ? <strong>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}
