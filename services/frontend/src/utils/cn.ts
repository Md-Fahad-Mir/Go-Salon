/** Tiny class-name joiner — keeps conditional classes readable in JSX. */
export const cn = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');
