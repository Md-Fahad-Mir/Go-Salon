import type { RankedDatum } from '../../types';
import { formatNumber } from '../../utils/format';

interface RankedListProps {
  items: RankedDatum[];
  /** Draw a proportional meter under each entry. */
  meter?: boolean;
}

/** A ranking as numbered tiles: a row of cards on wide screens, a stacked
    list on phones. The leader gets the champagne tile. */
export function RankedList({ items, meter = true }: RankedListProps) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ol className="rank-tiles">
      {items.map((item, index) => (
        <li className="rank-tile" key={item.id ?? item.name} data-top={index === 0}>
          <span className="rank-no" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="rank-name">{item.name}</span>
          <span className="rank-val">{formatNumber(item.value)}</span>
          {meter ? (
            <span className="rank-track" aria-hidden="true">
              <span className="rank-meter" style={{ width: `${(item.value / max) * 100}%` }} />
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
