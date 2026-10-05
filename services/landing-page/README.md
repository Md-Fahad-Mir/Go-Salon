# Go Salon — landing page

The marketing site for **Go Salon**: *see the cut before the cut.* It introduces the AI 360° hairstyle try-on, booking, the tools for salons and barbers, and the subscription plans. Every call to action links into the Go Salon PWA (`services/frontend`).

Built with React 19, Vite, Tailwind CSS v4 and Framer Motion.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static site in dist/
npm run lint
```

Docker: the `Dockerfile` builds the site and serves it with Nginx on port 3000.

## Configuration

Copy `.env.example` to `.env`.

| Variable | Purpose |
| --- | --- |
| `VITE_APP_URL` | Base URL of the PWA. Sign-up, sign-in and salon registration links point here. Defaults to `https://app.gosalon.com`. |
| `VITE_API_BASE_URL` | Optional Django API base, e.g. `https://api.gosalon.com/api`. When it is set, Pricing reads live plans from the public `GET /subscription-tiers/`. The API must allow this site's origin in `CORS_ALLOWED_ORIGINS`. Without it, the page shows the seeded Free / Basic / Advanced plans. |

## Where things live

```
src/
  App.jsx              section order
  constants.js         app links, support email, seeded plans, FAQ, service categories
  hooks/useTiers.js    live subscription tiers, with a seeded fallback
  assets/screens/      real PWA screenshots, named <screen>-<dark|light>.jpg (390×844)
  assets/screens.js    looks screenshots up by name and theme
  components/          Navbar, Hero, ServiceMarquee, TryOnSpotlight, AppTour,
                       Booking, ForSalons, Pricing, Faq, FinalCta, Footer
  components/ui/       BrandMark (the shears logo), PhoneFrame, SectionIntro, Reveal
public/
  favicon.svg, icons/  Go Salon brand icons (same as the PWA)
  media/               the welcome film and its poster, from the PWA
```

The colours, the Jost typeface and the shears mark match the PWA's `src/styles/theme.css` and `BrandMark.tsx`. If those change, update `src/index.css` and `components/ui/BrandMark.jsx` to match.

Product copy is taken from the PWA's English strings (`services/frontend/src/i18n/en`), so the site and the app describe the product the same way.
