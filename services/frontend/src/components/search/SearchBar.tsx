import { Search, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { useT } from '../../hooks/useLanguage';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
}

/** Pill search field with a magnifier and a clear button. Enter just closes
    the keyboard — results update as you type. */
export function SearchBar({ value, onChange, placeholder, label, autoFocus }: SearchBarProps) {
  const t = useT();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
  };
  return (
    <form className="search search-bar" role="search" onSubmit={submit}>
      <Search size={18} aria-hidden="true" />
      <input
        className="input"
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoFocus={autoFocus}
      />
      {value ? (
        <button type="button" className="search-clear" aria-label={t('home.searchClear')} onClick={() => onChange('')}>
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </form>
  );
}
