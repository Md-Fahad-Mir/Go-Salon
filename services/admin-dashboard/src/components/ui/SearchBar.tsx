import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search…', label = 'Search' }: SearchBarProps) {
  return (
    <div className="search">
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        className="input"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Clear search">
          <X size={15} />
        </button>
      ) : null}
    </div>
  );
}
