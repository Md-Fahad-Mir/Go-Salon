import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { TimeRange } from '../types';
import { ROUTES } from '../constants';
import {
  RANGE_CAPTIONS,
  RANGE_LABELS,
  dhakaAreasByRange,
  generationSeries,
  kpisByRange,
  revenueByMethod,
  topHairstylesByRange,
} from '../mockData/overview';
import { GenerationsChart } from '../components/charts/GenerationsChart';
import { RankedList } from '../components/charts/RankedList';
import { ShareBar } from '../components/charts/ShareBar';
import { KpiCard, KpiSkeletonCard } from '../components/ui/KpiCard';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { formatBdtCompact } from '../utils/format';

const RANGES: TimeRange[] = ['30d', '7d', 'today'];

export default function OverviewPage() {
  const [range, setRange] = useState<TimeRange>('30d');
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // Stand-in for the fetch a real console would fire on range change: the
  // skeletons get a beat on screen so their styling is exercised.
  const changeRange = (next: TimeRange) => {
    if (next === range) return;
    setRange(next);
    setLoading(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setLoading(false), 320);
  };

  const slices = revenueByMethod[range];
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);

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

      <div className="kpi-grid">
        {loading
          ? Array.from({ length: 6 }, (_, index) => <KpiSkeletonCard key={index} />)
          : kpisByRange[range].map((datum) => <KpiCard key={datum.id} datum={datum} />)}
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
                <>
                  <RankedList items={topHairstylesByRange[range]} />
                  <h3 className="section-label">Dhaka areas</h3>
                  <RankedList items={dhakaAreasByRange[range]} meter={false} />
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
