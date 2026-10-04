import type { LucideIcon } from 'lucide-react';
import type { KpiDatum } from '../../types';

/** Renders the metric value with any trailing unit kept visually secondary. */
const splitValue = (value: string): [string, string | null] => {
  // Composite values like "$1,840 / ৳842k" stay at one size; only a lone
  // measure such as "94.2%" or "18.4s" gets its unit set smaller.
  if (value.includes('/')) return [value, null];
  const match = value.match(/^([\d.,$৳]+)([a-zA-Z%]+)$/);
  return match ? [match[1], match[2]] : [value, null];
};

/** One figure in the Overview's key-figures band. Renders a dt/dd pair, so
    it belongs inside a <dl>. */
export function KpiCard({ datum, icon: Icon }: { datum: KpiDatum; icon: LucideIcon }) {
  const [main, unit] = splitValue(datum.value);

  return (
    <div className="kpi">
      <dt className="kpi-label">
        <span className="kpi-icon" aria-hidden="true">
          <Icon size={15} strokeWidth={1.8} />
        </span>
        {datum.label}
      </dt>
      <dd className="kpi-value">
        {main}
        {unit ? <small>{unit}</small> : null}
      </dd>
    </div>
  );
}

export function KpiSkeletonCard() {
  return (
    <div className="kpi" aria-hidden="true">
      <span className="skeleton" style={{ display: 'block', width: '55%', height: '1.875rem' }} />
      <span className="skeleton" style={{ display: 'block', width: '70%', height: '2.125rem' }} />
    </div>
  );
}
