import React from "react";
import { ArrowRight, Store } from "lucide-react";
import Reveal from "./ui/Reveal";
import { GoSalonMark } from "./ui/BrandMark";
import { LINKS } from "../constants";

const FinalCta = () => (
  <section className="grain relative isolate overflow-hidden bg-obsidian py-28 sm:py-36">
    <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[52rem] w-[52rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(224,176,120,0.2),transparent)]" />
    {/* The salon mirror again, drawn as a hairline arch */}
    <div className="pointer-events-none absolute left-1/2 top-16 -z-10 h-[150%] w-[min(44rem,88vw)] -translate-x-1/2 rounded-t-full border border-gold/15" />

    <Reveal className="mx-auto max-w-3xl px-5 text-center sm:px-8">
      <span className="btn-satin mx-auto grid h-16 w-16 place-items-center rounded-[1.1rem] text-[#1a1509]">
        <GoSalonMark className="h-[82%] w-[82%]" hole="#e0b47f" />
      </span>
      <h2 className="mt-10 text-5xl font-light leading-[1.02] tracking-[-0.035em] text-ivory sm:text-7xl">
        See the cut
        <br />
        <span className="text-gilded font-normal italic">before</span> the cut.
      </h2>
      <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-ivory-soft">
        Three free 360° try-ons are waiting. Open Go Salon in your browser, add it to your home
        screen, and find your next look tonight.
      </p>
      <div className="mt-11 flex flex-col items-center justify-center gap-4 sm:flex-row">
        <a
          href={LINKS.customerSignUp}
          className="btn-satin group inline-flex w-full items-center justify-center gap-2 rounded-full px-9 py-4 text-[1.05rem] font-medium transition-transform hover:-translate-y-0.5 sm:w-auto"
        >
          Get started free
          <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
        </a>
        <a
          href={LINKS.salonSignUp}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-ivory/15 px-8 py-4 text-[1.05rem] text-ivory transition-colors hover:border-gold/50 hover:text-gold sm:w-auto"
        >
          <Store size={18} /> List your salon
        </a>
      </div>
    </Reveal>
  </section>
);

export default FinalCta;
