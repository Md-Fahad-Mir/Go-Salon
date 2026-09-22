import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  small?: boolean;
  className?: string;
}

export function Chip({ active, onClick, children, icon, small, className }: ChipProps) {
  return (
    <button type="button" className={cn('chip', small && 'chip-sm', className)} aria-pressed={active} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

/** Horizontal row of chips; `scroll` keeps them on one swipeable line. */
export function ChipRow({ children, scroll, className, label }: { children: ReactNode; scroll?: boolean; className?: string; label?: string }) {
  return (
    <div className={cn('chips', scroll && 'chips-scroll bleed', className)} role={label ? 'group' : undefined} aria-label={label}>
      {children}
    </div>
  );
}
