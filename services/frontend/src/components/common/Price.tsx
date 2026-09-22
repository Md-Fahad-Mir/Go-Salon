import { cn } from '../../utils/cn';
import { formatBdt } from '../../utils/format';

interface PriceProps {
  value: number;
  size?: 'md' | 'lg';
  accent?: boolean;
  prefix?: string;
  className?: string;
}

export function Price({ value, size = 'md', accent, prefix, className }: PriceProps) {
  return (
    <span className={cn('price', size === 'lg' && 'price-lg', accent && 'price-accent', className)}>
      {prefix ? <span className="dim" style={{ fontWeight: 500, fontSize: '0.8em' }}>{prefix} </span> : null}
      {formatBdt(value)}
    </span>
  );
}
