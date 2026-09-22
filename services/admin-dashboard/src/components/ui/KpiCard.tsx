import type { KpiDatum } from '../../types';
import { TrendIndicator } from './TrendIndicator';

/** Renders the metric value with any trailing unit kept visually secondary. */
const splitValue = (value: string): [string, string | null] => {
  // Composite values like "$1,840 / ৳842k" stay at one size; only a lone
  // measure such as "94.2%" or "18.4s" gets its unit set smaller.
  if (value.includes('/')) return [value, null];
  const match = value.match(/^([\d.,$৳]+)([a-zA-Z%]+)$/);
  return match ? [match[1], match[2]] : [value, null];
};

export function KpiCard({ datum }: { datum: KpiDatum }) {
  const [main, unit] = splitValue(datum.value);

  return (
    <article className="card kpi">
      <h2 className="kpi-label">{datum.label}</h2>
      <p className="kpi-value">
        {main}
        {unit ? <small>{unit}</small> : null}
      </p>
      <TrendIndicator tone={datum.tone}>{datum.footnote}</TrendIndicator>
    </article>
  );
}

export function KpiSkeletonCard() {
  return (
    <article className="card kpi" aria-hidden="true">
      <span className="skeleton" style={{ display: 'block', width: '60%', height: '0.75rem' }} />
      <span className="skeleton" style={{ display: 'block', width: '80%', height: '1.75rem' }} />
      <span className="skeleton" style={{ display: 'block', width: '50%', height: '0.75rem' }} />
    </article>
  );
}
