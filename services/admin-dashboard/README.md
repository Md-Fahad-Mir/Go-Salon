# Eureka Admin Dashboard

Frontend-only admin console for the Eureka Hair App — hairstyle catalogue, users,
salons and barbers, bookings, payments, moderation, notifications, platform
settings and an audit trail.

**There is no backend.** Every record is seeded from `src/mockData/` into a
Zustand store and mutated in memory; a page reload resets the demo. No `fetch`,
no API client, no auth.

## Getting started

```bash
node -v          # 20.19+ or 22.12+ (Vite 8)
npm install
npm run dev      # http://localhost:5173/admin
npm run build    # tsc -b && vite build
npm run lint
```

The app redirects `/` to `/admin`. Routes are lazy-loaded, one bundle per page.

## Stack

| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript (strict, no `any`) |
| Build | Vite 8 |
| Routing | React Router 7 |
| State | Zustand 5 |
| Charts | Recharts 3 |
| Dates | date-fns 4 |
| Icons | lucide-react |
| Styling | Plain CSS with custom properties (see below) |

## Layout of the source

```
src/
  components/
    charts/     GenerationsChart, ShareBar, RankedList
    layout/     Layout, Sidebar, Header, ThemeToggle
    ui/         DataTable, FilterBar, Modal, SidePanel, Toaster, Field, …
    ErrorBoundary.tsx, ThemeProvider.tsx
  constants/    routes, breakpoints, status labels + tones
  hooks/        useTheme, useMediaQuery, useDebounce, useTableState, useUi, useChartTheme
  mockData/     seeded fixtures, one file per entity
  pages/        one file per route
  store/        useStore.ts — all entities, all mutations, toasts, audit trail
  styles/       theme.css, base.css, layout.css, ui.css, pages.css
  types/        the domain model
  utils/        formatting helpers
```

## Styling: tokens, not a utility framework

Rather than CSS Modules or Tailwind, the UI is a small token-driven stylesheet
split by concern. Every colour in the app resolves through a custom property, so
a single class swap on `<html>` repaints everything — there is no second
stylesheet and no per-component theme branching.

| File | Holds |
|---|---|
| `styles/theme.css` | the tokens: light in `:root`, dark in `.dark-theme`, plus responsive metrics |
| `styles/base.css` | reset, typography, focus rings, utilities |
| `styles/layout.css` | app shell — sidebar, header, page frame |
| `styles/ui.css` | reusable primitives — buttons, cards, tables, badges, modals, toasts |
| `styles/pages.css` | page compositions — KPI grid, analytics grid, queues, settings |

### The two moods

Both are warm and share one gold accent, so switching feels like a change of
light rather than a change of product.

| | Day | Night |
|---|---|---|
| Ground | `#efe9e0` warm sand | `#16130f` warm charcoal |
| Cards | `#fbf9f5` off-white | `#2b241c` |
| Ink | `#2a2521` espresso | `#ece7e0` |
| Accent | `#c08a4a` | `#d4a574` |
| Sidebar | `#ffffff` + hairline border | `#0f0d0b` |

The sidebar flips with the mood, so every token that lands on it flips too —
including the gold, which has to be `#8a5f22` to stay legible on white but
`#d4a574` on near-black, and the focus ring, which the night sidebar overrides
locally. `--sidebar-mark` is a separate token from `--sidebar-accent` because the
logo chip is a *fill* and the wordmark is *text*: they need different golds.

Surfaces step evenly in perceptual lightness (L\* 92.6 → 95.3 → 98.0 by day,
6.1 → 10.1 → 14.7 → 20.3 by night), so cards read as layers rather than as
outlines. Shadows are brown-black, not neutral, so they warm what they fall on.

### Key tokens

```
--bg-primary / --bg-secondary / --bg-elevated / --bg-muted   surfaces
--text-primary / --text-secondary / --text-tertiary          ink, three AA levels
--border-color / --border-light / --border-strong            lines
--input-bg / --input-border / --input-focus / --ring         controls
--focus-ring                                                 keyboard focus outline
--accent / --accent-hover / --accent-ink / --accent-on        the gold, by job
--sidebar-accent / --sidebar-text / --sidebar-text-dim       always on a dark ground
--status-success / -warning / -danger / -info / -neutral     fills, dots, chart marks
--status-*-ink                                               the same states as text
--danger-solid                                               destructive button ground
--shadow-sm / -md / -lg                                      depth
--sidebar-width / --header-height / --content-padding        responsive metrics
--chart-bar / --chart-bar-hi / --chart-grid / --chart-axis   data-viz
--pay-bkash / --pay-nagad / --pay-rocket / --pay-card        payment methods
```

Two rules keep the palette honest:

1. **Never hardcode a colour.** New ones get a token in both `:root` and `.dark-theme`.
2. **Vivid vs ink.** `--status-success` and friends are for fills, dots and chart
   marks. Anything that renders as *text* takes the matching `--status-*-ink`,
   because the vivid hue sits at roughly 2.3:1 on its own tint — invisible as a
   label. The same split is why the accent has `--accent` (fills) and
   `--accent-ink` (gold text on a light ground).

## Theming

- `ThemeProvider` resolves the theme from `localStorage['theme-preference']`,
  falling back to `prefers-color-scheme`.
- An inline script in `index.html` stamps the theme class on `<html>` **before**
  React mounts, so there is no flash of the wrong ground on load.
- The class is applied synchronously in the event handler that changes it, which
  is why `useChartTheme` can read resolved token values during render — SVG
  presentation attributes do not resolve `var()`, so Recharts is handed concrete
  colours.
- Until the admin makes an explicit choice, the app keeps following the OS live.
  After a choice, that choice wins.

The toggle sits in the header, top-right, on every page.

## Responsive behaviour

Mobile-first. Breakpoints live in `constants/breakpoints.ts` and mirror the media
queries in `theme.css` — change both together.

> **Keep the token block on plain `:root`.** Writing `:root, :root.light-theme`
> raises it to specificity (0,2,0) once the light-theme class is on `<html>`,
> which outranks the `:root` media queries that carry `--content-padding`,
> `--header-height`, `--avatar-size` and `--chart-height`. Day mode then keeps
> the mobile metrics at every width and switching to night snaps them all to
> desktop at once — which looks exactly like the page zooming.

| Width | Sidebar | Grid | Tables |
|---|---|---|---|
| < 480px | off-canvas drawer | 1 column | stacked cards |
| 480–767px | off-canvas drawer | 2 columns | stacked cards |
| 768–1023px | 4.5rem icon rail | 2 columns | scrollable table |
| 1024–1279px | 15rem, collapsible | 3 columns | scrollable table |
| ≥ 1280px | 15rem, collapsible | 6 KPI columns | full table |

`DataTable` renders the same dataset two ways — a scrollable table from 768px up
and a stack of labelled cards below it — so no column is ever hidden from a
phone. Interactive targets are at least 44×44px on touch widths, and the sidebar
collapse state persists in `localStorage`.

## Accessibility

- **Every rendered text style in both moods meets WCAG AA** — verified by walking
  the live DOM, compositing translucent backgrounds, and applying the large-text
  allowance where it is due. `scripts` for this live in the session scratchpad;
  re-run one after any palette change.
- Status is never colour alone: every badge carries its written label, and trend
  indicators carry a direction arrow.
- The focus ring has its own token because no single colour clears 3:1 against
  both the day ground and the dark sidebar; the sidebar overrides it locally.
- The categorical chart palette is validated for colour-vision deficiency in both
  themes — this is why "Card" is cyan rather than blue, which collides with
  Rocket's purple under deuteranopia.
- Modals and side panels trap focus, close on `Escape` and on backdrop click, and
  lock background scroll.
- Tables expose `aria-sort`; filters, toggles and icon buttons are all labelled.
- `prefers-reduced-motion` disables transitions and animations.

## Working with the mock data

`mockData/base.ts` seeds a small PRNG from a fixed number, so two loads produce
the same dashboard — useful when comparing screenshots. Dates are generated
relative to load time, so the demo never goes stale.

Store actions mirror what a real API would do: approving a booking also writes an
SMS record into the notifications log, and every mutation appends to the audit
log with before/after values. Toasts are fired from the store, not from pages.
