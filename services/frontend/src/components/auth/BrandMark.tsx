import { useT } from '../../hooks/useLanguage';
import { cn } from '../../utils/cn';

interface BrandMarkProps {
  size?: 'md' | 'lg' | 'xl';
  /** Hide the word-mark and show only the gold tile. */
  markOnly?: boolean;
  className?: string;
}

/** Open shears whose finger rings spell the name: the left ring is a G — its
    top stroke runs on into the arm — and the smaller right ring is the o. Ink
    is currentColor; the pivot hole takes --mark-hole so it reads as a hole in
    whatever tile it sits on. The PWA icons in public/icons draw the same paths. */
export function GoSalonMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <g transform="translate(1 -2.6)">
        <path d="M21.2 21.59 L34.3 9.8 Q31.1 18.5 24.86 24.69 Z" fill="currentColor" />
        <path d="M26.82 21.76 L15 10 Q17.39 18.52 22.98 24.64 Z" fill="currentColor" />
        <path
          d="M24 22 L17.39 29.81 A6.8 6.8 0 1 0 19.8 35 H15.6"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M24 22 L31.38 31.84" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="34.5" cy="36" r="5.2" stroke="currentColor" strokeWidth="3.2" />
        <circle cx="24" cy="22" r="1.1" fill="var(--mark-hole, transparent)" />
      </g>
    </svg>
  );
}

/** The Go Salon mark: a gold tile with the shears and the word-mark beside it.
    Used on the splash and sign-in so both agree. */
export function BrandMark({ size = 'md', markOnly, className }: BrandMarkProps) {
  const t = useT();
  return (
    <span className={cn('auth-brand', `auth-brand-${size}`, className)}>
      <span className="auth-brand-mark" aria-hidden="true">
        <GoSalonMark />
      </span>
      {markOnly ? (
        <span className="sr-only">{t('app.name')}</span>
      ) : (
        <span className="auth-brand-word">{t('app.name')}</span>
      )}
    </span>
  );
}
