import { Star } from 'lucide-react';
import { useT } from '../../hooks/useLanguage';
import { formatRating } from '../../utils/format';

interface RatingProps {
  value: number;
  size?: number;
  className?: string;
}

/** "★ 4.8" */
export function Rating({ value, size = 14, className }: RatingProps) {
  const t = useT();
  return (
    <span className={`rating ${className ?? ''}`} aria-label={t('rating.ratedOutOf', { value: formatRating(value) })}>
      <Star size={size} className="star" fill="currentColor" aria-hidden="true" />
      <span className="rating-value">{formatRating(value)}</span>
    </span>
  );
}
