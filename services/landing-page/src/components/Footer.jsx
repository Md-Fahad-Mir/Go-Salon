import React from "react";
import BrandMark from "./ui/BrandMark";
import { LINKS, NAV_LINKS, SUPPORT_EMAIL } from "../constants";

const APP_LINKS = [
  { label: "Open the app", href: LINKS.app },
  { label: "Create an account", href: LINKS.customerSignUp },
  { label: "Register your salon", href: LINKS.salonSignUp },
];

const Footer = () => (
  <footer className="border-t border-gold/10 bg-onyx text-ivory">
    <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
      <div>
        <BrandMark />
        <p className="mt-5 max-w-xs leading-relaxed text-ivory-soft">
          See the cut before the cut. Try hairstyles on your own photo and book a salon or barber in
          Dhaka.
        </p>
      </div>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-[0.24em] text-gold">Explore</h3>
        <ul className="mt-5 space-y-3">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} className="text-ivory-soft transition-colors hover:text-ivory">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-[0.24em] text-gold">The app</h3>
        <ul className="mt-5 space-y-3">
          {APP_LINKS.map((link) => (
            <li key={link.label}>
              <a href={link.href} className="text-ivory-soft transition-colors hover:text-ivory">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-[0.24em] text-gold">Talk to us</h3>
        <ul className="mt-5 space-y-3">
          <li>
            <a href={LINKS.support} className="text-ivory-soft transition-colors hover:text-ivory">
              {SUPPORT_EMAIL}
            </a>
          </li>
          <li className="text-ivory-soft">English &amp; বাংলা</li>
        </ul>
      </div>
    </div>

    <div className="border-t border-gold/10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-taupe sm:flex-row sm:px-8">
        <p>© {new Date().getFullYear()} Go Salon. All rights reserved.</p>
        <p>Made for Dhaka · Prices in BDT (৳)</p>
      </div>
    </div>
  </footer>
);

export default Footer;
