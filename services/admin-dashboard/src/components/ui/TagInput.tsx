import { useState } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  id?: string;
}

/** Comma- or Enter-separated chips. Backspace on an empty box removes the last. */
export function TagInput({ value, onChange, placeholder = 'Add a tag…', id }: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '');
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };

  return (
    <div className="tag-input-wrap">
      {value.map((tag) => (
        <span className="chip" key={tag}>
          {tag}
          <button type="button" onClick={() => onChange(value.filter((item) => item !== tag))} aria-label={`Remove ${tag}`}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={(event) => {
          if (event.target.value.endsWith(',')) commit(event.target.value);
          else setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(draft);
          }
          if (event.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && commit(draft)}
      />
    </div>
  );
}
