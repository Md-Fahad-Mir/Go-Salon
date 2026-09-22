import { MessageSquare, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ReviewCard } from '../components/booking/ReviewCard';
import { ReviewSummary } from '../components/booking/ReviewSummary';
import { ProfessionalNotFound } from '../components/booking/WizardShell';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { ListSkeleton } from '../components/common/Skeleton';
import { Segmented } from '../components/common/Tabs';
import { Header } from '../components/layout/Header';
import { Screen, ScreenBody } from '../components/layout/Screen';
import { useT } from '../hooks/useLanguage';
import { useListingReviews } from '../hooks/useReviews';
import { getProfessional } from '../store/useDirectoryStore';
import type { ReviewSort } from '../utils/reviewService';

export default function ProfessionalReviewsPage() {
  const { id = '' } = useParams();
  const t = useT();
  const [sort, setSort] = useState<ReviewSort>('newest');
  /* Sorted by the server, not here: with more than one page of reviews, a
     sort applied to the page on screen is a sort of twenty rows claiming to
     be a sort of two hundred. */
  const { reviews, summary, loading, failed, reload } = useListingReviews(id, sort);

  const sorts: Array<{ id: ReviewSort; label: string }> = [
    { id: 'newest', label: t('booking.sortNewest') },
    { id: 'highest', label: t('booking.sortHighest') },
    { id: 'lowest', label: t('booking.sortLowest') },
  ];

  const pro = getProfessional(id);
  if (!pro) return <ProfessionalNotFound nav />;

  return (
    <Screen nav className="pro-reviews">
      <Header back title={t('booking.reviews')} />
      <ScreenBody>
        <div className="pro-reviews-head">
          <h2>{pro.name}</h2>
          <p className="caption">{t('booking.reviewsIntro')}</p>
        </div>

        {failed ? (
          <EmptyState
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
          <ListSkeleton rows={4} />
        ) : (
          <>
            {/* The score and the bars come from the summary the server
                counted over every review, never from the page on screen. */}
            <ReviewSummary summary={summary} />
            {reviews.length ? (
              <>
                <Segmented tabs={sorts} active={sort} onChange={setSort} label={t('booking.sortReviews')} />
                <div className="stack-sm pro-review-list" aria-live="polite">
                  {reviews.map((review) => <ReviewCard key={review.id} review={review} />)}
                </div>
              </>
            ) : (
              <EmptyState
                icon={<MessageSquare size={26} aria-hidden="true" />}
                title={t('booking.noReviews')}
                description={t('booking.noReviewsBody')}
              />
            )}
          </>
        )}
      </ScreenBody>
    </Screen>
  );
}
