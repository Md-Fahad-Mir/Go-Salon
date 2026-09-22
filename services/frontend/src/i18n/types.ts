/** The two languages the app ships in. */
export type Language = 'en' | 'bn';

export const LANGUAGES: Array<{ id: Language; label: string; nativeLabel: string }> = [
  { id: 'en', label: 'English', nativeLabel: 'English' },
  { id: 'bn', label: 'Bangla', nativeLabel: 'বাংলা' },
];

/** Values a translation string can interpolate. */
export type TVars = Record<string, string | number>;

/** A dictionary slice: flat keys, no nesting, so a missing entry is a type error. */
export type Slice = Record<string, string>;
