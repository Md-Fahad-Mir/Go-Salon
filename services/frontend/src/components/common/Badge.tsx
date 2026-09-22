import type { ReactNode } from 'react';
import { BOOKING_STATUS_TONES, type Tone } from '../../constants';
import type { BookingStatus } from '../../types';
import { useT } from '../../hooks/useLanguage';
import type { TranslationKey } from '../../i18n';
import { cn } from '../../utils/cn';

/* The written label lives in the dictionary; `constants` keeps only the tone,
   so the badge reads in whichever language is active. */
const STATUS_KEYS: Record<BookingStatus, TranslationKey> = {
  pending: 'status.pending',
  approved: 'status.confirmed',
  rejected: 'status.rejected',
  completed: 'status.completed',
  cancelled: 'status.cancelled',
  rescheduled: 'status.rescheduled',
};

interface BadgeProps {
  tone?: Tone | 'solid' | 'dark';
  plain?: boolean;
  pill?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', plain, pill, children, className }: BadgeProps) {
  return (
    <span className={cn('badge', `badge-${tone}`, plain && 'badge-plain', pill && 'badge-pill', className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const t = useT();
  return <Badge tone={BOOKING_STATUS_TONES[status]}>{t(STATUS_KEYS[status])}</Badge>;
}
