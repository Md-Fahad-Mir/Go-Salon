import type { RevenueSlice } from '../../types';
import { formatBdt, formatBdtCompact } from '../../utils/format';

const SIZE = 180;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Length of the hairline gap between segments, along the ring. */
const GAP = 3;

/** Part-to-whole across the payment methods as a ring, total in the middle.
    Every segment is named in the legend with its share and amount, so the
    colours never carry identity alone. Segment colours are CSS variables,
    set through `style` because SVG presentation attributes do not resolve
    var(). */
export function RevenueDonut({ slices }: { slices: RevenueSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);

  const arcs = slices.reduce<Array<{ slice: RevenueSlice; dash: number; offset: number; end: number }>>(
    (built, slice) => {
      const offset = built.length ? built[built.length - 1].end : 0;
      const length = total ? (slice.amount / total) * CIRCUMFERENCE : 0;
      return [...built, { slice, dash: Math.max(length - GAP, 0), offset, end: offset + length }];
    },
    [],
  );

  return (
    <div className="donut-wrap">
      <figure
        className="donut"
        role="img"
        aria-label={`Revenue split: ${slices.map((s) => `${s.label} ${formatBdt(s.amount)}`).join(', ')}`}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle className="donut-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} strokeWidth={STROKE} />
          {arcs.map(({ slice, dash, offset }) => (
            <circle
              key={slice.method}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              style={{ stroke: slice.color }}
            />
          ))}
        </svg>
        <figcaption className="donut-center" aria-hidden="true">
          <span className="donut-total">{formatBdtCompact(total)}</span>
          <span className="donut-caption">Total</span>
        </figcaption>
      </figure>

      <dl className="donut-legend">
        {slices.map((slice) => (
          <div className="donut-row" key={slice.method}>
            <dt>
              <span className="dot" style={{ backgroundColor: slice.color }} aria-hidden="true" />
              {slice.label}
            </dt>
            <dd>
              <span className="donut-share">{total ? Math.round((slice.amount / total) * 100) : 0}%</span>
              <span className="donut-amount">{formatBdtCompact(slice.amount)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
