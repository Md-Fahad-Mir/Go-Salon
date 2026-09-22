import { en, type TKey } from './en';
import { bn } from './bn';
import type { Language, TVars } from './types';

export type { Language, TVars } from './types';
export { LANGUAGES } from './types';
export type { Dictionary, TKey } from './en';

/* A plural pair ships as `key_one` / `key_other`; call sites pass the base
   `key` plus a count. Deriving the bases from the dictionary keeps them
   type-checked without listing them twice. */
type PluralBase<K> = K extends `${infer Base}_one` ? Base : never;
export type TranslationKey = TKey | PluralBase<TKey>;

export const DICTIONARIES: Record<Language, Record<TKey, string>> = { en, bn };

/** BCP 47 tags, used for Intl and the `lang` attribute. */
export const LOCALES: Record<Language, string> = { en: 'en-BD', bn: 'bn-BD' };

const interpolate = (template: string, vars?: TVars): string =>
  vars
    ? template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      )
    : template;

/** Builds the `t` for one language.

    Plurals: a key may ship `_one` / `_other` variants. Passing `count` picks
    the right one — Bangla has no separate plural form, so both variants there
    are usually identical, which is fine and keeps one call site. */
export const translator =
  (language: Language) =>
  (key: TranslationKey, vars?: TVars): string => {
    const dict = DICTIONARIES[language];
    let resolved = key as string;
    if (vars && 'count' in vars) {
      const variant = `${key}_${Number(vars.count) === 1 ? 'one' : 'other'}`;
      if (variant in dict) resolved = variant;
    }
    const template = dict[resolved as TKey] ?? DICTIONARIES.en[resolved as TKey];
    // A key with no entry in either language shows the key: loud in review,
    // harmless to a user who will never see it once the build is green.
    return interpolate(template ?? (key as string), vars);
  };

export type TFunction = ReturnType<typeof translator>;
