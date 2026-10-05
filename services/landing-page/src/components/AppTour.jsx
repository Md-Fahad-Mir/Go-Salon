import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, CalendarClock, Gem, Languages, LayoutGrid, Smartphone, Sparkles, Store, SunMoon } from "lucide-react";
import PhoneFrame from "./ui/PhoneFrame";
import Reveal from "./ui/Reveal";
import SectionIntro from "./ui/SectionIntro";
import { screen } from "../assets/screens";

const TABS = [
  {
    key: "tryon-home",
    icon: Sparkles,
    title: "Try on",
    body: "Your credits for the month, a before-and-after to drag, and the whole style catalogue — one tab from anywhere in the app.",
  },
  {
    key: "tryon-select",
    icon: LayoutGrid,
    title: "Style catalogue",
    body: "Search looks curated by the Go Salon team and filter by occasion, from a sharp skin fade to soft, textured layers.",
  },
  {
    key: "salon-home",
    icon: Store,
    title: "Your salon",
    body: "Scan your salon’s QR code once and it lives on Home: cover photos, opening hours, the full menu, the team and a Book button.",
  },
  {
    key: "booking-datetime",
    icon: CalendarClock,
    title: "Live booking",
    body: "Pick your services, choose a stylist or anyone available, and take a slot straight from the salon’s own diary.",
  },
  {
    key: "plans",
    icon: Gem,
    title: "Plans & credits",
    body: "See how many try-ons are left this month and what each plan includes. Credits start over on the 1st.",
  },
];

const PWA_POINTS = [
  { icon: Smartphone, title: "No app store needed", body: "Open it in your browser and add it to your home screen." },
  { icon: Languages, title: "English & বাংলা", body: "Every screen in both, with Bengali numerals in Bangla." },
  { icon: SunMoon, title: "Light or dark", body: "Cashmere by day, obsidian by night — one gold in both." },
  { icon: BellRing, title: "Updates as they happen", body: "Confirmed, changed or turned down — you hear straight away." },
];

const AUTO_ADVANCE_MS = 6000;

const AppTour = () => {
  const tabs = TABS.map((t) => ({ ...t, shot: screen(t.key, "light") })).filter((t) => t.shot);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || tabs.length < 2) return;
    const id = setTimeout(() => setActive((i) => (i + 1) % tabs.length), AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
  }, [active, paused, tabs.length]);

  const choose = (i) => {
    setActive(i);
    setPaused(true);
  };

  const current = tabs[active];

  return (
    <section id="tour" className="relative overflow-hidden bg-cashmere py-24 text-ink sm:py-32">
      <div className="pointer-events-none absolute right-[-20%] top-[-10%] h-[50rem] w-[50rem] rounded-full bg-[radial-gradient(closest-side,rgba(210,164,104,0.18),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <SectionIntro
          tone="light"
          eyebrow="Inside the app"
          title={
            <>
              One app, from <span className="text-gilded-deep font-normal italic">mirror</span> to
              chair.
            </>
          }
        >
          Try a look, open your salon, book the slot — without leaving the app or downloading
          anything. Real Go Salon screens, shown here with sample data.
        </SectionIntro>

        {current && (
          <div className="mt-16 grid items-center gap-12 lg:mt-20 lg:grid-cols-[1fr_1fr] lg:gap-20">
            {/* Tabs. min-w-0 so the scrolling chip row cannot widen the grid track. */}
            <div className="order-2 min-w-0 lg:order-1">
              <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 lg:hidden" role="tablist">
                {tabs.map((t, i) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={i === active}
                    onClick={() => choose(i)}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                      i === active
                        ? "border-gold-deep bg-ink text-ivory"
                        : "border-gold-deep/25 bg-linen text-ink-soft"
                    }`}
                  >
                    <t.icon size={15} /> {t.title}
                  </button>
                ))}
              </div>
              <p className="mt-5 text-center text-[1.02rem] leading-relaxed text-ink-soft lg:hidden">{current.body}</p>

              <ul className="hidden flex-col gap-2 lg:flex" role="tablist">
                {tabs.map((t, i) => {
                  const on = i === active;
                  return (
                    <li key={t.key}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => choose(i)}
                        className={`relative w-full overflow-hidden rounded-3xl border p-6 text-left transition-all duration-500 ${
                          on
                            ? "border-gold-deep/30 bg-linen shadow-[0_24px_60px_-30px_rgba(122,83,26,0.45)]"
                            : "border-transparent hover:bg-linen/60"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <span
                            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-colors ${
                              on ? "btn-satin" : "border border-gold-deep/25 text-gold-ink"
                            }`}
                          >
                            <t.icon size={19} />
                          </span>
                          <span className={`text-xl ${on ? "font-medium text-ink" : "text-ink-soft"}`}>{t.title}</span>
                        </div>
                        <AnimatePresence initial={false}>
                          {on && (
                            <motion.p
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.4 }}
                              className="overflow-hidden pl-[3.75rem] pt-2 text-[1rem] leading-relaxed text-ink-soft"
                            >
                              {t.body}
                            </motion.p>
                          )}
                        </AnimatePresence>
                        {on && !paused && (
                          <motion.span
                            key={`bar-${active}`}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: AUTO_ADVANCE_MS / 1000, ease: "linear" }}
                            className="absolute bottom-0 left-0 h-[2px] w-full origin-left bg-gold-deep/70"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Phone */}
            <Reveal className="order-1 lg:order-2">
              <div className="relative mx-auto w-full max-w-[22rem]">
                <div className="absolute -inset-x-10 bottom-[-4%] top-[8%] rounded-t-[14rem] rounded-b-[3rem] bg-sand" />
                <div className="absolute -inset-x-6 bottom-[-2%] top-[11%] rounded-t-[13rem] rounded-b-[2.5rem] border border-gold-deep/25" />
                <div className="relative mx-auto w-[78%]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={current.key}
                      initial={{ opacity: 0, y: 24, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -16, scale: 0.98 }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <PhoneFrame
                        src={current.shot.src}
                        theme={current.shot.theme}
                        alt={`Go Salon app — ${current.title}`}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </Reveal>
          </div>
        )}

        {/* The PWA itself */}
        <div className="mt-24 grid gap-px overflow-hidden rounded-[2rem] border border-gold-deep/20 bg-gold-deep/20 sm:grid-cols-2 lg:grid-cols-4">
          {PWA_POINTS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="bg-linen p-7">
              <Reveal delay={i * 0.08}>
                <Icon size={22} className="mb-4 text-gold-deep" />
                <h3 className="text-lg font-medium text-ink">{title}</h3>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink-soft">{body}</p>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AppTour;
