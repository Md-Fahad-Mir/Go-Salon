import { MessageSquare, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../constants';
import { Button, LinkButton } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { Rating } from '../../components/common/Rating';
import { ListSkeleton } from '../../components/common/Skeleton';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useT } from '../../hooks/useLanguage';
import { useMyReviews } from '../../hooks/useReviews';
import { getProfessional } from '../../store/useDirectoryStore';
import { formatNumber, formatRelative } from '../../utils/format';

/** The reviews this customer has written.

    Read from `/api/reviews/`, which scopes itself to the account on the
    token — so this is the same list the salon sees of them, not a copy kept
    on the phone that a new device would not have. */
export default function MyReviewsPage() {
  const t = useT();
  const { reviews, count, loading, failed, reload } = useMyReviews();

  return (
    <Screen nav>
      <Header title={t('profile.reviewsTitle')} back backTo={ROUTES.profile} />
      <ScreenBody className="pf-screen">
        {failed ? (
          <EmptyState
            className="pf-empty"
            icon={<MessageSquare size={26} aria-hidden="true" />}
            title={t('booking.reviewsFailed')}
            description={failed}
            action={
              <Button variant="outline" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={reload}>
                {t('action.retry')}
              </Button>
            }
          />
        ) : loading ? (
          <ListSkeleton rows={3} />
        ) : reviews.length === 0 ? (
          <EmptyState
            className="pf-empty"
            icon={<MessageSquare size={26} aria-hidden="true" />}
            title={t('profile.noReviewsTitle')}
            description={t('profile.noReviewsBody')}
            action={<LinkButton to={ROUTES.bookings}>{t('profile.myBookings')}</LinkButton>}
          />
        ) : (
          <>
            <p className="caption pf-count">{t('profile.reviewsNewest', { count: formatNumber(count) })}</p>
            <ul className="stack-sm stagger pf-reviews" aria-label={t('profile.reviewsListLabel')}>
              {reviews.map((review) => {
                const name = review.professionalName
                  ?? getProfessional(review.professionalId)?.name
                  ?? t('biz.salon');
                const meta = [
                  review.serviceName,
                  review.staffName ? t('bookings.withStaff', { name: review.staffName }) : null,
                  formatRelative(review.createdAt),
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={review.id} className="review">
                    <div className="review-head between">
                      <Link to={ROUTES.professional(review.professionalId)} className="review-name truncate">
                        {name}
                      </Link>
                      <Rating value={review.rating} />
                    </div>
                    <p className="review-meta">{meta}</p>
                    {review.text ? <p className="review-text">{review.text}</p> : null}
                    {/* The salon's answer, where they have written one. It is
                        theirs and public, so it is shown as it is stored. */}
                    {review.reply ? (
                      <div className="pf-review-reply">
                        <span className="caption">{review.repliedByName || name}</span>
                        <p className="review-text">{review.reply}</p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </ScreenBody>
    </Screen>
  );
}
