import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarCheck, Languages, PlayCircle, RotateCw, Sparkles, Wallet } from "lucide-react";
import { LINKS } from "../constants";

const ease = [0.22, 1, 0.36, 1];

const rise = (delay) => ({
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, ease, delay },
});

const TRUST = [
  { icon: RotateCw, label: "Front, side & back" },
  { icon: Wallet, label: "Pay at the salon" },
  { icon: Languages, label: "English & বাংলা" },
];

const HIGHLIGHTS = [
  { value: "360°", label: "A turnaround video of you in the new style" },
  { value: "3 free", label: "AI try-ons every month on the Free plan" },
  { value: "৳0", label: "Taken up front — you pay at the salon" },
  { value: "1 tap", label: "From the look you love to the chair that can cut it" },
];

const GlassChip = ({ icon: Icon, title, sub, className, delay }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9, y: 16 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ duration: 0.8, ease, delay }}
    className={`absolute z-30 flex items-center gap-3 rounded-2xl border border-gold/25 bg-obsidian/60 px-4 py-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl ${className}`}
  >
    <span className="btn-satin grid h-9 w-9 shrink-0 place-items-center rounded-xl">
      <Icon size={17} />
    </span>
    <span className="leading-tight">
      <span className="block text-[0.92rem] font-medium text-ivory">{title}</span>
      <span className="block text-[0.78rem] text-ivory-soft">{sub}</span>
    </span>
  </motion.div>
);

const Hero = () => {
  const reduceMotion = useReducedMotion();

  return (
    <section id="top" className="grain relative isolate overflow-hidden bg-onyx pt-[4.5rem]">
      {/* Gold light, as from the backlit mirrors in the welcome film */}
      <div className="pointer-events-none absolute -top-40 right-[-10%] -z-10 h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(closest-side,rgba(224,176,120,0.22),transparent)]" />
      <div className="pointer-events-none absolute bottom-[-20%] left-[-15%] -z-10 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(closest-side,rgba(184,134,70,0.16),transparent)]" />

      <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-24 lg:pt-20">
        {/* Copy */}
        <div className="relative z-10 text-center lg:text-left">
          <motion.p
            {...rise(0.1)}
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/[0.06] px-4 py-1.5 text-[0.78rem] font-medium uppercase tracking-[0.18em] text-gold sm:tracking-[0.22em]"
          >
            <Sparkles size={14} /> AI hairstyle try-on
            <span className="hidden sm:inline">· Made for Dhaka</span>
          </motion.p>

          <motion.h1
            {...rise(0.2)}
            className="text-[3.3rem] font-light leading-[0.98] tracking-[-0.035em] text-ivory sm:text-7xl xl:text-[5.6rem]"
          >
            See the cut
            <br />
            <span className="text-gilded font-normal italic">before</span> the cut.
          </motion.h1>

          <motion.p
            {...rise(0.35)}
            className="mx-auto mt-7 max-w-xl text-[1.08rem] leading-relaxed text-ivory-soft sm:text-xl lg:mx-0"
          >
            Try any hairstyle on your own photo, then watch yourself turn a full 360° in it. Love
            it? Book the chair that can do it — all in one app.
          </motion.p>

          <motion.div
            {...rise(0.5)}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start"
          >
            <a
              href={LINKS.customerSignUp}
              className="btn-satin group inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-4 text-[1.05rem] font-medium transition-transform hover:-translate-y-0.5 sm:w-auto"
            >
              Try it free
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#try-on"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-ivory/15 px-7 py-4 text-[1.05rem] text-ivory transition-colors hover:border-gold/50 hover:text-gold sm:w-auto"
            >
              <PlayCircle size={19} /> See how it works
            </a>
          </motion.div>

          <motion.p {...rise(0.6)} className="mt-5 text-sm text-taupe">
            3 free 360° try-ons every month · No app store needed
          </motion.p>

          <motion.ul
            {...rise(0.7)}
            className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 lg:justify-start"
          >
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-[0.95rem] text-ivory-soft">
                <Icon size={16} className="text-gold" /> {label}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* Visual: the welcome film in a salon-mirror arch, the app beside it */}
        <div className="relative mx-auto w-full max-w-[34rem] lg:max-w-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease, delay: 0.2 }}
            className="relative ml-auto w-[88%] sm:w-[80%]"
          >
            <div className="absolute -inset-3 rounded-t-[16rem] rounded-b-[2.6rem] border border-gold/25" />
            <div className="relative aspect-[6/7] overflow-hidden rounded-t-[15rem] rounded-b-[2rem] bg-umber shadow-[0_50px_120px_-40px_rgba(224,176,120,0.35)]">
              <video
                className="absolute inset-0 h-full w-full object-cover"
                src="/media/welcome-hairstyle.mp4"
                poster="/media/welcome-hairstyle-poster.jpg"
                autoPlay={!reduceMotion}
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="A client in the chair at an upscale salon, before and after the cut"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-onyx/70 via-transparent to-transparent" />
            </div>
          </motion.div>

          <GlassChip
            icon={RotateCw}
            title="360° turnaround"
            sub="Front · side · back"
            delay={1}
            className="right-0 top-[14%] sm:-right-4"
          />
          <GlassChip
            icon={CalendarCheck}
            title="Book this look"
            sub="Live slots, pay at the salon"
            delay={1.2}
            className="bottom-[9%] right-0 hidden sm:flex"
          />
        </div>
      </div>

      {/* Highlights */}
      <div className="relative border-y border-gold/10 bg-onyx">
        {/* gap-px over a gold ground draws the hairlines between cells */}
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-gold/10 lg:grid-cols-4">
          {HIGHLIGHTS.map((item, i) => (
            <li key={item.value} className="bg-onyx px-5 py-8 sm:px-8 lg:py-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease, delay: i * 0.1 }}
              >
                <p className="text-gilded text-4xl font-light tracking-tight lg:text-5xl">{item.value}</p>
                <p className="mt-2 max-w-[15rem] text-[0.92rem] leading-snug text-ivory-soft">{item.label}</p>
              </motion.div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default Hero;
