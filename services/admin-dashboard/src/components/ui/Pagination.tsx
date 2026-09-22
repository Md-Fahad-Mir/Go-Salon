import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZES } from '../../constants';

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/** Windows the page buttons so the control stays thumb-friendly on phones. */
const windowed = (page: number, pageCount: number): number[] => {
  const span = 3;
  let start = Math.max(1, page - Math.floor(span / 2));
  const end = Math.min(pageCount, start + span - 1);
  start = Math.max(1, end - span + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label="Pagination">
      <div className="row" style={{ gap: '0.75rem' }}>
        <p className="pagination-info">
          {first}–{last} of {total}
        </p>
        <label className="pagination-info row" style={{ gap: '0.375rem' }}>
          <span className="sr-only">Rows per page</span>
          <select
            className="select page-size"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pagination-pages">
        <button
          type="button"
          className="page-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {windowed(page, pageCount).map((item) => (
          <button
            key={item}
            type="button"
            className="page-btn"
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          className="page-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
