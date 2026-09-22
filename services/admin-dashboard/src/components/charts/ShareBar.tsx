import type { RevenueSlice } from '../../types';
import { formatBdt, formatBdtCompact } from '../../utils/format';

interface ShareBarProps {
  slices: RevenueSlice[];
  /** Show exact amounts instead of the compact ৳404k form. */
  exact?: boolean;
}

/** Part-to-whole across four payment methods. Every slice is direct-labelled
    in the legend with its own swatch and value, so the bar itself never has
    to carry identity alone. */
export function ShareBar({ slices, exact = false }: ShareBarProps) {
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);

  return (
    <div>
      <div className="share-bar" role="img" aria-label={`Revenue split: ${slices.map((s) => `${s.label} ${formatBdt(s.amount)}`).join(', ')}`}>
        {slices.map((slice, index) => (
          <span
            key={slice.method}
            style={{
              width: `${(slice.amount / total) * 100}%`,
              backgroundColor: slice.color,
              marginInlineStart: index === 0 ? 0 : '2px',
            }}
          />
        ))}
      </div>

      <dl className="share-legend">
        {slices.map((slice) => (
          <div className="share-row" key={slice.method}>
            <span className="dot" style={{ backgroundColor: slice.color }} aria-hidden="true" />
            <dt className="name">{slice.label}</dt>
            <dd className="val">{exact ? formatBdt(slice.amount) : formatBdtCompact(slice.amount)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
