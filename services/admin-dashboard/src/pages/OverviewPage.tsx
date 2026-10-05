import { useEffect, useState } from 'react';
import { subDays } from 'date-fns';
import {
  ChartColumn,
  Coins,
  RefreshCw,
  Rotate3d,
  Scissors,
  Store,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DailyPoint, KpiDatum, RankedDatum, TimeRange } from '../types';
import { kpisByRange } from '../mockData/overview';
import { useAsyncList } from '../hooks/useAsyncList';
import { hairstyleService, overviewService } from '../utils/adminService';
import { ApiError } from '../utils/apiError';
import { GenerationsChart } from '../components/charts/GenerationsChart';
import { RankedList } from '../components/charts/RankedList';
import { EmptyState } from '../components/ui/EmptyState';
import { KpiCard, KpiSkeletonCard } from '../components/ui/KpiCard';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { formatShortDate } from '../utils/format';

/** The overview always covers the last 30 days. */
const RANGE: TimeRange = '30d';

/** How many styles the Top hairstyles card ranks. */
const TOP_HAIRSTYLES = 5;

/** The AI Hairstyles catalogue's most-generated styles — the same
    `generation_count` its Generations column shows. Styles nobody has
    generated yet are left out rather than ranked at zero. */
const fetchTopHairstyles = async (): Promise<RankedDatum[]> => {
  const styles = await hairstyleService.list();
  return styles
    .filter((style) => style.generationCount > 0)
    .sort((a, b) => b.generationCount - a.generationCount)
    .slice(0, TOP_HAIRSTYLES)
    .map((style) => ({ id: style.id, name: style.name, value: style.generationCount }));
};

const KPI_ICONS: Record<string, LucideIcon> = {
  'active-users': Users,
  'tryon-videos': Rotate3d,
  spend: Coins,
  'new-salons': Store,
};

interface LiveKpis {
  activeUsers: KpiDatum;
  newSalons: KpiDatum;
  tryOnVideos: KpiDatum;
  aiSpend: KpiDatum;
}

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [liveKpis, setLiveKpis] = useState<LiveKpis | null>(null);
  const [videosPerDay, setVideosPerDay] = useState<DailyPoint[] | null>(null);
  const topHairstyles = useAsyncList(fetchTopHairstyles);

  const fetchStats = () => {
    overviewService
      .stats(RANGE)
      .then(({ videosPerDay: days, ...kpis }) => {
        setLiveKpis(kpis);
        setVideosPerDay(days);
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

  const today = new Date();
  const period = `${formatShortDate(subDays(today, 29))} – ${formatShortDate(today)}`;

  // Every KPI is real once `liveKpis` lands: 360° try-on video counts every
  // completed video, and AI spend vs revenue prices those same videos — spend
  // at each model's OpenRouter price, revenue at the price set in Settings.
  // The per-day chart splits those completed videos by the day they finished,
  // and Top hairstyles reads the AI Hairstyles catalogue.
  const kpis: KpiDatum[] = kpisByRange[RANGE].map((datum) => {
    if (datum.id === 'active-users' && liveKpis) return liveKpis.activeUsers;
    if (datum.id === 'tryon-videos' && liveKpis) return liveKpis.tryOnVideos;
    if (datum.id === 'spend' && liveKpis) return liveKpis.aiSpend;
    if (datum.id === 'new-salons' && liveKpis) return liveKpis.newSalons;
    return datum;
  });

  return (
    <>
      <PageHeader title="Overview" />

      {statsError ? (
        <div className="alert alert-warning alert-bar" role="alert">
          <span>
            Live figures are unavailable right now — showing the last known figures.
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
              <h2 id="generations-heading">360° try-on video generations per day</h2>
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
            ) : statsError || !videosPerDay ? (
              <EmptyState
                title="Couldn't load 360° try-on videos"
                message={statsError ?? undefined}
                action={
                  <button type="button" className="btn btn-secondary btn-sm" onClick={retryStats}>
                    <RefreshCw size={14} /> Retry
                  </button>
                }
              />
            ) : videosPerDay.every((day) => day.generations === 0) ? (
              <EmptyState
                icon={<Rotate3d size={28} strokeWidth={1.5} />}
                title="No videos in the last 30 days"
                message="Each day fills in here as customers finish 360° try-on videos."
              />
            ) : (
              <GenerationsChart data={videosPerDay} />
            )}
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
            {topHairstyles.loading ? (
              <Skeleton height="7.5rem" radius="0.75rem" />
            ) : topHairstyles.error ? (
              <EmptyState
                title="Couldn't load top hairstyles"
                message={topHairstyles.error}
                action={
                  <button type="button" className="btn btn-secondary btn-sm" onClick={topHairstyles.refetch}>
                    <RefreshCw size={14} /> Retry
                  </button>
                }
              />
            ) : topHairstyles.data.length === 0 ? (
              <EmptyState
                icon={<Scissors size={28} strokeWidth={1.5} />}
                title="No generations yet"
                message="Styles from AI Hairstyles show up here once customers start generating them."
              />
            ) : (
              <RankedList items={topHairstyles.data} />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
