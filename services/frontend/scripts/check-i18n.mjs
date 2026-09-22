#!/usr/bin/env node
/**
 * Checks the English and Bangla dictionaries agree.
 *
 * `tsc` already proves Bangla carries every English key — `bn/index.ts` is typed
 * against the English shape. This catches what types cannot:
 *   - a value left in English
 *   - a placeholder that did not survive translation
 *   - a plural missing its `_one` / `_other` partner
 *   - a dead Bangla key with no English source
 *
 * Run with `npm run check:i18n`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n');
const SLICES = ['common', 'auth', 'home', 'booking', 'tryon', 'profile', 'provider', 'proQueue', 'proBusiness', 'proSalon', 'proTeam'];

/** Values that are legitimately identical in both languages. */
const SAME_BY_DESIGN = new Set([
  'bKash', 'Nagad', 'Rocket', 'Visa', 'Mastercard', 'Amex', 'Eureka',
  'you@example.com', 'AM', 'PM',
]);

/* A value may be single- or double-quoted (an apostrophe forces double quotes),
   and the key and value can sit on different lines once a long string wraps. */
const ENTRY =
  /['"]([A-Za-z][\w.]*)['"]\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,/gs;

const parse = (path) => {
  const text = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const out = new Map();
  for (const [, key, single, double] of text.matchAll(ENTRY)) {
    out.set(key, single ?? double);
  }
  return out;
};

/** True if the string carries words a reader would notice, rather than only
    placeholders, punctuation, digits or a brand name. */
const isTranslatable = (value) => {
  const stripped = value.replace(/\{\w+\}/g, '').trim();
  return /[A-Za-z]{3}/.test(stripped) && !SAME_BY_DESIGN.has(stripped);
};

const hasBengali = (value) => /[ঀ-৿]/.test(value);
const placeholders = (value) => new Set([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const problems = [];
let total = 0;

for (const slice of SLICES) {
  const en = parse(join(root, 'en', `${slice}.ts`));
  const bn = parse(join(root, 'bn', `${slice}.ts`));
  total += en.size;

  for (const key of [...en.keys()].filter((k) => !bn.has(k)).sort()) {
    problems.push(`${slice}: missing in bn   ${key}`);
  }
  for (const key of [...bn.keys()].filter((k) => !en.has(k)).sort()) {
    problems.push(`${slice}: dead bn key     ${key}  (no English source)`);
  }

  for (const key of [...en.keys()].filter((k) => bn.has(k)).sort()) {
    const enValue = en.get(key);
    const bnValue = bn.get(key);
    if (enValue === bnValue && isTranslatable(enValue) && !hasBengali(bnValue)) {
      problems.push(`${slice}: untranslated    ${key} = "${enValue.slice(0, 50)}"`);
    }
    if (!sameSet(placeholders(enValue), placeholders(bnValue))) {
      problems.push(`${slice}: placeholders    ${key}`);
    }
  }

  for (const key of en.keys()) {
    const match = /^(.*)_(one|other)$/.exec(key);
    if (!match) continue;
    const partner = `${match[1]}_${match[2] === 'one' ? 'other' : 'one'}`;
    if (!en.has(partner)) problems.push(`${slice}: plural pair     ${key} has no ${partner}`);
  }
}

console.log(`${total} keys across ${SLICES.length} slices`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.log(' -', problem);
  process.exit(1);
}
console.log('English and Bangla agree.');
