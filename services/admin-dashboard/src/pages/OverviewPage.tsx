import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import type { KpiDatum, TimeRange } from '../types';
import { ROUTES } from '../constants';
import {
  RANGE_CAPTIONS,
  RANGE_LABELS,
  generationSeries,
  kpisByRange,
  revenueByMethod,
  topHairstylesByRange,
} from '../mockData/overview';
import { overviewService } from '../utils/adminService';
import { ApiError } from '../utils/apiError';
import { GenerationsChart } from '../components/charts/GenerationsChart';
import { RankedList } from '../components/charts/RankedList';
import { ShareBar } from '../components/charts/ShareBar';
import { KpiCard, KpiSkeletonCard } from '../components/ui/KpiCard';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { formatBdtCompact } from '../utils/format';

const RANGES: TimeRange[] = ['30d', '7d', 'today'];

interface LiveKpis {
  activeUsers: KpiDatum;
  newSalons: KpiDatum;
}

export default function OverviewPage() {
  const [range, setRange] = useState<TimeRange>('30d');
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [liveKpis, setLiveKpis] = useState<LiveKpis | null>(null);

  const fetchStats = (selectedRange: TimeRange) => {
    overviewService
      .stats(selectedRange)
      .then((stats) => {
        setLiveKpis(stats);
        setLoading(false);
      })
      .catch((error) => {
        setStatsError(error instanceof ApiError ? error.message : 'Could not reach the server.');
        setLoading(false);
      });
  };

  useEffect(() => {
    // Runs once on mount, for the default range `useState('30d')` already set.
    fetchStats(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeRange = (next: TimeRange) => {
    if (next === range) return;
    setRange(next);
    setLoading(true);
    setStatsError(null);
    fetchStats(next);
  };

  const retryStats = () => {
    setLoading(true);
    setStatsError(null);
    fetchStats(range);
  };

  const slices = revenueByMethod[range];
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);

  // Active users and New salons Created are real, platform-wide counts once
  // `liveKpis` lands; AI Image Generations, AI spend vs revenue, the
  // generations-per-day series and Top hairstyles stay illustrative — no AI
  // try-on call is logged anywhere in this system yet (that wiring lives in
  // the AI service and customer app, both out of scope here), so there is
  // nothing real to show for them.
  const kpis: KpiDatum[] = kpisByRange[range].map((datum) => {
    if (datum.id === 'active-users' && liveKpis) return liveKpis.activeUsers;
    if (datum.id === 'new-salons' && liveKpis) return liveKpis.newSalons;
    return datum;
  });

  return (
    <>
      <PageHeader
        title="Overview"
        actions={
          <div className="segmented" role="group" aria-label="Time period">
            {RANGES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={range === item}
                onClick={() => changeRange(item)}
              >
                {RANGE_LABELS[item]}
              </button>
            ))}
          </div>
        }
      />

      {statsError ? (
        <div
          className="card"
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <span className="dim">
            Live counts for Active users and New salons Created are unavailable right now — showing the
            last known figures.
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retryStats}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : null}

      <div className="kpi-grid">
        {loading
          ? Array.from({ length: kpis.length }, (_, index) => <KpiSkeletonCard key={index} />)
          : kpis.map((datum) => <KpiCard key={datum.id} datum={datum} />)}
      </div>

      <div className="analytics-grid">
        <section className="card" aria-labelledby="generations-heading">
          <div className="card-head">
            <h2 id="generations-heading">Generations per day</h2>
            <span className="card-sub">{RANGE_CAPTIONS[range]}</span>
          </div>
          <div className="card-body">
            {loading ? (
              <Skeleton height="var(--chart-height)" radius="0.5rem" />
            ) : (
              <>
                <GenerationsChart data={generationSeries[range]} range={range} />
                <p className="hint">
                  Gold bars mark the {range === 'today' ? 'evening rush (17:00–20:00)' : 'Friday–Saturday weekend'},
                  when salon traffic peaks.
                </p>
              </>
            )}
          </div>
        </section>

        <div className="side-stack">
          <section className="card" aria-labelledby="revenue-heading">
            <div className="card-head">
              <h2 id="revenue-heading">Revenue by method</h2>
              <span className="card-sub">{formatBdtCompact(total)} total</span>
            </div>
            <div className="card-body">
              {loading ? <Skeleton height="11rem" radius="0.5rem" /> : <ShareBar slices={slices} />}
            </div>
            <div className="card-foot">
              <span className="card-sub">Settled through the payment gateway</span>
              <Link className="btn btn-ghost btn-sm" to={ROUTES.payments}>
                All transactions <ArrowUpRight size={14} />
              </Link>
            </div>
          </section>

          <section className="card" aria-labelledby="tops-heading">
            <div className="card-head">
              <h2 id="tops-heading">Top hairstyles</h2>
            </div>
            <div className="card-body">
              {loading ? (
                <Skeleton height="12rem" radius="0.5rem" />
              ) : (
                <RankedList items={topHairstylesByRange[range]} />
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
