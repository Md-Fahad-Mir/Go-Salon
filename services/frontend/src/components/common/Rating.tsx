import { Star } from 'lucide-react';
import { useT } from '../../hooks/useLanguage';
import type { TranslationKey } from '../../i18n';
import { formatNumber, formatRating } from '../../utils/format';

interface RatingProps {
  value: number;
  count?: number;
  size?: number;
  className?: string;
}

/** "★ 4.8 (214)" */
export function Rating({ value, count, size = 14, className }: RatingProps) {
  const t = useT();
  const label =
    count === undefined
      ? t('rating.ratedOutOf', { value: formatRating(value) })
      : t('rating.ratedFrom', { value: formatRating(value), count });
  return (
    <span className={`rating ${className ?? ''}`} aria-label={label}>
      <Star size={size} className="star" fill="currentColor" aria-hidden="true" />
      <span className="rating-value">{formatRating(value)}</span>
      {count !== undefined ? <span className="rating-count">({formatNumber(count)})</span> : null}
    </span>
  );
}

interface StarPickerProps {
  value: number;
  onChange: (value: number) => void;
  size?: number;
  label?: string;
}

const WORD_KEYS: TranslationKey[] = ['rating.word1', 'rating.word2', 'rating.word3', 'rating.word4', 'rating.word5'];

export function StarPicker({ value, onChange, size = 30, label }: StarPickerProps) {
  const t = useT();
  const word = value >= 1 && value <= 5 ? t(WORD_KEYS[value - 1]) : t('rating.tapStar');
  return (
    <div className="stack-xs" style={{ alignItems: 'center' }}>
      <div className="stars stars-lg" role="radiogroup" aria-label={label ?? t('rating.yourRating')}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={t('rating.stars', { count: star })}
            className="star-btn"
            data-on={star <= value ? 'true' : undefined}
            onClick={() => onChange(star)}
          >
            <Star size={size} fill={star <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
      <span className="caption" aria-live="polite">{word}</span>
    </div>
  );
}
