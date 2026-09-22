#!/usr/bin/env node
/* The customer redesign must not change what a professional sees.
 *
 * Nothing else enforces that. There are no tests in this frontend, and the
 * constraint is spread over ~40 shared selectors in four stylesheets that both
 * apps read — so the one time someone edits a base rule instead of adding a
 * scoped override, the provider app changes and no typecheck, lint or i18n
 * check notices.
 *
 * This compares the working tree against a baseline commit and applies two
 * rules to the shared files:
 *
 *   1. In ui.css / base.css / layout.css, a changed line must sit inside a
 *      `:root[data-app='customer']` block. Adding customer-scoped rules is
 *      fine; editing a base rule is not.
 *   2. In theme.css, changes may only ADD custom properties. Re-valuing an
 *      existing token repaints the provider app, since its stylesheets read
 *      the same variables.
 *
 * Provider stylesheets and provider components may not change at all.
 *
 *     node scripts/check-scope.mjs [baseline-ref]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const BASE = process.argv[2] || 'HEAD';

/** Shared with the provider app: scoped additions only. */
const SCOPED_ONLY = [
  'src/styles/ui.css',
  'src/styles/base.css',
  'src/styles/layout.css',
  /* Shared with the customer, whose settings screen is signed off:
     .pf-theme-option, .pf-version and the list rows all render there. Its own
     header says so, but nothing enforced it until now. */
  'src/styles/profile.css',
  /* .bk-loading renders on RequestsPage for all three provider roles. */
  'src/styles/booking.css',
];

/** Shared: new tokens may be added, existing ones may not be re-valued. */
const ADDITIVE_ONLY = ['src/styles/theme.css'];

/** Shared by more than one role: scoped additions only, same rule as ui.css.
    provider.css is the whole chassis — every selector in it renders on a barber
    or an employee screen. provider-queue and provider-business each have an
    owner-reachable slice, but the file as a whole is shared. */
const SCOPED_PROVIDER = [
  'src/styles/provider.css',
  'src/styles/provider-queue.css',
  'src/styles/provider-business.css',
];

/** Two stylesheets own a class namespace outright, and may rewrite it in place:
    provider-salon.css owns .ps-* (owner screens only) and provider-team.css
    owns .pt-* (barber and employee only). Anything ELSE they style belongs to
    somebody else and has to be scoped — which is the hole the old .ps-pick-only
    check left open, since the owner block in provider-salon.css also overrides
    .pb-hours-row, .pro-appt and friends that a barber renders too. */
const NAMESPACED = {
  'src/styles/provider-salon.css': /^\.ps-/,
  'src/styles/provider-team.css': /^\.pt-/,
};

/** Nothing is off-limits any more: every role in the product now has a skin,
    and provider-team.css turned out to be the barber's and the employee's own
    (no owner screen renders a .pt-* class, and its one .pro-chart rule is
    qualified by [data-dense], which only the employee's PerformancePage sets).
    The scoped checks below are what keep one role out of another's UI. */
const OFF_LIMITS = [];

/** Any role whose screens this repo currently re-dresses. A changed line in a
    shared stylesheet has to sit inside one of these. */
const ROLES = ['customer', 'salon_owner', 'barber', 'salon_employee'];
/** A selector is scoped when it is rooted AND names one of those roles. The two
    halves are tested separately because a scope is often qualified in between —
    `:root[data-lang='bn'][data-app='customer'] .label` is scoped, and matching
    the two brackets as one literal string would miss every such rule. */
const isScoped = (selector) =>
  selector.trimStart().startsWith(':root')
  && ROLES.some((role) => selector.includes(`[data-app='${role}']`)
                       || selector.includes(`[data-app="${role}"]`));
const SCOPES = ROLES.map((role) => `:root[data-app='${role}']`);
const SCOPE = SCOPES.join(' or ');

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

const diffFor = (file) => {
  try {
    return git('diff', '-U0', BASE, '--', file);
  } catch {
    return '';
  }
};

const problems = [];

/* --- 1. Shared stylesheets: every changed line must be inside a scope ----- */

/** provider-salon.css is the owner's own and may be rewritten in place — with
    one exception. WalkInSheet renders .ps-pick* and QueuePage opens WalkInSheet
    for the barber and the salon employee, so those four rules are shared and
    must be overridden rather than edited. */
/** Every class a selector names, so we can ask whether they are all the file's
    own. `.ps-chair[aria-pressed='true'] .ps-chair-name` -> ps-chair, ps-chair-name. */
const classesIn = (selector) =>
  [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => '.' + m[1]);

for (const file of [...SCOPED_ONLY, ...SCOPED_PROVIDER, ...Object.keys(NAMESPACED)]) {
  const own = NAMESPACED[file];
  const diff = diffFor(file);
  if (!diff) continue;

  /* Walk the working-tree file, tracking brace depth from the nearest
     enclosing selector, so we can tell whether a touched line is inside a
     customer-scoped block or inside a base rule. */
  /* Comments are blanked before the walk, line count preserved. Prose inside a
     block comment otherwise accumulates into the pending selector — and a
     sentence mentioning `owner.css` parses as a class called `.css`. */
  const source = readFileSync(file, 'utf8');
  const after = source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .split('\n');
  const raw = source.split('\n');
  const touched = new Set();
  const removed = new Set();
  for (const raw of diff.split('\n')) {
    const header = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?/);
    if (!header) continue;
    const line = Number(header[3]);
    const count = header[4] === undefined ? 1 : Number(header[4]);
    /* A pure deletion is `@@ -2,3 +1,0 @@` — count 0, so nothing lands in
       `touched` and removing a rule would pass unnoticed. The old-side numbers
       are recorded instead and checked against the old file below: retiring a
       rule that was already role-scoped is safe and normal housekeeping;
       deleting a base rule is what this guard exists to stop. */
    if (count === 0) {
      const from = Number(header[1]);
      const gone = header[2] === undefined ? 1 : Number(header[2]);
      for (let i = 0; i < gone; i += 1) removed.add(from + i);
      continue;
    }
    for (let i = 0; i < count; i += 1) touched.add(line + i);
  }

  const walk = (lines, originals, marks, report) => {
  let selector = '';
  let selectorDepth = 0;
  let pending = '';
  let depth = 0;
  lines.forEach((text, index) => {
    const number = index + 1;
    /* Accumulate the whole selector list: every stylesheet here uses multi-line
       lists, and reading only the line that carries the brace would accept an
       unscoped sibling whenever the last line happens to be scoped.

       Selectors are captured at whatever depth they open at, not only at the
       top level — otherwise every rule inside an `@media` block is invisible to
       the check, which is how three `.ps-*` hover rules read as unscoped. */
    if (selector && depth <= selectorDepth) { selector = ''; }
    if (text.includes('{')) {
      const head = (pending + ' ' + text.slice(0, text.indexOf('{'))).trim();
      pending = '';
      if (!head.startsWith('@') && head) {
        selector = head;
        selectorDepth = depth;
      }
    } else if (!selector && text.trim()) {
      pending += ' ' + text;
    }
    /* An at-rule line declares nothing on its own — the rules inside it are
       each checked in their own right. */
    if (marks.has(number) && text.trim() && !text.trim().startsWith('@')) {
      const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
      const scoped = parts.length > 0 ? parts.every(isScoped) : isScoped(text);
      /* A namespaced file may rewrite anything ANCHORED by one of its own
         classes: `.ps-member-head .avatar` can only ever match on an owner
         screen, because nothing else renders .ps-member-head. A bare `.avatar`
         cannot, so it still needs a role scope. Every comma-separated part must
         carry its own anchor. */
      const anchored = own && parts.length > 0
        && parts.every((part) => classesIn(part).some((n) => own.test(n)));
      if (!scoped && !anchored) {
        const why = own
          ? `styles a selector this file does not anchor with its own namespace`
          : 'changed outside a role scope';
        report(number, why, (originals[index] || '').trim());
      }
    }
    depth += (text.match(/{/g) || []).length - (text.match(/}/g) || []).length;
    if (depth <= 0) { depth = 0; selector = ''; pending = ''; }
  });
  };

  const blank = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' ')).split('\n');

  walk(after, raw, touched, (number, why, line) =>
    problems.push(`${file}:${number} ${why}\n      ${line}`));

  if (removed.size) {
    let old = '';
    try { old = git('show', `${BASE}:./${file}`); } catch { old = ''; }
    if (old) {
      walk(blank(old), old.split('\n'), removed, (number, why, line) =>
        problems.push(`${file} removed line ${number}, which ${why.replace('changed', 'was')}\n      ${line}`));
    }
  }
}

/* --- 2. theme.css: additions only ---------------------------------------- */

for (const file of ADDITIVE_ONLY) {
  const diff = diffFor(file);
  if (!diff) continue;
  for (const raw of diff.split('\n')) {
    if (!raw.startsWith('-') || raw.startsWith('---')) continue;
    const text = raw.slice(1).trim();
    if (!text || text.startsWith('/*') || text.startsWith('*') || text === '}') continue;
    problems.push(`${file} removed or re-valued an existing declaration\n      ${text}`);
  }
}

/* --- 3. Admin has no skin -------------------------------------------------
   Customer, salon_owner, barber and salon_employee each have one now. Admin
   does not: its NAV_TABS entry is empty and the account is pointed at Django's
   own admin site, so a rule for it would be dead CSS pretending to be a skin. */

const UNSKINNED = /:root\[data-app=['"](admin)['"]\]/;
/* A bare `[data-app=…]` matches nothing useful: the attribute lives only on
   <html>, and a selector without the :root prefix reads as if it would also
   catch the frame div — which is exactly how a portalled sheet gets missed. */
const BARE_SCOPE = /(^|[\s,>+~(])\[data-app=/;
for (const file of readdirSync('src/styles').filter((n) => n.endsWith('.css'))) {
  const path = 'src/styles/' + file;
  readFileSync(path, 'utf8').split('\n').forEach((text, index) => {
    if (UNSKINNED.test(text)) {
      problems.push(`${path}:${index + 1} skins a role that is out of scope\n      ${text.trim()}`);
    }
    if (BARE_SCOPE.test(text)) {
      problems.push(`${path}:${index + 1} uses [data-app=…] without the :root prefix — it would miss every portalled sheet\n      ${text.trim()}`);
    }
  });
}

/* --- 4. Provider files: untouched ---------------------------------------- */

const changed = git('diff', '--name-only', BASE).split('\n').filter(Boolean);
for (const file of changed) {
  const relative = file.replace(/^services\/frontend\//, '');
  if (OFF_LIMITS.some((path) => relative.startsWith(path))) {
    problems.push(`${relative} is provider-owned and must not change`);
  }
}

if (problems.length) {
  console.error(`\n  Customer scope check failed against ${BASE}:\n`);
  for (const problem of problems) console.error(`    - ${problem}`);
  console.error(`\n  ${problems.length} problem(s). Add a ${SCOPE} override instead of editing the base rule.\n`);
  process.exit(1);
}

console.log(`Customer scope clean against ${BASE} — no shared rule edited, no provider file touched.`);
