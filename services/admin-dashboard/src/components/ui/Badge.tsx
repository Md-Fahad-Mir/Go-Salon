import type { ReactNode } from 'react';
import type { Tone } from '../../constants';
import { cn } from '../../utils/cn';

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  /** Drops the leading dot — useful inside dense table cells. */
  plain?: boolean;
}

/** Status pill. The written label always carries the meaning, so colour is
    never the only signal (WCAG 1.4.1). */
export function Badge({ tone = 'neutral', children, plain = false }: BadgeProps) {
  return (
    <span className={cn('badge', `badge-${tone}`, plain && 'badge-plain')}>{children}</span>
  );
}
