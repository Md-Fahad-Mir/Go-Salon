import { CalendarPlus, CheckCircle2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Booking } from '../types';
import { ROUTES } from '../constants';
import { Button, LinkButton } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Spinner } from '../components/common/Spinner';
import { Tabs } from '../components/common/Tabs';
import { Header } from '../components/layout/Header';
import { Screen, ScreenBody } from '../components/layout/Screen';
import { BookingCard } from '../components/profile/BookingCard';
import { CancelDialog } from '../components/profile/CancelDialog';
import { ReceiptSheet } from '../components/profile/ReceiptSheet';
import { ReviewSheet } from '../components/profile/ReviewSheet';
import { bookingStart, tabFor, type BookingTab } from '../components/profile/bookingHelpers';
import { useBookingActions } from '../components/profile/useBookingActions';
import { useBookings } from '../hooks/useBookings';
import { useT } from '../hooks/useLanguage';
import type { TKey } from '../i18n';

const TAB_IDS: BookingTab[] = ['upcoming', 'completed', 'cancelled'];

const LIST_LABEL_KEYS: Record<BookingTab, TKey> = {
  upcoming: 'bookings.listUpcoming',
  completed: 'bookings.listCompleted',
  cancelled: 'bookings.listCancelled',
};

const parseTab = (raw: string | null): BookingTab =>
  TAB_IDS.includes(raw as BookingTab) ? (raw as BookingTab) : 'upcoming';

const byStart = (direction: 1 | -1) => (a: Booking, b: Booking) =>
  (bookingStart(a).getTime() - bookingStart(b).getTime()) * direction;

export default function BookingsPage() {
  const { bookings, loading, failed, reload } = useBookings();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const { rebook, reschedule } = useBookingActions();
  const t = useT();

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<BookingTab, Booking[]> = { upcoming: [], completed: [], cancelled: [] };
    bookings.forEach((booking) => groups[tabFor(booking)].push(booking));
    groups.upcoming.sort(byStart(1));
    groups.completed.sort(byStart(-1));
    groups.cancelled.sort(byStart(-1));
    return groups;
  }, [bookings]);

  const setTab = (next: BookingTab) => setParams(next === 'upcoming' ? {} : { tab: next }, { replace: true });

  const list = grouped[tab];
  const cancelTarget = cancelId ? bookings.find((b) => b.id === cancelId) : undefined;
  const reviewTarget = reviewId ? bookings.find((b) => b.id === reviewId) : undefined;
  const receiptTarget = receiptId ? bookings.find((b) => b.id === receiptId) : undefined;

  return (
    <Screen nav className="bkl-screen">
      <Header title={t('bookings.title')} />
      <ScreenBody>
        <div className="bleed">
          <Tabs
            label={t('bookings.tabsLabel')}
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'upcoming', label: t('bookings.tabUpcoming'), count: grouped.upcoming.length },
              { id: 'completed', label: t('bookings.tabCompleted') },
              { id: 'cancelled', label: t('bookings.tabCancelled') },
            ]}
          />
        </div>

        {loading ? (
          <div className="fullscreen-center" aria-busy="true">
            <Spinner size="lg" label={t('state.loading')} />
          </div>
        ) : failed ? (
          <EmptyState
            icon={<XCircle size={26} aria-hidden="true" />}
            title={t('state.loadFailedTitle')}
            description={failed}
            action={<Button onClick={reload}>{t('state.retry')}</Button>}
          />
        ) : list.length === 0 ? (
          tab === 'upcoming' ? (
            <EmptyState
              icon={<CalendarPlus size={26} aria-hidden="true" />}
              tone="accent"
              title={t('bookings.emptyUpcomingTitle')}
              description={t('bookings.emptyUpcomingBody')}
              action={<LinkButton to={ROUTES.search}>{t('bookings.findSalon')}</LinkButton>}
            />
          ) : tab === 'completed' ? (
            <EmptyState
              icon={<CheckCircle2 size={26} aria-hidden="true" />}
              title={t('bookings.emptyCompletedTitle')}
              description={t('bookings.emptyCompletedBody')}
              action={grouped.upcoming.length === 0 ? <LinkButton to={ROUTES.search} variant="secondary">{t('bookings.findSalon')}</LinkButton> : undefined}
            />
          ) : (
            <EmptyState
              icon={<XCircle size={26} aria-hidden="true" />}
              title={t('bookings.emptyCancelledTitle')}
              description={t('bookings.emptyCancelledBody')}
            />
          )
        ) : (
          <ul className="stack stagger" aria-label={t(LIST_LABEL_KEYS[tab])}>
            {list.map((booking) => (
              <li key={booking.id}>
                <BookingCard
                  booking={booking}
                  onCancel={(b) => setCancelId(b.id)}
                  onReschedule={reschedule}
                  onRebook={rebook}
                  onReview={(b) => setReviewId(b.id)}
                  onReceipt={(b) => setReceiptId(b.id)}
                />
              </li>
            ))}
          </ul>
        )}

        {tab === 'cancelled' && list.length > 0 ? (
          <p className="caption center">
            {t('bookings.changedMind')}{' '}
            <Button variant="ghost" size="xs" onClick={() => setTab('upcoming')}>{t('bookings.seeUpcoming')}</Button>
          </p>
        ) : null}
      </ScreenBody>

      {cancelTarget ? (
        <CancelDialog
          key={cancelTarget.id}
          booking={cancelTarget}
          open
          onClose={() => setCancelId(null)}
          onCancelled={reload}
        />
      ) : null}
      {reviewTarget ? (
        <ReviewSheet key={reviewTarget.id} booking={reviewTarget} open onClose={() => setReviewId(null)} />
      ) : null}
      {receiptTarget ? (
        <ReceiptSheet key={receiptTarget.id} booking={receiptTarget} open onClose={() => setReceiptId(null)} />
      ) : null}
    </Screen>
  );
}
