import { formatBdt } from '../../../utils/format';

export interface RankRow {
  id: string;
  name: string;
  /** What the bar is proportional to, and what shows on the right. */
  value: number;
  /** Small print under the bar: counts, commission, whatever ranks second. */
  sub: string[];
}

interface RankListProps {
  rows: RankRow[];
  label: string;
}

/** A ranked list where the bar carries the comparison. Sorted highest first,
    with every bar measured against the leader, so an owner can see the shape
    of the month without reading a single number. */
export function RankList({ rows, label }: RankListProps) {
  const top = rows.reduce((max, row) => Math.max(max, row.value), 0) || 1;

  return (
    <ol className="ps-ranks" aria-label={label}>
      {rows.map((row, index) => (
        <li key={row.id} className="ps-rank" data-top={index === 0 ? 'true' : undefined}>
          <div className="ps-rank-head">
            <span className="ps-rank-name">{row.name}</span>
            <span className="ps-rank-value">{formatBdt(row.value)}</span>
          </div>
          <div className="ps-bar">
            <div className="ps-bar-fill" style={{ width: `${Math.max(4, (row.value / top) * 100)}%` }} />
          </div>
          <div className="ps-rank-sub">
            {row.sub.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
