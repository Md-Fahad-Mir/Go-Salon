import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SortState } from '../../hooks/useTableState';
import { cn } from '../../utils/cn';
import { EmptyState } from './EmptyState';
import { TableSkeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  align?: 'start' | 'end';
  /** Keep this column out of the stacked card view (usually the title field). */
  hideOnCard?: boolean;
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  sort?: SortState;
  onSort?: (key: string) => void;
  /** Rendered in the trailing cell on desktop and in the card footer on mobile. */
  actions?: (row: T) => ReactNode;
  cardTitle?: (row: T) => ReactNode;
  cardActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  caption: string;
}

/** One dataset, two renderings: a scrollable table from 48rem up and a stack
    of cards below it, so no column is ever hidden from a phone. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  actions,
  cardTitle,
  cardActions,
  onRowClick,
  loading = false,
  emptyTitle = 'Nothing to show',
  emptyMessage = 'Try clearing a filter or widening the date range.',
  caption,
}: DataTableProps<T>) {
  if (loading) return <TableSkeleton />;
  if (!rows.length) return <EmptyState title={emptyTitle} message={emptyMessage} />;

  const ariaSort = (key: string): 'ascending' | 'descending' | undefined => {
    if (sort?.key !== key) return undefined;
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <>
      <div className="table-desktop">
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={ariaSort(column.key)}
                    style={{ textAlign: column.align === 'end' ? 'end' : undefined }}
                  >
                    {column.sortable && onSort ? (
                      <button type="button" onClick={() => onSort(column.key)}>
                        {column.header}
                        {sort?.key === column.key ? (
                          sort.direction === 'asc' ? (
                            <ArrowUp size={12} />
                          ) : (
                            <ArrowDown size={12} />
                          )
                        ) : (
                          <ChevronsUpDown size={12} opacity={0.5} />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
                {actions ? (
                  <th scope="col" style={{ textAlign: 'end' }}>
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={cn(column.align === 'end' && 'num')}>
                      {column.render(row)}
                    </td>
                  ))}
                  {actions ? (
                    <td>
                      <div
                        className="row-actions"
                        onClick={(event) => event.stopPropagation()}
                        role="presentation"
                      >
                        {actions(row)}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="table-cards">
        {rows.map((row) => (
          <li className="tc" key={rowKey(row)}>
            {cardTitle ? <div className="strong">{cardTitle(row)}</div> : null}
            <dl style={{ display: 'contents' }}>
              {columns
                .filter((column) => !column.hideOnCard)
                .map((column) => (
                  <div className="tc-row" key={column.key}>
                    <dt>{column.header}</dt>
                    <dd className="truncate">{column.render(row)}</dd>
                  </div>
                ))}
            </dl>
            {cardActions ?? actions ? (
              <div className="tc-actions">{(cardActions ?? actions)?.(row)}</div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
