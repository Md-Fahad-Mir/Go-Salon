import React from "react";
import { motion } from "framer-motion";
import { CalendarSync, Check, Crown, Globe, RotateCw, Undo2 } from "lucide-react";
import SectionIntro from "./ui/SectionIntro";
import Reveal from "./ui/Reveal";
import { useTiers } from "../hooks/useTiers";
import { LINKS, upgradeMailto } from "../constants";

const TAGLINES = {
  free: "Find your next look.",
  basic: "For the regulars.",
  advanced: "For the endlessly curious.",
};

const RULES = [
  { icon: RotateCw, text: "One credit = one 360° try-on video" },
  { icon: CalendarSync, text: "Credits start over on the 1st of every month" },
  { icon: Undo2, text: "A try-on that fails gives its credit back" },
];

/** Signs more than one currency writes itself with — "$" alone could be
    any of a dozen dollars, so those currencies keep their code. */
const SHARED_SIGNS = new Set(["$", "£", "¥", "₩", "€"]);

const signIn = (currency, display) => {
  try {
    return (
      new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: display })
        .formatToParts(1)
        .find((part) => part.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
};

/** "$", "€", "CA$" where English has a sign for the currency; its own local
    sign where English only has the code and the sign is a real one of its
    own ("৳", "₦"); the code otherwise ("SGD", "SAR"). Signs added to Unicode
    since 2021 are skipped — most fonts do not have them yet. */
const signOf = (currency) => {
  const sign = signIn(currency, "symbol");
  if (sign !== currency) return sign;
  const local = signIn(currency, "narrowSymbol");
  const usable =
    /\p{Sc}/u.test(local) &&
    !SHARED_SIGNS.has(local) &&
    [...local].every((char) => char.codePointAt(0) < 0x20c0);
  return usable ? local : currency;
};

/** "৳1,200", "$4.99", "SGD 5" — cents only when there are some, and taka
    and rupees grouped the way South Asia writes them (1,00,000). */
const formatPrice = (amount, currency) => {
  const sign = signOf(currency);
  const gap = sign.length > 1 && /[\p{L}.]$/u.test(sign) ? "\u00a0" : "";
  const number = amount.toLocaleString(
    currency === "BDT" || currency === "INR" ? "en-IN" : "en-US",
    Number.isInteger(amount) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );
  return `${sign}${gap}${number}`;
};

const credits = (n) => (n == null ? "Unlimited try-ons" : `${n} try-ons / month`);

const TierCard = ({ tier, index }) => {
  const featured = tier.is_featured;
  const free = tier.price === 0;

  return (
    <motion.li
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: index * 0.12 }}
      className={`relative flex flex-col rounded-[2rem] p-8 transition-transform duration-500 hover:-translate-y-1.5 ${
        featured
          ? "grain overflow-hidden bg-obsidian text-ivory shadow-[0_40px_90px_-40px_rgba(18,16,14,0.9),0_0_0_1px_rgba(224,176,120,0.45)] lg:-my-4 lg:py-12"
          : "border border-gold-deep/20 bg-linen text-ink"
      }`}
    >
      {featured && (
        <>
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(224,176,120,0.3),transparent)]" />
          <span className="btn-satin absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.14em]">
            <Crown size={12} /> Popular
          </span>
        </>
      )}

      <h3 className={`text-[1.35rem] font-medium ${featured ? "text-gold" : "text-gold-ink"}`}>{tier.name}</h3>
      {TAGLINES[tier.slug] && (
        <p className={`mt-1 text-[0.95rem] ${featured ? "text-ivory-soft" : "text-ink-soft"}`}>
          {TAGLINES[tier.slug]}
        </p>
      )}

      <div className="mt-7 flex items-baseline gap-2">
        <span className={`text-6xl font-light tracking-[-0.04em] ${featured ? "text-gilded" : "text-ink"}`}>
          {formatPrice(tier.price, tier.currency)}
        </span>
        <span className={featured ? "text-ivory-soft" : "text-ink-dim"}>/ month</span>
      </div>

      {!free && tier.other_prices.length > 0 && (
        <p className={`mt-2 flex items-start gap-2 text-sm ${featured ? "text-ivory-soft" : "text-ink-dim"}`}>
          <Globe size={14} className="mt-0.5 shrink-0" />
          <span>Also {tier.other_prices.map((price) => formatPrice(price.amount, price.currency)).join(" · ")}</span>
        </p>
      )}

      <p
        className={`mt-5 inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ${
          featured ? "bg-gold/15 text-gold-light" : "bg-gold-deep/10 text-gold-ink"
        }`}
      >
        <RotateCw size={14} /> {credits(tier.monthly_credits)}
      </p>

      <div className={`my-7 h-px ${featured ? "bg-gold/15" : "bg-gold-deep/15"}`} />

      <ul className="flex-1 space-y-3.5">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check size={17} strokeWidth={2.4} className={`mt-0.5 shrink-0 ${featured ? "text-gold" : "text-gold-deep"}`} />
            <span className={`text-[0.98rem] ${featured ? "text-ivory/90" : "text-ink-soft"}`}>{feature}</span>
          </li>
        ))}
      </ul>

      <a
        href={free ? LINKS.customerSignUp : upgradeMailto(tier.name)}
        className={`mt-9 block rounded-full py-3.5 text-center font-medium transition-all hover:-translate-y-0.5 ${
          featured
            ? "btn-satin"
            : free
              ? "bg-ink text-ivory hover:bg-umber"
              : "border border-ink/20 text-ink hover:border-gold-deep hover:text-gold-ink"
        }`}
      >
        {free ? "Start free" : `Get ${tier.name}`}
      </a>
    </motion.li>
  );
};

const Pricing = () => {
  const tiers = useTiers();

  return (
    <section id="pricing" className="relative overflow-hidden bg-cashmere py-24 text-ink sm:py-32">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(210,164,104,0.2),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <SectionIntro
          tone="light"
          eyebrow="Plans"
          title={
            <>
              Start free. <span className="text-gilded-deep font-normal italic">Try on more</span> when
              you’re curious.
            </>
          }
        >
          Every plan can browse salons and book appointments. Plans differ in how many 360° try-ons
          you get each month — billed monthly.
        </SectionIntro>

        <ul className="mx-auto mt-16 grid max-w-6xl items-stretch gap-6 md:grid-cols-[repeat(auto-fit,minmax(0,1fr))] lg:mt-20 lg:gap-8">
          {tiers.map((tier, i) => (
            <TierCard key={tier.slug} tier={tier} index={i} />
          ))}
        </ul>

        <Reveal className="mx-auto mt-14 max-w-5xl">
          <ul className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap sm:gap-x-10">
            {RULES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-[0.95rem] text-ink-soft">
                <Icon size={16} className="text-gold-deep" /> {text}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-sm text-ink-dim">
            Plan changes are made by the Go Salon team — message us and we’ll move you over.
          </p>
        </Reveal>
      </div>
    </section>
  );
};

export default Pricing;
