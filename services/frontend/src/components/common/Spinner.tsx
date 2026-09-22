import { useT } from '../../hooks/useLanguage';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function Spinner({ size = 'md', label }: SpinnerProps) {
  const t = useT();
  return (
    <span
      className={`spinner ${size !== 'md' ? `spinner-${size}` : ''}`}
      role="status"
      aria-label={label ?? t('action.loading')}
    />
  );
}
