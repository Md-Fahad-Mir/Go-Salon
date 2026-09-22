import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

interface TrendIndicatorProps {
  tone: 'positive' | 'negative' | 'neutral';
  children: string;
}

/** Arrow + text. The arrow direction repeats what the colour says, so the
    trend survives greyscale printing and colour-blind viewing. */
export function TrendIndicator({ tone, children }: TrendIndicatorProps) {
  const Icon = tone === 'positive' ? ArrowUpRight : tone === 'negative' ? ArrowDownRight : Minus;
  const color =
    tone === 'positive'
      ? 'var(--status-success-ink)'
      : tone === 'negative'
        ? 'var(--status-danger-ink)'
        : 'var(--text-tertiary)';

  return (
    <span className="kpi-foot" style={{ color }}>
      <Icon size={14} aria-hidden="true" />
      {children}
    </span>
  );
}
