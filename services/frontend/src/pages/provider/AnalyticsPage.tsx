/* How business is going, for the owner.

   Every figure on this screen comes from GET /api/bookings/analytics/. Nothing
   is added up here, on purpose: the diary list this page used to sum is capped
   and ordered by the furthest future appointment, so a busy salon's completed
   history fell off the end and every total read low with nothing to say so.

   Three things the payload lets the screen stop implying:

     - Revenue is the services at the salon's own prices. The platform fee is
       charged on top and is not the salon's money, so it gets its own quiet
       line under the figures rather than being folded into the hero number.
     - Commission is worked out at each chair's rate TODAY. Nothing records
       what the split was on the day, so every commission line here says
       "current" instead of pretending to be history.
     - A tip is the stylist's in full. It is reported under the figures and
       never folded into revenue, so no commission is ever taken on it.
     - An appointment completed without anybody saying how it was paid comes
       back as `unrecorded`. That is not cash and is never drawn as cash.

   Revenue with no chair against it is a caption under the ranking, never a row
   in it: it is not a person, and the first row of a RankList is styled as the
   leader. */

import { parseISO } from 'date-fns';
import { AlertTriangle, BarChart3, MessageSquare, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TAKINGS_METHODS } from '../../constants';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { ListSkeleton } from '../../components/common/Skeleton';
import { Segmented } from '../../components/common/Tabs';
import { Spinner } from '../../components/common/Spinner';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { ReviewThread } from '../../components/provider/business/ReviewThread';
import { RankList, type RankRow } from '../../components/provider/salon/RankList';
import { TAKINGS_KEYS } from '../../components/provider/salon/salonLabels';
import { useT } from '../../hooks/useLanguage';
import { useMyReviews } from '../../hooks/useReviews';
import { useProviderStore } from '../../store/useProviderStore';
import { messageOf } from '../../utils/errorMessage';
import { formatBdt, formatNumber, formatPattern, formatRating } from '../../utils/format';
import {
  reportService,
  type AnalyticsReport,
  type ReportPaymentMethod,
  type ReportPeriod,
} from '../../utils/reportService';

/** The brand hue for a method the till actually recorded. `unrecorded` has
    none — it is the absence of a method, and is drawn as an outline. */
const colorOf = (method: ReportPaymentMethod): string | undefined =>
  TAKINGS_METHODS.find((entry) => entry.id === method)?.colorVar;

/** One answer from the endpoint, tagged with the query it was for.

    Holding the tag rather than a separate `loading` flag is how the rest of
    this app waits on a call: "no answer for THIS question yet" is what draws
    the spinner, and it is the same fact that makes last period's figures
    impossible to show under this period's heading. */
interface Result {
  key: string;
  report?: AnalyticsReport;
  /** Set instead of `report` when the call failed, so a broken fetch reads as
      broken. Rendering it as ৳0 is the exact failure this screen exists to
      stop. */
  failed?: string;
}

export default function AnalyticsPage() {
  const t = useT();
  /* Reviews are read from `/api/reviews/`, which scopes itself to the account
     asking — for an owner that is their salon and nothing else. Separate from
     the report because a score is all-time and the report is a period. */
  const {
    reviews,
    summary: reviewSummary,
    count: reviewCount,
    loading: reviewsLoading,
    failed: reviewsFailed,
    reload: reloadReviews,
  } = useMyReviews();
  const businessName = useProviderStore((state) => state.profile?.businessName ?? '');
  const [period, setPeriod] = useState<ReportPeriod>('week');
  /* Bumped by "try again" — the only way to ask the same question twice. */
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const requestKey = `${period}|${attempt}`;

  useEffect(() => {
    /* An answer that arrives after the screen has gone must not set state. */
    let live = true;
    reportService
      .analytics(period)
      .then((data) => {
        if (live) setResult({ key: requestKey, report: data });
      })
      .catch((failure: unknown) => {
        if (live) setResult({ key: requestKey, failed: messageOf(failure) });
      });
    return () => {
      live = false;
    };
  }, [period, requestKey]);

  /* Anything tagged with an older question is last period's answer, or the one
     the retry replaced: the screen waits rather than showing it. */
  const answer = result && result.key === requestKey ? result : null;
  const report = answer?.report ?? null;

  const series = report?.series ?? [];
  const peak = series.reduce((highest, day) => Math.max(highest, day.revenue), 0);
  /* A month can be thirty columns wide on a 390px screen, so only every nth
     one gets a written date. */
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));

  const staffRows: RankRow[] = (report?.byStaff ?? []).map((row) => ({
    id: row.employeeId,
    name: row.name,
    value: row.revenue,
    sub: [
      t('salon.bookingsCount', { count: formatNumber(row.bookings) }),
      t('salon.commissionAtRate', {
        value: formatBdt(row.commission),
        rate: formatNumber(row.commissionRate),
      }),
    ],
  }));

  const serviceRows: RankRow[] = (report?.byService ?? []).map((row) => ({
    id: row.name,
    name: row.name,
    value: row.revenue,
    sub: [t('salon.bookingsCount', { count: formatNumber(row.bookings) })],
  }));

  const unassigned = report?.unassigned;
  const unassignedNote =
    unassigned && unassigned.bookings
      ? t('salon.unassignedNote', {
          count: formatNumber(unassigned.bookings),
          value: formatBdt(unassigned.revenue),
        })
      : null;

  /* The split is measured against the headline rather than against itself:
     both are `Sum(subtotal)` over the same appointments, so the shares add up
     to a hundred without this screen adding anything up. */
  const gross = report?.headline.revenue ?? 0;
  const shareOf = (revenue: number): number => (gross ? Math.round((revenue / gross) * 100) : 0);
  const methodName = (method: ReportPaymentMethod): string =>
    method === 'unrecorded' ? t('salon.takingsUnrecorded') : t(TAKINGS_KEYS[method]);
  const anyUnrecorded = (report?.byPayment ?? []).some((entry) => entry.method === 'unrecorded');

  return (
    <Screen nav>
      <Header title={t('salon.analyticsTitle')} />
      <ScreenBody className="an-body stagger">
        {/* Stays put through loading, failure and a quiet week, so the period
            can always be changed without backing out of the screen. */}
        <Segmented
          label={t('salon.analyticsTitle')}
          active={period}
          onChange={setPeriod}
          tabs={[
            { id: 'week', label: t('salon.periodWeek') },
            { id: 'month', label: t('salon.periodMonth') },
          ]}
        />

        {answer === null ? (
          <div className="bk-loading" aria-busy="true">
            <Spinner size="lg" label={t('state.loading')} />
          </div>
        ) : answer.failed ? (
          <EmptyState
            icon={<AlertTriangle size={26} aria-hidden="true" />}
            tone="danger"
            title={t('state.loadFailedTitle')}
            description={answer.failed}
            action={<Button onClick={() => setAttempt((count) => count + 1)}>{t('state.retry')}</Button>}
          />
        ) : report && report.headline.bookings ? (
          <>
            <div className="ps-headline">
              <div className="pro-stats ps-stats-2" aria-live="polite">
                <div className="pro-stat pro-stat-accent">
                  <strong>{formatBdt(report.headline.revenue)}</strong>
                  <span>{t('salon.statRevenue')}</span>
                </div>
                <div className="pro-stat">
                  <strong>{formatNumber(report.headline.bookings)}</strong>
                  <span>{t('salon.statBookings')}</span>
                </div>
                <div className="pro-stat">
                  <strong>{formatBdt(report.headline.averageTicket)}</strong>
                  <span>{t('salon.statAvgTicket')}</span>
                </div>
                <div className="pro-stat">
                  <strong>
                    {t('salon.percentValue', { value: formatNumber(report.returning.repeatShare) })}
                  </strong>
                  <span>{t('salon.statRepeat')}</span>
                </div>
              </div>
              {/* The two sums that went through the till and are not the
                  salon's. Saying them out loud is what makes the revenue
                  figure above a number an owner can check against their own
                  takings: without them it looks like money has gone missing. */}
              <p className="ps-note">
                {t('salon.platformFeesNote', { value: formatBdt(report.headline.platformFees) })}
              </p>
              {report.headline.tips ? (
                <p className="ps-note">
                  {t('salon.tipsNote', { value: formatBdt(report.headline.tips) })}
                </p>
              ) : null}
            </div>

            <section className="section" aria-labelledby="an-chart">
              <div className="ps-edit-head">
                <h3 className="label" id="an-chart">{t('salon.revenueByDay')}</h3>
                <span className="ps-legend">{t('salon.bestDay')}</span>
              </div>
              <div className="pro-chart an-chart-plot">
                {series.map((day, index) => (
                  <div
                    key={day.date}
                    className="pro-chart-col"
                    data-peak={peak > 0 && day.revenue === peak ? 'true' : undefined}
                    role="img"
                    aria-label={t('salon.chartColumn', {
                      day: formatPattern(parseISO(day.date), 'd MMM'),
                      amount: formatBdt(day.revenue),
                    })}
                  >
                    <span
                      className="pro-chart-bar"
                      style={{ height: `${peak ? (day.revenue / peak) * 100 : 0}%` }}
                      aria-hidden="true"
                    />
                    <small>{index % labelEvery === 0 ? formatPattern(parseISO(day.date), 'd') : ' '}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="section" aria-labelledby="an-staff">
              <h3 className="label" id="an-staff">{t('salon.topStaff')}</h3>
              {staffRows.length ? (
                <>
                  <div className="card card-pad">
                    <RankList rows={staffRows} label={t('salon.topStaff')} />
                  </div>
                  <p className="ps-note">{t('salon.commissionRateNote')}</p>
                </>
              ) : (
                <p className="muted">{t('salon.noStaffDataBody')}</p>
              )}
              {/* Not a row in the ranking: work with no chair against it is
                  not a person, and the top row of that list is the leader. */}
              {unassignedNote ? <p className="ps-note">{unassignedNote}</p> : null}
            </section>

            <section className="section" aria-labelledby="an-services">
              <h3 className="label" id="an-services">{t('salon.topServices')}</h3>
              {serviceRows.length ? (
                <div className="card card-pad">
                  <RankList rows={serviceRows} label={t('salon.topServices')} />
                </div>
              ) : (
                <p className="muted">{t('salon.noServiceDataBody')}</p>
              )}
            </section>

            <section className="section" aria-labelledby="an-takings">
              <h3 className="label" id="an-takings">{t('salon.takingsSplit')}</h3>
              {report.byPayment.length ? (
                <>
                  <div className="card card-pad">
                    <div className="ps-split">
                      {report.byPayment.map((entry) => {
                        const tone = colorOf(entry.method);
                        return (
                          <div key={entry.method} className="ps-split-row">
                            <span
                              className="ps-split-dot"
                              data-unrecorded={entry.method === 'unrecorded' ? 'true' : undefined}
                              style={tone ? { backgroundColor: `var(${tone})` } : undefined}
                              aria-hidden="true"
                            />
                            <span className="ps-split-name">{methodName(entry.method)}</span>
                            <span className="ps-split-value">
                              {formatBdt(entry.revenue)}
                              <small className="ps-split-share">
                                {t('salon.shareOfTotal', { value: formatNumber(shareOf(entry.revenue)) })}
                              </small>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {anyUnrecorded ? <p className="ps-note">{t('salon.takingsUnrecordedNote')}</p> : null}
                </>
              ) : (
                <p className="muted">{t('salon.noTakingsBody')}</p>
              )}
            </section>
          </>
        ) : (
          <EmptyState
            icon={<BarChart3 size={26} aria-hidden="true" />}
            title={t('salon.noDataTitle')}
            description={t('salon.noDataBody')}
          />
        )}

        {/* Satisfaction is all-time, not this period: three reviews in a week
            is not a score, and a number that swings on one bad Friday is worse
            than no number. The heading says so rather than leaving the reader
            to assume it follows the pills above. */}
        <section className="section" aria-labelledby="an-reviews">
          <h3 className="label" id="an-reviews">{t('salon.satisfaction')}</h3>
          {reviewsFailed ? (
            <EmptyState
              icon={<MessageSquare size={26} aria-hidden="true" />}
              title={t('salon.reviewsFailedTitle')}
              description={reviewsFailed}
              action={
                <Button
                  variant="outline"
                  icon={<RefreshCw size={16} aria-hidden="true" />}
                  onClick={reloadReviews}
                >
                  {t('action.retry')}
                </Button>
              }
            />
          ) : reviewsLoading ? (
            <ListSkeleton rows={2} />
          ) : reviewCount === 0 ? (
            <EmptyState
              icon={<MessageSquare size={26} aria-hidden="true" />}
              title={t('salon.noReviewsTitle')}
              description={t('salon.noReviewsBody')}
            />
          ) : (
            <>
              <div className="pro-stats" aria-live="polite">
                <div className="pro-stat pro-stat-accent">
                  <strong>{formatRating(reviewSummary?.average ?? 0)}</strong>
                  <span>{t('salon.statRating')}</span>
                </div>
                <div className="pro-stat">
                  <strong>{formatNumber(reviewCount)}</strong>
                  <span>{t('salon.statReviews')}</span>
                </div>
              </div>
              <p className="ps-note">{t('salon.reviewsAllTime', { count: formatNumber(reviewCount) })}</p>
              <div className="stack-sm">
                {reviews.slice(0, 5).map((review) => (
                  <ReviewThread
                    key={review.id}
                    review={review}
                    businessName={businessName}
                    onReply={undefined}
                  />
                ))}
              </div>
              {/* Answering one is the shopfront's job, and that is where the
                  reply box lives — this screen reads, it does not write. */}
              <p className="caption dim">{t('salon.reviewsReplyElsewhere')}</p>
            </>
          )}
        </section>
      </ScreenBody>
    </Screen>
  );
}
