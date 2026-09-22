import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  children: ReactNode;
  pad?: boolean | 'sm';
  muted?: boolean;
  elevated?: boolean;
  selected?: boolean;
  /** Renders as a button for tappable cards. */
  onPress?: () => void;
  className?: string;
}

export function Card({ children, pad = true, muted, elevated, selected, onPress, className, ...rest }: CardProps) {
  const classes = cn(
    'card',
    pad === 'sm' ? 'card-pad-sm' : pad ? 'card-pad' : undefined,
    muted && 'card-muted',
    elevated && 'card-elevated',
    selected && 'card-selected',
    onPress && 'card-press',
    className,
  );
  if (onPress) {
    return (
      <button type="button" className={classes} onClick={onPress} style={{ textAlign: 'start', width: '100%' }}>
        {children}
      </button>
    );
  }
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
