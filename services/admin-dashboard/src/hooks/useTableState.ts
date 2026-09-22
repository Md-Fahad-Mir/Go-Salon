import { useCallback, useMemo, useState } from 'react';
import { useDebounce } from './useDebounce';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface FilterDef<T> {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  match: (row: T, value: string) => boolean;
}

export interface TableStateOptions<T> {
  rows: T[];
  /** Fields concatenated for the free-text search box. */
  searchOn: (row: T) => Array<string | number | undefined>;
  filters?: Array<FilterDef<T>>;
  sortAccessors?: Record<string, (row: T) => string | number>;
  initialSort?: SortState;
  initialPageSize?: number;
}

const compare = (a: string | number, b: string | number): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
};

export function useTableState<T>({
  rows,
  searchOn,
  filters = [],
  sortAccessors = {},
  initialSort,
  initialPageSize = 10,
}: TableStateOptions<T>) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortState | undefined>(initialSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const setFilter = useCallback((key: string, value: string) => {
    setFilterValues((current) => ({ ...current, [key]: value }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilterValues({});
    setQuery('');
    setPage(1);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const toggleSort = useCallback((key: string) => {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return undefined;
    });
  }, []);

  const filtered = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    let result = rows;

    if (needle) {
      result = result.filter((row) =>
        searchOn(row)
          .filter((field) => field !== undefined && field !== null)
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }

    for (const filter of filters) {
      const value = filterValues[filter.key];
      if (!value || value === 'all') continue;
      result = result.filter((row) => filter.match(row, value));
    }

    if (sort) {
      const accessor =
        sortAccessors[sort.key] ??
        ((row: T) => (row as Record<string, unknown>)[sort.key] as string | number);
      result = [...result].sort((a, b) => {
        const delta = compare(accessor(a) ?? '', accessor(b) ?? '');
        return sort.direction === 'asc' ? delta : -delta;
      });
    }

    return result;
    // searchOn / filters / sortAccessors are recreated each render by callers;
    // the meaningful inputs are the row set and the control values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, debouncedQuery, filterValues, sort]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (query.trim()) {
      chips.push({
        key: 'search',
        label: `Search: "${query.trim()}"`,
        onClear: () => setQuery(''),
      });
    }
    for (const filter of filters) {
      const value = filterValues[filter.key];
      if (!value || value === 'all') continue;
      const option = filter.options.find((item) => item.value === value);
      chips.push({
        key: filter.key,
        label: `${filter.label}: ${option?.label ?? value}`,
        onClear: () => setFilter(filter.key, 'all'),
      });
    }
    return chips;
  }, [query, filters, filterValues, setFilter]);

  return {
    query,
    setQuery: (value: string) => {
      setQuery(value);
      setPage(1);
    },
    filterValues,
    setFilter,
    clearFilters,
    activeChips,
    sort,
    toggleSort,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    total,
    rows: pageRows,
    filteredRows: filtered,
  };
}
