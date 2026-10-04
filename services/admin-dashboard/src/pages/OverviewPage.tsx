import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ChartColumn,
  Coins,
  RefreshCw,
  Scissors,
  Store,
  Users,
  Wallet,
  WandSparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { KpiDatum, TimeRange } from '../types';
import { ROUTES } from '../constants';
import {
  generationSeries,
  kpisByRange,
  revenueByMethod,
  topHairstylesByRange,
} from '../mockData/overview';
import { overviewService } from '../utils/adminService';
import { ApiError } from '../utils/apiError';
import { GenerationsChart } from '../components/charts/GenerationsChart';
import { RankedList } from '../components/charts/RankedList';
import { RevenueDonut } from '../components/charts/RevenueDonut';
import { KpiCard, KpiSkeletonCard } from '../components/ui/KpiCard';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { formatShortDate } from '../utils/format';

/** The overview always covers the last 30 days. */
const RANGE: TimeRange = '30d';

const KPI_ICONS: Record<string, LucideIcon> = {
  'active-users': Users,
  generations: WandSparkles,
  spend: Coins,
  'new-salons': Store,
};

interface LiveKpis {
  activeUsers: KpiDatum;
  newSalons: KpiDatum;
}

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [liveKpis, setLiveKpis] = useState<LiveKpis | null>(null);

  const fetchStats = () => {
    overviewService
      .stats(RANGE)
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
    // Runs once on mount.
    fetchStats();
  }, []);

  const retryStats = () => {
    setLoading(true);
    setStatsError(null);
    fetchStats();
  };

  const series = generationSeries[RANGE];
  const period = `${formatShortDate(series[0].date)} – ${formatShortDate(series[series.length - 1].date)}`;

  // Active users and New salons Created are real, platform-wide counts once
  // `liveKpis` lands; AI Image Generations, AI spend vs revenue, the
  // generations-per-day series and Top hairstyles stay illustrative — no AI
  // try-on call is logged anywhere in this system yet (that wiring lives in
  // the AI service and customer app, both out of scope here), so there is
  // nothing real to show for them.
  const kpis: KpiDatum[] = kpisByRange[RANGE].map((datum) => {
    if (datum.id === 'active-users' && liveKpis) return liveKpis.activeUsers;
    if (datum.id === 'new-salons' && liveKpis) return liveKpis.newSalons;
    return datum;
  });

  return (
    <>
      <PageHeader title="Overview" />

      {statsError ? (
        <div className="alert alert-warning alert-bar" role="alert">
          <span>
            Live counts for Active users and New salons Created are unavailable right now — showing the
            last known figures.
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retryStats}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : null}

      <section className="ov-hero" aria-labelledby="ov-hero-title">
        <h2 className="ov-eyebrow" id="ov-hero-title">
          Last 30 days <span className="ov-eyebrow-range">{period}</span>
        </h2>
        <dl className="kpi-band">
          {loading
            ? Array.from({ length: kpis.length }, (_, index) => <KpiSkeletonCard key={index} />)
            : kpis.map((datum) => (
                <KpiCard key={datum.id} datum={datum} icon={KPI_ICONS[datum.id] ?? ChartColumn} />
              ))}
        </dl>
      </section>

      <div className="ov-grid">
        <section className="card ov-card ov-chart" aria-labelledby="generations-heading">
          <div className="card-head ov-card-head">
            <div className="ov-card-title">
              <span className="icon-tile" aria-hidden="true">
                <ChartColumn size={17} strokeWidth={1.8} />
              </span>
              <h2 id="generations-heading">Generations per day</h2>
            </div>
            <ul className="ov-legend" aria-label="Legend">
              <li>
                <span className="ov-swatch ov-swatch-peak" aria-hidden="true" />
                Weekend (Fri–Sat)
              </li>
              <li>
                <span className="ov-swatch" aria-hidden="true" />
                Weekdays
              </li>
            </ul>
          </div>
          <div className="card-body">
            {loading ? (
              <Skeleton height="var(--chart-height)" radius="0.75rem" />
            ) : (
              <GenerationsChart data={series} range={RANGE} />
            )}
          </div>
        </section>

        <section className="card ov-card ov-revenue" aria-labelledby="revenue-heading">
          <div className="card-head ov-card-head">
            <div className="ov-card-title">
              <span className="icon-tile" aria-hidden="true">
                <Wallet size={17} strokeWidth={1.8} />
              </span>
              <h2 id="revenue-heading">Revenue by method</h2>
            </div>
          </div>
          <div className="card-body ov-revenue-body">
            {loading ? (
              <Skeleton height="16rem" radius="0.75rem" />
            ) : (
              <RevenueDonut slices={revenueByMethod[RANGE]} />
            )}
          </div>
          <div className="card-foot card-foot-end">
            <Link className="btn btn-ghost btn-sm" to={ROUTES.payments}>
              All transactions <ArrowUpRight size={14} />
            </Link>
          </div>
        </section>

        <section className="card ov-card ov-top" aria-labelledby="tops-heading">
          <div className="card-head ov-card-head">
            <div className="ov-card-title">
              <span className="icon-tile" aria-hidden="true">
                <Scissors size={17} strokeWidth={1.8} />
              </span>
              <h2 id="tops-heading">Top hairstyles</h2>
            </div>
          </div>
          <div className="card-body">
            {loading ? (
              <Skeleton height="7.5rem" radius="0.75rem" />
            ) : (
              <RankedList items={topHairstylesByRange[RANGE]} />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
