import { useT } from '../../hooks/useLanguage';
import { cn } from '../../utils/cn';

interface BrandMarkProps {
  size?: 'md' | 'lg' | 'xl';
  /** Hide the word-mark and show only the gold "E" tile. */
  markOnly?: boolean;
  className?: string;
}

/** The Eureka mark: a gold tile with an "E" and the word-mark beside it.
    Mirrors the header brand so the splash, sign-in and home all agree. */
export function BrandMark({ size = 'md', markOnly, className }: BrandMarkProps) {
  const t = useT();
  return (
    <span className={cn('auth-brand', `auth-brand-${size}`, className)}>
      <span className="auth-brand-mark" aria-hidden="true">E</span>
      {markOnly ? (
        <span className="sr-only">{t('app.name')}</span>
      ) : (
        <span className="auth-brand-word">{t('app.name')}</span>
      )}
    </span>
  );
}
