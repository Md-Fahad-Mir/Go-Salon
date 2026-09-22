import { parseISO } from 'date-fns';
import { Armchair, BarChart3, RefreshCw, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { ListSkeleton, Skeleton } from '../../components/common/Skeleton';
import { Segmented } from '../../components/common/Tabs';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { ReviewCard } from '../../components/booking/ReviewCard';
import { Rating } from '../../components/common/Rating';
import { useT } from '../../hooks/useLanguage';
import { useMyReviews } from '../../hooks/useReviews';
import { ApiValidationError } from '../../utils/apiClient';
import { messageOf } from '../../utils/errorMessage';
import { formatBdt, formatNumber, formatPattern } from '../../utils/format';
import { reportService, type PerformanceReport, type ReportPeriod } from '../../utils/reportService';

/* How the employee is doing — answered by the server, not by this page.

   Every figure here comes from GET /api/bookings/performance/, which starts
   from the same scoping the diary does, so the screen can neither widen nor
   narrow what this account is allowed to be told. Nothing is summed in the
   browser any more, and that changes three things:

     - Revenue is the SERVICES at the salon's prices. The booking fee the app
       charges on top used to be counted in, which made her work look bigger
       than it was and then took commission on the platform's cut. The fee is
       now reported beside the figure instead of inside it.
     - A tip is hers in full and carries no commission. It sits below the share
       in the ledger, never in the basis the share is taken from.
     - Nothing in the database records what the commission split was on the day
       the work was done. The rate that comes back is the rate on the employment
       TODAY, so the screen says exactly that instead of dressing an estimate up
       as history. And where there is no rate on the record there is no figure:
       this page used to invent one (a constant 45%), which is a number somebody
       could be paid against.

   A 403 is a fact, not a failure. The endpoint refuses anybody whose viewpoint
   is not `employee`, and on this route — which only a salon employee can open —
   that can mean one thing: no active chair. Somebody with no chair has no work
   to report on, which is a different statement from having worked and earned
   zero, and the screen must not let the two look alike. */

type Status = 'loading' | 'ready' | 'error' | 'no-chair';

/** The three things one call can come back as. A refusal is one of them, not a
    missing success, because "no chair" is a fact about this account rather than
    a failure to fetch. */
type Answer =
  | { kind: 'ready'; report: PerformanceReport }
  | { kind: 'no-chair' }
  | { kind: 'error'; message: string };

export default function PerformancePage() {
  const t = useT();
  /* `/api/reviews/` narrowed to this chair by the server. It used to be the
     whole salon's reviews filtered on `staffName === userName` — same intent,
     but two stylists with one name shared a history and correcting the spelling
     of your own name lost you every review you had. */
  const {
    reviews,
    summary: reviewSummary,
    count: reviewCount,
    loading: reviewsLoading,
    failed: reviewsFailed,
    reload: reloadReviews,
  } = useMyReviews();
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ request: string; value: Answer } | null>(null);

  /* Which question is on screen. Loading is not stored — it is simply not yet
     having the answer to THIS question, which is what keeps last period's
     numbers from sitting under the new pill while the new ones are in flight.
     Stale figures beneath a heading that says "this month" are worse than a
     moment of nothing, and a late reply to the previous question cannot land on
     the current one because its request tag no longer matches. */
  const request = `${period}:${attempt}`;
  const current = answer?.request === request ? answer.value : null;
  const status: Status = current?.kind ?? 'loading';
  const report = current?.kind === 'ready' ? current.report : null;
  const error = current?.kind === 'error' ? current.message : null;

  useEffect(() => {
    let live = true;
    const settle = (value: Answer) => {
      if (live) setAnswer({ request, value });
    };

    reportService
      .performance(period)
      .then((data) => settle({ kind: 'ready', report: data }))
      .catch((failure: unknown) => {
        if (failure instanceof ApiValidationError && failure.status === 403) {
          settle({ kind: 'no-chair' });
          return;
        }
        settle({ kind: 'error', message: messageOf(failure) });
      });

    return () => {
      live = false;
    };
  }, [period, request]);

  /* Which column the chart calls out. The server sends one entry per day with
     the zeros included, so the x-axis is the same shape every time it is read
     rather than being rebuilt out of whichever days had work in them. */
  const chart = useMemo(() => {
    const series = report?.series ?? [];
    const busiest = series.reduce((max, day) => Math.max(max, day.bookings), 0);
    return {
      series,
      busiest,
      peak: busiest > 0 ? series.findIndex((day) => day.bookings === busiest) : -1,
    };
  }, [report]);

  const serviceMax = useMemo(
    () => (report?.byService ?? []).reduce((max, row) => Math.max(max, row.revenue), 0),
    [report],
  );

  const rate = report?.commissionRate ?? null;
  const share = report?.commission ?? null;
  const rateLabel = rate === null ? '' : `${formatNumber(rate)}%`;
  const tips = report?.headline.tips ?? 0;
  const fees = report?.headline.platformFees ?? 0;
  const worked = (report?.headline.bookings ?? 0) > 0;

  return (
    <Screen nav>
      <Header title={t('pt.performanceTitle')} />
      <ScreenBody>
        {/* The period control belongs to the screen, not to the answer: it stays
            put while the answer is loading, missing or refused. */}
        <Segmented<ReportPeriod>
          label={t('pt.periodLabel')}
          active={period}
          onChange={setPeriod}
          tabs={[
            { id: 'week', label: t('pt.periodWeek') },
            { id: 'month', label: t('pt.periodMonth') },
          ]}
        />

        {status === 'loading' ? (
          <>
            <span className="sr-only" role="status">
              {t('state.loading')}
            </span>
            {/* Shaped like what is coming, at its real size, so nothing moves
                under the reader when it lands. */}
            <div className="pt-skeleton" aria-hidden="true">
              <div className="pro-stats pt-stats">
                {[0, 1, 2, 3].map((cell) => (
                  <div key={cell} className="pro-stat">
                    <Skeleton width="65%" height="1.375rem" />
                    <Skeleton width="45%" height="0.75rem" />
                  </div>
                ))}
              </div>
              <Card className="pt-chart">
                <Skeleton height="8rem" radius="0.75rem" />
              </Card>
            </div>
          </>
        ) : status === 'no-chair' ? (
          /* Not ৳0. Nobody has put this account in a chair, so there is no work
             for a figure to be about. */
          <EmptyState
            className="pt-empty"
            icon={<Armchair size={26} aria-hidden="true" />}
            title={t('pt.noChairTitle')}
            description={t('pt.noChairBody')}
          />
        ) : status === 'error' || !report ? (
          <EmptyState
            className="pt-empty"
            icon={<BarChart3 size={26} aria-hidden="true" />}
            title={t('state.loadFailedTitle')}
            description={error ?? undefined}
            action={<Button onClick={() => setAttempt((value) => value + 1)}>{t('state.retry')}</Button>}
          />
        ) : (
          <>
            {/* --- Headline numbers --- */}
            <div className="pro-stats pt-stats" aria-live="polite">
              <div className="pro-stat">
                <strong>{formatNumber(report.headline.bookings)}</strong>
                <span>{t('pt.cutsDone')}</span>
              </div>
              <div className="pro-stat">
                <strong>{formatBdt(report.headline.revenue)}</strong>
                <span>{t('pt.revenue')}</span>
              </div>
              {/* Her money, and the one gold cell in the panel. With no rate on
                  her record there is no honest figure to put here — a dash and
                  the line underneath, never a guess. */}
              <div className="pro-stat pro-stat-accent" data-unset={share === null ? 'true' : undefined}>
                <strong>{share === null ? '—' : formatBdt(share)}</strong>
                <span>{t('pt.yourCommission')}</span>
              </div>
              <div className="pro-stat">
                <strong>{formatBdt(tips)}</strong>
                <span>{t('pro.tips')}</span>
              </div>
            </div>
            <p className="caption">
              {rate === null ? t('pt.rateUnset') : t('pt.rateToday', { rate: rateLabel })}
            </p>
            <p className="pt-scope">
              {report.salon ? `${t('pt.atSalon', { salon: report.salon })} · ` : null}
              {t('pt.periodRange', {
                from: formatPattern(parseISO(report.from), 'd MMM'),
                to: formatPattern(parseISO(report.to), 'd MMM'),
              })}
            </p>

            {/* --- Daily cuts --- */}
            <section className="section" aria-labelledby="pt-chart-head">
              <div className="pro-section-head">
                <h3 id="pt-chart-head">{t('pt.cutsEachDay')}</h3>
                {chart.peak >= 0 ? (
                  <span>
                    {t('pt.bestDay', {
                      day: formatPattern(parseISO(chart.series[chart.peak].date), 'd MMM'),
                    })}
                  </span>
                ) : null}
              </div>
              <Card className="pt-chart">
                {worked ? (
                  <div className="pro-chart" data-dense={period === 'month' ? 'true' : undefined}>
                    {chart.series.map((day, index) => {
                      const on = parseISO(day.date);
                      return (
                        <div
                          key={day.date}
                          className="pro-chart-col"
                          data-peak={index === chart.peak ? 'true' : undefined}
                          role="img"
                          aria-label={t('pt.dayCuts', {
                            day: formatPattern(on, 'd MMM'),
                            count: formatNumber(day.bookings),
                          })}
                        >
                          <span
                            className="pro-chart-bar"
                            style={{ height: `${(day.bookings / Math.max(1, chart.busiest)) * 100}%` }}
                            aria-hidden="true"
                          />
                          <small>
                            {period === 'week'
                              ? formatPattern(on, 'EEEEE')
                              : index === 0 || (index + 1) % 5 === 0
                                ? formatPattern(on, 'd')
                                : ''}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="pro-empty-day">{t('pt.noPeriodData')}</p>
                )}
              </Card>
            </section>

            {/* --- Commission breakdown --- */}
            <section className="section" aria-labelledby="pt-comm-head">
              <h3 className="label" id="pt-comm-head">{t('pt.commissionBreakdown')}</h3>
              <Card className="pt-ledger">
                <dl className="kv">
                  <div className="kv-row">
                    <dt>{t('pt.servicesTotal')}</dt>
                    <dd>{formatBdt(report.headline.revenue)}</dd>
                  </div>
                  {rate === null ? null : (
                    <div className="kv-row">
                      <dt>{t('pt.commissionRate')}</dt>
                      <dd>{t('pt.atRate', { rate: rateLabel })}</dd>
                    </div>
                  )}
                  {share === null ? null : (
                    <div className="kv-row">
                      <dt>{t('pt.yourShare')}</dt>
                      <dd>{formatBdt(share)}</dd>
                    </div>
                  )}
                  {/* Below the share, never inside the basis it is taken from. */}
                  <div className="kv-row">
                    <dt>{t('pro.tips')}</dt>
                    <dd>{formatBdt(tips)}</dd>
                  </div>
                  {share === null ? null : (
                    <div className="kv-row kv-total">
                      <dt>{t('pt.totalEarned')}</dt>
                      <dd>{formatBdt(share + tips)}</dd>
                    </div>
                  )}
                </dl>
              </Card>
              <p className="caption pt-note">{t('pt.tipsYours')}</p>
              {fees > 0 ? (
                <p className="caption pt-note">{t('pt.feesNote', { amount: formatBdt(fees) })}</p>
              ) : null}
              {/* An unset rate is the salon's to fix, and she cannot. Saying so
                  is the only way the dash above reads as a gap in her record
                  rather than as a bad week. */}
              {rate === null ? (
                <Callout tone="warning" title={t('pt.rateUnsetTitle')}>
                  {t('pt.rateUnsetBody')}
                </Callout>
              ) : null}
            </section>

            {/* --- Where the money came from --- */}
            <section className="section" aria-labelledby="pt-mix-head">
              <div className="pt-head">
                <h3 id="pt-mix-head">{t('pt.serviceMix')}</h3>
                <p>{t('pt.serviceMixHint')}</p>
              </div>
              <Card>
                {report.byService.length ? (
                  <ul className="pt-mix">
                    {report.byService.map((row) => (
                      <li key={row.name} className="pt-mix-row">
                        <span className="pt-mix-name">{row.name}</span>
                        <span className="pt-mix-value">{formatBdt(row.revenue)}</span>
                        <span className="pt-mix-track" aria-hidden="true">
                          <span
                            className="pt-mix-fill"
                            data-empty={row.revenue <= 0 ? 'true' : undefined}
                            style={{ width: `${(row.revenue / Math.max(1, serviceMax)) * 100}%` }}
                          />
                        </span>
                        <span className="pt-mix-count">
                          {t('pt.serviceDone', { count: formatNumber(row.bookings) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pt-mix-blank">{t('pt.noPeriodData')}</p>
                )}
              </Card>
            </section>

            {/* --- My reviews ---
                Reviews of visits this stylist did, all-time — not this
                period. The figures above move with the pills; a score built
                on three reviews would swing on one bad Friday, so the line
                under the stars says which it is. */}
            <section className="section" aria-labelledby="pt-rev-head">
              <div className="pro-section-head">
                <h3 id="pt-rev-head">{t('pt.myReviews')}</h3>
                {reviewCount > 0 && reviewSummary?.average !== null ? (
                  <Rating value={reviewSummary?.average ?? 0} count={reviewCount} />
                ) : null}
              </div>
              {reviewsFailed ? (
                <EmptyState
                  className="pt-empty"
                  icon={<Star size={26} aria-hidden="true" />}
                  title={t('pt.reviewsFailed')}
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
              ) : reviews.length === 0 ? (
                <EmptyState
                  className="pt-empty"
                  icon={<Star size={26} aria-hidden="true" />}
                  title={t('pt.noReviews')}
                  description={t('pt.noReviewsBody')}
                />
              ) : (
                <>
                  <div className="stack-sm">
                    {reviews.slice(0, 5).map((review) => (
                      <ReviewCard key={review.id} review={review} />
                    ))}
                  </div>
                  <p className="pt-mix-blank">{t('pt.reviewsAllTime')}</p>
                </>
              )}
            </section>
          </>
        )}
      </ScreenBody>
    </Screen>
  );
}
