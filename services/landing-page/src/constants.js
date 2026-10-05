/* Site-wide facts about Go Salon. Copy here mirrors the PWA's own strings
   (services/frontend/src/i18n/en) so the landing page and the app never
   disagree about what the product does. */

const trimSlash = (url) => url.replace(/\/+$/, "");

/** Where the installable PWA lives. */
export const APP_URL = trimSlash(import.meta.env.VITE_APP_URL || "https://app.gosalon.com");

/** The Django API, for live subscription tiers. Optional — the page falls
    back to the seeded plans below when it is unset or unreachable. */
export const API_BASE_URL = trimSlash(import.meta.env.VITE_API_BASE_URL || "");

export const SUPPORT_EMAIL = "support@gosalon.app";

export const LINKS = {
  app: APP_URL,
  signIn: `${APP_URL}/auth/login`,
  customerSignUp: `${APP_URL}/auth/register/customer`,
  salonSignUp: `${APP_URL}/auth/register/salon-owner`,
  barberSignUp: `${APP_URL}/auth/register/barber`,
  support: `mailto:${SUPPORT_EMAIL}`,
};

export const upgradeMailto = (planName) =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Move me to the ${planName} plan`)}`;

export const NAV_LINKS = [
  { label: "AI Try-On", href: "#try-on" },
  { label: "The app", href: "#tour" },
  { label: "Booking", href: "#booking" },
  { label: "For salons", href: "#salons" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

/* Shared service categories seeded by the backend
   (Apps/services/migrations/0002_seed_shared_categories.py). */
export const SERVICE_CATEGORIES = [
  "Haircut",
  "Beard",
  "Styling",
  "Colouring",
  "Treatment",
  "Braiding",
  "Bridal",
  "Holud & wedding",
];

export const DHAKA_AREAS = [
  "Dhanmondi",
  "Gulshan",
  "Banani",
  "Uttara",
  "Mirpur",
  "Bashundhara",
  "Mohammadpur",
  "Old Dhaka",
];

/* The plans as seeded (Apps/subscriptions/migrations/0002_seed_tiers.py and
   0003_tier_monthly_credits.py). Admins can edit tiers from the dashboard, so
   when VITE_API_BASE_URL is set the live list from /subscription-tiers/
   replaces these. */
export const FALLBACK_TIERS = [
  {
    slug: "free",
    name: "Free",
    price_bdt: 0,
    monthly_credits: 3,
    features: ["Browse salons and barbers", "Book appointments", "3 AI try-ons per month"],
    is_featured: false,
    is_default: true,
  },
  {
    slug: "basic",
    name: "Basic",
    price_bdt: 199,
    monthly_credits: 30,
    features: [
      "Everything in Free",
      "30 AI try-ons per month",
      "Priority booking slots",
      "Booking history export",
    ],
    is_featured: false,
    is_default: false,
  },
  {
    slug: "advanced",
    name: "Advanced",
    price_bdt: 499,
    monthly_credits: null,
    features: [
      "Everything in Basic",
      "Unlimited AI hairstyle generation",
      "Highest-resolution renders",
      "Early access to new styles",
    ],
    is_featured: true,
    is_default: false,
  },
];

export const FAQS = [
  {
    q: "How does the AI try-on work?",
    a: "Take a selfie with the front camera or choose a clear, front-facing photo with your hair visible. Pick a style from the catalogue and Go Salon puts it on your photo, then films you turning all the way round in it — front, side, back and round again. It takes a minute or two.",
  },
  {
    q: "What are try-on credits?",
    a: "Every 360° try-on uses one credit. Your plan comes with a set number each month and the Try on tab shows how many are left. Credits start over on the 1st of every month, unused ones don’t carry over, and a try-on that fails gives its credit back.",
  },
  {
    q: "Where does my photo go?",
    a: "The photo you upload stays on your phone. It is not added to your profile and no salon ever sees it. To render a hairstyle it is sent to the service that does the rendering, and used for that and nothing else. Your recent try-ons are stored on the device, and you can clear them all from Settings.",
  },
  {
    q: "Will the cut look exactly like the preview?",
    a: "Results are previews, not promises — your stylist will tell you what your hair can really do. Go Salon also flags how far a style is from the hair you have today, from “Easy from your current hair” to “Challenging”.",
  },
  {
    q: "Do I pay when I book?",
    a: "No. You pay at the salon, so nothing is taken up front. Cancel free of charge up to 2 hours before your appointment (some salons ask for a little more notice), and reschedule for free whenever the salon has an open slot.",
  },
  {
    q: "How do I add my salon?",
    a: "Every salon on Go Salon has a QR code at the counter. Scan it with your phone camera or the in-app scanner and that salon appears on your Home screen — its menu, team, hours and a Book button.",
  },
  {
    q: "Do I need to download anything?",
    a: "No app store needed. Go Salon is a progressive web app: open it in your browser and add it to your home screen, and it opens like any other app. It works in English and বাংলা, in light or dark.",
  },
  {
    q: "How do I change my plan?",
    a: "Plan changes are made by the Go Salon team. Message us and we’ll move you over. Every plan, Free included, can browse salons and book appointments.",
  },
];
