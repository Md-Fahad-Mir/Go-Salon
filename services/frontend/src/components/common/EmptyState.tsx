import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'accent' | 'neutral' | 'success' | 'danger' | 'warning';
  className?: string;
}

export function EmptyState({ icon, title, description, action, tone = 'neutral', className }: EmptyStateProps) {
  return (
    <div className={cn('empty', className)}>
      <span className={cn('icon-circle', tone !== 'accent' && `icon-circle-${tone}`)}>{icon}</span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
