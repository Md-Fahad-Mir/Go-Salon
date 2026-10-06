import React from "react";
import { ArrowUp, ArrowUpRight, Languages, Mail, Smartphone } from "lucide-react";
import BrandMark from "./ui/BrandMark";
import Reveal from "./ui/Reveal";
import { LINKS, NAV_LINKS, SUPPORT_EMAIL } from "../constants";

const APP_LINKS = [
  { label: "Create an account", href: LINKS.customerSignUp },
  { label: "Register your salon", href: LINKS.salonSignUp },
  { label: "Join as a barber", href: LINKS.barberSignUp },
];

/** Gold eyebrow with the short hairline the section intros open with. */
const ColumnHeading = ({ children }) => (
  <h3 className="flex items-center gap-3 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-gold">
    <span className="h-px w-6 bg-gold/60" />
    {children}
  </h3>
);

const Footer = () => (
  <footer className="grain relative isolate overflow-hidden bg-onyx text-ivory">
    {/* Champagne rule across the top, brightest at the centre */}
    <div className="h-px bg-[linear-gradient(90deg,transparent,rgba(228,192,142,0.45)_50%,transparent)]" />
    {/* Low gold light behind the wordmark */}
    <div className="pointer-events-none absolute bottom-[-18rem] left-1/2 -z-10 h-[38rem] w-[70rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(224,176,120,0.13),transparent)]" />

    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <Reveal className="grid grid-cols-2 gap-x-8 gap-y-14 pb-14 pt-20 sm:pt-24 lg:grid-cols-12 lg:gap-x-10">
        <div className="col-span-2 lg:col-span-4">
          <BrandMark size="lg" />
          <p className="mt-7 max-w-sm text-[1.02rem] leading-relaxed text-ivory-soft">
            See the cut before the cut. Try hairstyles on your own photo and book a salon or
            barber in Dhaka.
          </p>
          <a
            href={LINKS.app}
            className="btn-satin mt-9 inline-flex items-center gap-1.5 rounded-full px-6 py-3 text-[0.95rem] font-medium transition-transform hover:-translate-y-0.5"
          >
            Open the app <ArrowUpRight size={16} />
          </a>
        </div>

        <div className="lg:col-span-2 lg:col-start-6">
          <ColumnHeading>Explore</ColumnHeading>
          <ul className="mt-7 space-y-4">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="link-gild pb-1 text-ivory-soft hover:text-ivory">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-2">
          <ColumnHeading>The app</ColumnHeading>
          <ul className="mt-7 space-y-4">
            {APP_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className="group inline-flex items-center gap-1.5 text-ivory-soft transition-colors hover:text-ivory"
                >
                  <span className="link-gild pb-1">{link.label}</span>
                  <ArrowUpRight
                    size={14}
                    className="text-gold/0 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gold"
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-2 lg:col-span-3">
          <ColumnHeading>Talk to us</ColumnHeading>
          <ul className="mt-7 space-y-5">
            <li>
              <a href={LINKS.support} className="group flex items-center gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold/25 text-gold transition-colors duration-300 group-hover:border-gold/60 group-hover:bg-gold/10">
                  <Mail size={17} />
                </span>
                <span className="leading-tight">
                  <span className="block text-[0.72rem] uppercase tracking-[0.2em] text-taupe">
                    Write to us
                  </span>
                  <span className="link-gild mt-1.5 inline-block pb-1 text-ivory transition-colors group-hover:text-gold-light">
                    {SUPPORT_EMAIL}
                  </span>
                </span>
              </a>
            </li>
            <li className="flex items-center gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold/25 text-gold">
                <Languages size={17} />
              </span>
              <span className="leading-tight">
                <span className="block text-[0.72rem] uppercase tracking-[0.2em] text-taupe">
                  We speak
                </span>
                <span className="mt-1.5 block text-ivory">English &amp; বাংলা</span>
              </span>
            </li>
            <li className="flex items-center gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold/25 text-gold">
                <Smartphone size={17} />
              </span>
              <span className="leading-tight">
                <span className="block text-[0.72rem] uppercase tracking-[0.2em] text-taupe">
                  No app store needed
                </span>
                <span className="mt-1.5 block text-ivory">Add it to your home screen</span>
              </span>
            </li>
          </ul>
        </div>
      </Reveal>
    </div>

    {/* The name, set large and engraved into the ground */}
    <Reveal y={40} className="mx-auto max-w-7xl px-5 sm:px-8">
      <p
        aria-hidden="true"
        className="text-engraved select-none whitespace-nowrap text-center text-[clamp(4.25rem,21vw,19.5rem)] font-light leading-[0.82] tracking-[-0.05em]"
      >
        Go Salon
      </p>
    </Reveal>

    <div className="border-t border-gold/10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 py-7 text-sm text-taupe sm:flex-row sm:px-8">
        <p>© {new Date().getFullYear()} Go Salon. All rights reserved.</p>
        <a
          href="#top"
          className="group inline-flex items-center gap-3 transition-colors hover:text-gold"
        >
          Back to top
          <span className="grid h-9 w-9 place-items-center rounded-full border border-gold/25 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-gold/60">
            <ArrowUp size={15} />
          </span>
        </a>
      </div>
    </div>
  </footer>
);

export default Footer;
