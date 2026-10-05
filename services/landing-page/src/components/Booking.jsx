import React from "react";
import { Check, QrCode } from "lucide-react";
import PhoneFrame from "./ui/PhoneFrame";
import Reveal from "./ui/Reveal";
import SectionIntro from "./ui/SectionIntro";
import { screen } from "../assets/screens";

const POINTS = [
  "Pick one service or several — the durations add up for you.",
  "Choose your stylist, or let the salon pick whoever is free first.",
  "Live availability from the salon’s own diary, with taken slots marked, not hidden.",
  "Pay at the salon. Nothing is taken up front.",
  "Cancel free up to 2 hours before; reschedule free whenever there’s an opening.",
  "A text when your booking is confirmed or changed, and add-to-calendar in one tap.",
];

const Booking = () => {
  const back = screen("booking-service", "dark");
  const front = screen("booking-confirmation", "dark") ?? screen("bookings", "dark") ?? screen("booking-datetime", "dark");

  return (
    <section id="booking" className="relative overflow-hidden bg-linen py-24 text-ink sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-2 lg:gap-24">
        {/* Phones */}
        <Reveal className="relative order-2 mx-auto w-full max-w-[30rem] lg:order-1">
          <div className="absolute inset-[6%] rounded-full bg-[radial-gradient(closest-side,rgba(210,164,104,0.28),transparent)]" />
          <div className="relative flex items-end justify-center">
            {back && (
              <div className="w-[52%] -rotate-[5deg]">
                <PhoneFrame src={back.src} theme={back.theme} alt="Choosing services in a Go Salon booking" />
              </div>
            )}
            {front && (
              <div className={`w-[52%] rotate-[4deg] ${back ? "-ml-[12%] mb-[-8%]" : ""}`}>
                <PhoneFrame src={front.src} theme={front.theme} alt="A confirmed Go Salon booking" />
              </div>
            )}
          </div>
        </Reveal>

        {/* Copy */}
        <div className="order-1 lg:order-2">
          <SectionIntro
            tone="light"
            align="left"
            eyebrow="Booking"
            title={
              <>
                Book the chair{" "}
                <span className="text-gilded-deep font-normal italic">that can do it.</span>
              </>
            }
          >
            Go Salon is built around the salon you already love. Add it once, then book in a few
            taps — no calls, no waiting for someone to pick up.
          </SectionIntro>

          <ul className="mt-10 grid gap-4">
            {POINTS.map((point, i) => (
              <Reveal key={point} delay={i * 0.06} className="flex items-start gap-3.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-deep/15 text-gold-ink">
                  <Check size={14} strokeWidth={2.5} />
                </span>
                <span className="text-[1.02rem] leading-relaxed text-ink-soft">{point}</span>
              </Reveal>
            ))}
          </ul>

          <Reveal delay={0.2}>
            <div className="mt-10 flex items-start gap-5 rounded-3xl bg-obsidian p-6 text-ivory shadow-[0_30px_70px_-35px_rgba(18,16,14,0.8)] sm:p-7">
              <span className="btn-satin grid h-14 w-14 shrink-0 place-items-center rounded-2xl">
                <QrCode size={26} />
              </span>
              <div>
                <h3 className="text-lg font-medium">Scan once. Your salon, on Home.</h3>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ivory-soft">
                  Every salon on Go Salon has a QR code at the counter. Scan it and its menu, team,
                  hours and Book button sit on your Home screen.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
};

export default Booking;
