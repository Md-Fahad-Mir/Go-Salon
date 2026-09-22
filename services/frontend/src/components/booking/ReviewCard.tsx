import type { Review } from '../../types';
import { formatRelative } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { Rating } from '../common/Rating';

export function ReviewCard({ review }: { review: Review }) {
  const meta = [review.serviceName, formatRelative(review.createdAt)].filter(Boolean).join(' · ');
  return (
    <article className="review">
      <div className="review-head">
        <Avatar name={review.userName} size="sm" />
        <div className="grow">
          <div className="between">
            <span className="review-name truncate">{review.userName}</span>
            <Rating value={review.rating} size={12} />
          </div>
          <span className="review-meta">{meta}</span>
        </div>
      </div>
      <p className="review-text">{review.text}</p>
    </article>
  );
}
