import React from "react";
import { motion } from "framer-motion";
import {
  CalendarHeart,
  Camera,
  Columns2,
  LayoutGrid,
  RotateCw,
  ScanFace,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import PhoneFrame from "./ui/PhoneFrame";
import Reveal from "./ui/Reveal";
import SectionIntro from "./ui/SectionIntro";
import { screen } from "../assets/screens";
import { LINKS } from "../constants";

const FEATURES_LEFT = [
  {
    icon: RotateCw,
    title: "A full 360° turn",
    body: "Not a flat filter. A short video of you turning all the way round in the style — front, side, back and front again.",
  },
  {
    icon: ScanFace,
    title: "Still unmistakably you",
    body: "Only the hair changes. Each render is built to keep your face and features as they are in your photo.",
  },
  {
    icon: LayoutGrid,
    title: "A curated catalogue",
    body: "Styles chosen by the Go Salon team, filtered by occasion — casual, formal, wedding, party, business or date night.",
  },
];

const FEATURES_RIGHT = [
  {
    icon: Columns2,
    title: "Before & after",
    body: "Flip between your photo and the new look, and see how far the style is from the hair you have today.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "Your photo stays on your phone and no salon ever sees it. It is sent only to render the style.",
  },
  {
    icon: CalendarHeart,
    title: "Book this look",
    body: "Found the one? Save it, share it, or take it straight to a stylist who can cut it.",
  },
];

const STEPS = [
  {
    icon: Camera,
    title: "Take or pick a clear selfie",
    body: "Front camera with an oval face guide, or any photo from your gallery.",
  },
  {
    icon: WandSparkles,
    title: "Choose a style — we turn you all the way round in it",
    body: "Your 360° video is ready in a minute or two.",
  },
  {
    icon: CalendarHeart,
    title: "Like it? Book a pro who does it",
    body: "Your salon’s menu, team and live slots are one tap away.",
  },
];

const ANGLES = [
  { label: "Front", className: "left-[9%] top-[9%]" },
  { label: "Side", className: "right-[9%] top-[9%]" },
  { label: "Back", className: "bottom-[9%] right-[9%]" },
  { label: "Side", className: "bottom-[9%] left-[9%]" },
];

const FeatureCard = ({ icon: Icon, title, body, delay }) => (
  <Reveal delay={delay}>
    <div className="group flex gap-4 rounded-3xl border border-gold/10 bg-umber/60 p-5 transition-colors duration-500 hover:border-gold/30 hover:bg-umber sm:block sm:p-6">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-gold/25 bg-gold/[0.08] text-gold transition-colors group-hover:bg-gold/15 sm:mb-4">
        <Icon size={20} />
      </span>
      <div>
        <h3 className="text-lg font-medium text-ivory">{title}</h3>
        <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ivory-soft sm:mt-2">{body}</p>
      </div>
    </div>
  </Reveal>
);

const TryOnSpotlight = () => {
  const stage = screen("tryon-processing", "dark") ?? screen("tryon-select", "dark");

  return (
    <section id="try-on" className="grain relative isolate overflow-hidden bg-obsidian py-24 sm:py-32">
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[60rem] w-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(224,176,120,0.12),transparent)]" />

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionIntro
          eyebrow="The headline act · AI Try-On"
          title={
            <>
              Your new look,{" "}
              <span className="text-gilded font-normal italic">from every side.</span>
            </>
          }
        >
          Upload one selfie, pick a style, and Go Salon films you turning a full circle in it. A
          short 360° video — so you know how the cut sits at the back before anyone picks up the
          scissors.
        </SectionIntro>

        <div className="mt-20 grid items-center gap-10 lg:grid-cols-[1fr_1.4fr_1fr] lg:gap-8">
          <div className="order-2 grid gap-5 sm:grid-cols-2 lg:order-1 lg:grid-cols-1">
            {FEATURES_LEFT.map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={i * 0.1} />
            ))}
          </div>

          {/* The turnaround: the app at the centre of an orbit marking each angle */}
          <Reveal className="order-1 lg:order-2">
            <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
              <div className="absolute inset-[4%] rounded-full border border-dashed border-gold/25" />
              <div className="absolute inset-[14%] rounded-full border border-gold/10" />
              <div className="animate-orbit absolute inset-[4%]">
                <span className="absolute left-1/2 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_24px_6px_rgba(224,176,120,0.55)]" />
              </div>
              {ANGLES.map((a, i) => (
                <span
                  key={i}
                  className={`absolute z-20 rounded-full border border-gold/25 bg-obsidian/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-gold backdrop-blur ${a.className}`}
                >
                  {a.label}
                </span>
              ))}
              <div className="absolute left-1/2 top-1/2 z-10 w-[46%] -translate-x-1/2 -translate-y-1/2">
                {stage ? (
                  <PhoneFrame src={stage.src} theme={stage.theme} alt="Go Salon making a 360° try-on video" />
                ) : (
                  <div className="grid aspect-[390/891] place-items-center rounded-[2.6rem] border border-gold/20 bg-umber">
                    <RotateCw className="text-gold" size={40} />
                  </div>
                )}
              </div>
            </div>
          </Reveal>

          <div className="order-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            {FEATURES_RIGHT.map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={0.15 + i * 0.1} />
            ))}
          </div>
        </div>

        {/* Three steps */}
        <div className="mt-24">
          <div className="hairline mx-auto mb-14 max-w-5xl" />
          <ol className="mx-auto grid max-w-6xl gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <motion.li
                key={title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.7, delay: i * 0.15 }}
                className="relative flex gap-5"
              >
                <span className="text-gilded text-5xl font-extralight leading-none tracking-tight">
                  0{i + 1}
                </span>
                <div>
                  <Icon size={18} className="mb-3 text-gold" />
                  <h3 className="text-lg font-medium leading-snug text-ivory">{title}</h3>
                  <p className="mt-2 text-[0.95rem] text-ivory-soft">{body}</p>
                </div>
              </motion.li>
            ))}
          </ol>

          <Reveal className="mt-16 flex flex-col items-center gap-5 text-center">
            <a
              href={LINKS.customerSignUp}
              className="btn-satin inline-flex items-center gap-2 rounded-full px-8 py-4 font-medium transition-transform hover:-translate-y-0.5"
            >
              <WandSparkles size={18} /> Try your first look free
            </a>
            <p className="max-w-lg text-sm italic text-taupe">
              Results are previews, not promises — your stylist will tell you what your hair can
              really do.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
};

export default TryOnSpotlight;
