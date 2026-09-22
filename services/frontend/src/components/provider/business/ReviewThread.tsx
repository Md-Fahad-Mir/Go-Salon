import { CornerDownRight, MessageSquare } from 'lucide-react';
import { useT } from '../../../hooks/useLanguage';
import type { Review } from '../../../types';
import { formatRelative } from '../../../utils/format';
import { Avatar } from '../../common/Avatar';
import { Button } from '../../common/Button';
import { Rating } from '../../common/Rating';

interface ReviewThreadProps {
  review: Review;
  /** Whose name the reply is signed with when the row does not say — a reply
      written in this session, before the saved row has come back. */
  businessName: string;
  /** Left out where this account may read the review but not answer it. */
  onReply?: () => void;
}

/** The customer app's review card with the one thing a provider needs that a
    customer does not: somewhere to answer back.

    The reply is read off the review, because it is stored on it and the
    customer reads it too. It used to be screen state, which meant it was gone
    on the next navigation and signed with whatever name the *reader's* own
    profile happened to carry. */
export function ReviewThread({ review, businessName, onReply }: ReviewThreadProps) {
  const t = useT();
  const reply = review.reply;
  /* The chair as well as the service: an owner reading a two-star review
     cannot act on it without knowing whose chair it was, and this is the only
     provider screen that shows a review at all. */
  const meta = [review.serviceName, review.staffName, formatRelative(review.createdAt)]
    .filter(Boolean)
    .join(' · ');

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

      {reply ? (
        <div className="pb-reply">
          <span className="pb-reply-head">
            <CornerDownRight size={14} aria-hidden="true" />
            {review.repliedByName || businessName}
          </span>
          <p className="pb-reply-text">{reply}</p>
        </div>
      ) : null}

      {onReply ? (
        <div className="row-sm">
          <Button
            variant="ghost"
            size="xs"
            icon={<MessageSquare size={14} aria-hidden="true" />}
            onClick={onReply}
          >
            {reply ? t('pb.replyEdit') : t('pb.reply')}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
