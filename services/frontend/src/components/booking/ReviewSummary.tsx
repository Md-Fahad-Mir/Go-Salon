import { Star } from 'lucide-react';
import { useT } from '../../hooks/useLanguage';
import { formatNumber, formatRating } from '../../utils/format';
import type { ReviewSummary as Summary } from '../../utils/reviewService';
import { Card } from '../common/Card';

const STARS = [5, 4, 3, 2, 1] as const;

export function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span className="pro-stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={size} fill={star <= rounded ? 'currentColor' : 'none'} data-off={star <= rounded ? undefined : 'true'} />
      ))}
    </span>
  );
}

/** The score, the count and the 5-to-1 bars.

    Every figure comes from the server's own count over the whole business.
    The bars used to be built from whichever reviews the screen happened to be
    holding, which made them a picture of the newest page rather than of the
    salon — and made the bars disagree with the average printed beside them. */
export function ReviewSummary({ summary }: { summary?: Summary }) {
  const t = useT();
  const rating = summary?.average ?? 0;
  const total = summary?.count ?? 0;
  return (
    <Card>
      <div className="pro-score">
        <div className="pro-score-main">
          <span className="display" aria-label={t('rating.ratedOutOf', { value: formatRating(rating) })}>
            {formatRating(rating)}
          </span>
          <StarRow value={rating} />
          <span className="caption">{t('biz.reviews', { count: formatNumber(total) })}</span>
        </div>
        <ul className="pro-dist" aria-label={t('booking.ratingBreakdown')}>
          {STARS.map((star) => {
            const count = summary?.distribution[String(star) as '1'] ?? 0;
            const width = total ? (count / total) * 100 : 0;
            return (
              <li
                key={star}
                className="pro-dist-row"
                aria-label={t('booking.starRow', {
                  stars: t('rating.stars', { count: formatNumber(star) }),
                  count: formatNumber(count),
                })}
              >
                <span>{formatNumber(star)}</span>
                <span className="pro-dist-track" aria-hidden="true">
                  <span className="pro-dist-fill" style={{ width: `${width}%` }} />
                </span>
                <span className="pro-dist-count">{formatNumber(count)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
