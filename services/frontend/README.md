# Eureka Hair App — customer PWA

The mobile app Eureka customers use: try a hairstyle on your own photo, then
book the chair that can do it. Dhaka-first, dark theme, installable.

**The AI try-on is real; everything else is still mock.** `api.tryOn` calls the
FastAPI service in `services/ai` over HTTP — one vision call to read the photo,
one image edit to render the chosen style onto it. Every other record is seeded
from `src/mockData/`, mutated in Zustand stores and persisted on the device —
`localStorage` for records and IndexedDB for photos. `src/utils/api.ts` is the
seam: the remaining mock bodies have the shape of a real API (async, realistic
delays, typed errors), so swapping them for `fetch` calls is the only change the
screens should need.

## Getting started

```bash
node -v          # 20.19+ or 22.12+ (Vite 8)
npm install
cp .env.example .env   # relative API paths; nothing to edit for local work
npm run dev      # http://localhost:5174 — and on your phone, http://<mac-ip>:5174
npm run build    # tsc -b && vite build
npm run preview  # serves the build — needed to exercise the service worker
npm run lint
npm run typecheck
npm run check:i18n   # English and Bangla dictionaries agree
npm run verify       # typecheck, lint, i18n and the tests
```

`npm run dev` listens on every interface, so the app is reachable from a phone
on the same wifi at the Mac's own address (`ipconfig getifaddr en0`).

**No API host is configured anywhere.** `VITE_API_BASE_URL` is the relative
path `/api`, and `vite.config.ts` proxies `/api`, `/ws` and `/ai` to Django and
the AI service. The browser therefore asks whatever origin served the page,
which is the only host that is guaranteed to be reachable from the device
running it — a phone cannot reach the Mac's `localhost`, and a LAN address
baked into client config goes stale the next time DHCP hands out a different
one. Start Django with `runserver 0.0.0.0:8000` so the proxy can reach it.

The proxy is dev-server-only: `vite build` ignores `server`, so a deployment
still uses whatever `VITE_API_BASE_URL` it is built with.

The try-on needs the AI service running alongside it:

```bash
cd ../ai && cp .env.example .env   # add a real OPENROUTER_API_KEY
uv sync && python main.py          # http://localhost:8001
```

Nothing to point at it: `VITE_AI_API_URL` is the relative `/ai`, which
`vite.config.ts` proxies to port 8001 — so the try-on flow works from a phone
for the same reason the API does. Without the service running, the try-on
screens show "The AI service could not be reached"; the rest of the app is
unaffected.

The app is designed for 320–480px. On a wider screen it stays a centred phone
column rather than stretching into a layout it was never drawn for.

### Signing in

Any Bangladeshi mobile number works and the OTP is always `123456`.

| Number | What you get |
|---|---|
| `01700 000000` | Ahmed Hassan — a returning customer with bookings, reviews and notifications |
| any other | The registration flow, then an empty account with 3 free try-on credits |

Both constants live in `src/constants/index.ts` (`DEMO_PHONE`, `DEMO_OTP`).
Settings → Demo has a switch that makes the next payment fail, and a reset that
wipes the device state.

## Stack

| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript (strict, no `any`) |
| Build | Vite 8 |
| Routing | React Router 7, one lazy bundle per screen |
| State | Zustand 5 with `persist` |
| Dates | date-fns 4 |
| Icons | lucide-react |
| Styling | Plain CSS with custom properties |
| Languages | English + Bangla, hand-rolled (no i18n library) |
| Images | Canvas — resize, crop, compress and the mock try-on render |
| Offline | Hand-written service worker (`public/sw.js`) |

No UI kit, no CSS framework, no HTTP client. Everything the app draws is in this
repository.

## Layout of the source

```
src/
  components/
    layout/     AppFrame, Screen, Header, BottomNavigation, StickyFooter
    common/     Button, Input, PhoneInput, OTPInput, Card, Modal, BottomSheet,
                ActionSheet, Calendar, TimeSlots, Carousel, Art, Rating,
                HairstyleCard, EmptyState, Toaster, …
    auth/ home/ booking/ ai-tryon/ profile/   screen-specific pieces
    ErrorBoundary.tsx, RouteGuards.tsx, ScrollToTop.tsx
  pages/        one file per route (auth/, booking/, tryon/, profile/)
  hooks/        useAuth, useBooking, useCamera, useGeolocation,
                usePhotoUrl, useCountdown, useOnline, useUi
  store/        useAppStore (session + account data), useBookingStore (wizard
                draft), useTryOnStore (try-on session)
  mockData/     hairstyles, professionals + staff + services, reviews, bookings,
                notifications, slots
  utils/        api (the mock seam), format, validators, geo, image, storage,
                share, recommend, cn, id
  styles/       theme, base, layout, ui, auth, home, booking, tryon, profile
  types/        the domain model
```

## Styling: tokens, not a utility framework

The UI is a small token-driven stylesheet split by concern. Every colour in the
app resolves through a custom property defined in `styles/theme.css`, so the
palette is changed in one place.

| File | Holds |
|---|---|
| `theme.css` | the tokens — surfaces, ink, lines, accent, status, payment brands, art, depth, motion, radii, metrics |
| `base.css` | reset, typography, focus rings, text and layout utilities |
| `layout.css` | app frame, screen, header, bottom navigation, sticky footer, toasts |
| `ui.css` | primitives — buttons, inputs, cards, chips, badges, sheets, calendar, slots, carousel |
| `auth/home/booking/tryon/profile.css` | screen compositions, each prefixed to its area |

### The two moods

Both are warm and share one gold, so switching feels like a change of light
rather than a change of product.

**Day — warm cashmere and champagne gold.** An alabaster ground, satin cards
that lift off it, espresso ink, and a jewellery-finish accent.

**Night — obsidian and radiant gold.** A warm charcoal ground that never goes
cold black, espresso-slate cards, pearl ink, and gold-tinted hairlines that give
the dark surfaces a rim of warm light.

| | Day | Night |
|---|---|---|
| Ground | `#f4efe8` cashmere | `#12100e` obsidian |
| Cards | `#fcfbf8` satin | `#1e1a16` espresso-slate |
| Elevated | `#ffffff` | `#27221c` |
| Ink | `#1c1917` espresso | `#f4efea` pearl |
| Accent | `#b88646` champagne | `#e0b078` luminous |
| Accent ink | `#7a531a` | `#e8be8e` |
| Hairlines | `rgba(184,165,138,.44)` | `rgba(224,176,120,.15)` gold-tinted |

Three things carry the depth, and none of them touch layout:

- **Shadows come in two layers** — a tight contact shadow that anchors an edge,
  and a wide ambient one that lifts the surface. They are brown-black rather
  than neutral, so they warm what they fall on instead of greying it.
- **Cards carry an inset hairline of light** along the top edge, the same trick
  a physical bevel plays. It costs no layout because it is `inset`.
- **The app column has a fixed radial bloom** at the top, barely perceptible on
  its own, which stops the ground reading as one flat slab behind a long scroll.

Status colours are botanical rather than traffic-light — sage, honey, wine — and
the payment brands are deepened from their own neon so they sit beside the gold
without shouting over it.

`ThemeProvider` resolves the mood from `localStorage`, falling back to
`prefers-color-scheme`, and an inline script in `index.html` stamps the class on
`<html>` **before** React mounts so there is no flash of the wrong ground. Until
the user picks a side the app keeps following the OS; after that, their choice
wins. The control lives in Settings.

### Tokens that deliberately do not flip

`--media-*` and `--scrim-*` colour things drawn **on top of a photo**: the
gradient under a caption, a chip in the corner of a cover, the camera's face
guide. A photograph is dark-ish whatever the app is wearing, so that ink stays
light and those scrims stay dark in both moods. Without this split, captions
over cover art would turn espresso-on-dark in the day mood and vanish.

Every rendered text style in both moods meets WCAG AA, verified by walking the
live DOM, compositing translucent backgrounds and gradient scrims, and applying
the large-text allowance where it is due. Re-run that audit after any palette
change.

Two rules keep the palette honest:

1. **Never hardcode a colour.** New ones get a token.
2. **Vivid vs ink.** `--status-success` and friends are for fills, dots and
   icons. Anything that renders as *text* takes the matching `--status-*-ink`,
   because the vivid hue sits at roughly 2.3:1 on its own tint. The same split is
   why the accent has `--accent` (fills) and `--accent-ink` (gold as text).

### Photos

There are no photographs in the repository. `<Art>` draws the design kit's
placeholder — a warm brown block with a fine diagonal hatch, in six tones so a
grid does not read as one slab — and takes a `src` the day real images arrive.
The only real images the app ever shows are the ones the customer supplies: a
profile photo and try-on shots.

## How the mock layer behaves

What is left of it: takings and earnings, the `in_chair` / `no_show` chair-side
workflow, the lookbook, client hair histories, reviews and the hairstyle
catalogue. Availability, bookings, profiles, staff, hours, the price list and
the customer-facing directory all come from the backend now.

- **Salons behave differently.** Some confirm instantly, others approve by hand.
  That is `auto_accept` on the real salon or barber record, and it changes the
  booking's status, its copy, and the text the customer is sent.
- **Nothing is charged.** The app is pay-at-salon end to end; there is no
  payment backend and no payment step in the wizard.
- **Dates are relative to load time**, so what is left of the demo data never
  goes stale.
- **The try-on is not mocked at all.** `StyleSelectPage` sends the photo to
  `POST /analyze` on mount, renders the hairstyles that come back, and sends the
  one the customer picks to `POST /generate`. The result is a real AI edit of
  their own photo, stored as a Blob in IndexedDB. The processing screen ticks a
  step only when that request has actually returned — no timed animation.

## State and persistence

`useAppStore` holds the session and everything belonging to the signed-in
account: bookings, generations, reviews, notifications, payment accounts and
preferences. It also holds the salons the customer has joined, which is server
state rather than demo data. Signing out parks that data in an `archive` keyed by
user id and restores it when the same number signs back in, so the demo behaves
like an account without a server.

The booking wizard's draft lives in `useBookingStore` (session storage — a draft
should not outlive the tab), and the try-on session in `useTryOnStore`. Photos
never touch `localStorage`: `utils/storage.ts` puts them in IndexedDB and falls
back to an in-memory map when IndexedDB is blocked, so a private window still
works for the session.

### The directory cache

`useDirectoryStore` keeps every salon this device has seen, so a saved card or
a booking from last week can render its salon's name without a request. It is a
cache and has to be treated as one, in two ways that are easy to get wrong.

**Read it, then refresh it.** Screens that show a listing paint from the cache
and re-fetch underneath — always, not only when the cache is empty. Opening
hours, the menu and the roster all change, and a copy with no expiry and no
revalidation is not a cache but a copy that quietly stops being true. Fetching
only on a miss is what once left a salon unbookable after its owner fixed its
hours: the device had seen it once, so it kept that week forever.

**Version it when the shape changes.** `version` on the persist options exists
for exactly that; bump it and old blobs are discarded. A listing written by an
older build is not one this build can read, and the failure is silent — when
chairs gained an `hours` field, every cache written before it read as "this
chair has no week", which the calendar drew as a month of dead dates with
nothing to explain them.

### Live booking updates

`RealtimeProvider` holds one WebSocket open for as long as somebody is signed
in — following the *session*, not the screen, because an owner who is on their
price list when a booking comes in should still hear about it. Events land in
`useProviderStore.appointments` for a business and in `useAppStore.bookings`
for a customer; the screens already read those, so nothing re-renders by hand.

REST stays the source of truth. A socket only says "this row changed, here it
is", so the worst a broken one can do is make a screen late, never wrong — and
every recovery ends in a re-read rather than a guess. After a reconnection, a
tab waking from sleep, or a laptop finding wifi, `resyncBookings()` asks the
server again instead of trying to patch a gap it cannot see. `useRealtimeStatus`
drives the **Live / Reconnecting** pill on the two queue screens, because on a
quiet morning an empty list and a dead connection look identical.

The token goes in the handshake subprotocol rather than the URL; `4401` means
the token is stale rather than the network dropped. `src/utils/realtimeClient.ts`
handles the backoff, the jitter and the ping/pong that catches a socket an idle
proxy has quietly killed.

## PWA

`public/manifest.webmanifest` plus `public/sw.js`, registered from `main.tsx`
**in production builds only** so the worker never caches Vite's dev modules.

On install it precaches the shell and then every hashed chunk, which it reads
from Vite's build manifest (`build.manifest` is on for exactly this reason);
parsing `index.html` is the fallback. Precaching the chunks is not optional: the
entry bundle is requested before the worker controls the page, so without it a
later offline reload renders a blank screen. After that, navigations are
network-first with the cached shell as the fallback, `/assets/` is cache-first,
and everything else is stale-while-revalidate.

Every cache lookup passes `ignoreVary: true`. The server answers with
`Vary: Origin`, and a module-script request does not carry the same headers as
the plain request used to precache it, so without this every asset would miss.
The hash in each filename already makes those responses unique.

Bump `CACHE` in the worker whenever the shell list or the caching rules change.
An offline banner appears at the top of the frame when the device drops off the
network.

To test it: `npm run build && npm run preview`, then throttle to offline in
DevTools and reload.

## Languages

The app reads fully in **English and Bangla**. There is no i18n library: the
whole thing is about 120 lines in `src/i18n/`.

- `src/i18n/en/` is the source of truth, split into six slices (`common`,
  `auth`, `home`, `booking`, `tryon`, `profile`) so areas do not collide.
- `src/i18n/bn/` is typed against the English shape, so **a missing translation
  is a compile error**, not a blank screen.
- `useT()` gives you `t('home.greeting', { name })`. Placeholders look like
  `{name}`. Plurals ship as `key_one` / `key_other` and are selected by passing
  `count`; the bare key is derived into the key type so call sites type-check.
- `npm run check:i18n` catches what types cannot: a value left in English, a
  placeholder lost in translation, an orphaned plural, a dead Bangla key.

The picker is in Settings, and a phone set to Bangla gets Bangla on first launch.

### Formatting follows the language

`utils/locale.ts` holds the active language as module state, because the
formatting helpers are plain functions called from everywhere rather than
components. `utils/format.ts` reads it, so dates, month and weekday names,
durations, distances and relative times all translate — and Bangla renders
Bengali numerals, because that is what a Dhaka reader expects on a price:
৳১,২৩৪, ৪.৮, ৭০৮ মি, ১.২ কিমি. date-fns translates the words but always emits
Western digits, so the helpers map the numerals across afterwards.

### What stays in English

Mock data is content, not chrome. Salon and staff names, service and hairstyle
names, review text and addresses stay as they are — Dhaka salons genuinely
advertise "Skin fade", these are proper nouns, and in a real deployment they
would arrive from a backend already written by the salon.

### Register

The Bangla is what a salon receptionist would actually say: warm, plain, the
polite-familiar আপনি, and the loanwords Dhaka really uses (স্যালন, বুকিং,
ক্রেডিট, রিভিউ). Not formal or literary Bangla. Bangla also runs longer than
English, so `[data-lang='bn']` gives the script a little more leading, and any
label that would wrap gets shortened rather than clipped.

## Accessibility

- Interactive targets are at least 44×44px; inputs use a 16px font so iOS does
  not zoom the page on focus.
- Status is never colour alone — every badge carries its written label.
- The focus ring is never removed, modals and sheets trap focus, close on
  `Escape` and on a backdrop click, and lock background scroll.
- Icon-only buttons are labelled; tabs, toggles and filter chips carry
  `aria-selected` / `aria-pressed`.
- `prefers-reduced-motion` disables transitions and animations.
- Every interactive target is at least 44×44px. A few compact controls keep a
  smaller drawn box but claim a full-height hit area with an absolutely
  positioned `::before`, which was verified by tapping outside the visible edge.
- Safe-area insets are honoured, so the bottom navigation clears the home
  indicator on a notched phone.

## Conventions

- Screens are `<Screen>` → `<Header>` → `<ScreenBody>` → optional
  `<StickyFooter>`. `nav` on `Screen` adds the tab bar and pads for it.
- Routes come from `ROUTES` in `src/constants`; the parameterised ones are
  functions.
- Never call `setState` synchronously inside a `useEffect` body — the lint rule
  is on, and the fix is usually to key an async result by its request instead.
- Toasts are fired from the store (`toast(tone, title, message?)`), not passed
  down as props.
