import type { RankedDatum } from '../../types';
import { formatNumber } from '../../utils/format';

interface RankedListProps {
  items: RankedDatum[];
  /** Draw a proportional meter under each label. */
  meter?: boolean;
}

export function RankedList({ items, meter = true }: RankedListProps) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <dl className="rank-list">
      {items.map((item) => (
        <div className="rank-row" key={item.name}>
          <dt className="name">
            {item.name}
            {meter ? (
              <span
                className="rank-meter"
                style={{ display: 'block', width: `${(item.value / max) * 100}%`, marginTop: '0.375rem' }}
                aria-hidden="true"
              />
            ) : null}
          </dt>
          <dd className="val">{formatNumber(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
