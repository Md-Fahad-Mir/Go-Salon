import React from "react";
import { ArrowRight, ChartColumn, ClipboardList, Images, Inbox, LayoutDashboard, QrCode, Users, WandSparkles } from "lucide-react";
import PhoneFrame from "./ui/PhoneFrame";
import Reveal from "./ui/Reveal";
import SectionIntro from "./ui/SectionIntro";
import { screen } from "../assets/screens";
import { LINKS } from "../constants";

const TOOLS = [
  {
    icon: LayoutDashboard,
    title: "The salon floor",
    body: "Every chair, in one list — who’s in the chair, who’s still to come, and what’s next.",
  },
  {
    icon: Inbox,
    title: "Booking requests",
    body: "Auto-accept bookings or approve them by hand. Clients get a text either way.",
  },
  {
    icon: Users,
    title: "Team, shifts & hours",
    body: "Your roster, who works when, and which services each person can do.",
  },
  {
    icon: ClipboardList,
    title: "Your menu",
    body: "Services, prices and durations by category — from a quick trim to holud and bridal packages.",
  },
  {
    icon: QrCode,
    title: "Your own QR code",
    body: "Print it for the counter. One scan puts your salon on a client’s Home screen.",
  },
  {
    icon: ChartColumn,
    title: "How business is going",
    body: "Revenue, average ticket, repeat clients, top staff and most-booked services.",
  },
];

const ForSalons = () => {
  const floor = screen("pro-salon-floor", "dark");
  const analytics = screen("pro-analytics", "dark");

  return (
    <section id="salons" className="grain relative isolate overflow-hidden bg-onyx py-24 sm:py-32">
      <div className="pointer-events-none absolute -left-40 top-20 -z-10 h-[44rem] w-[44rem] rounded-full bg-[radial-gradient(closest-side,rgba(224,176,120,0.13),transparent)]" />

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <div>
            <SectionIntro
              align="left"
              eyebrow="For salons, parlours & barbers"
              title={
                <>
                  Run the floor.{" "}
                  <span className="text-gilded font-normal italic">Fill the chairs.</span>
                </>
              }
            >
              Give your business its own home inside Go Salon — your menu, your team, your hours,
              and a QR code that brings clients straight back to you.
            </SectionIntro>

            <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-gold/10 bg-gold/10 sm:grid-cols-2">
              {TOOLS.map(({ icon: Icon, title, body }, i) => (
                <div key={title} className="bg-onyx p-6">
                  <Reveal delay={i * 0.06}>
                    <Icon size={20} className="mb-3 text-gold" />
                    <h3 className="font-medium text-ivory">{title}</h3>
                    <p className="mt-1.5 text-[0.93rem] leading-relaxed text-ivory-soft">{body}</p>
                  </Reveal>
                </div>
              ))}
            </div>
          </div>

          <div>
            {(floor || analytics) && (
              <Reveal className="relative mx-auto flex w-full max-w-[30rem] items-start justify-center">
                {floor && (
                  <div className="relative z-10 w-[52%]">
                    <PhoneFrame src={floor.src} theme={floor.theme} alt="Go Salon salon floor for owners" />
                  </div>
                )}
                {analytics && (
                  <div className={`w-[52%] ${floor ? "-ml-[10%] mt-[16%] opacity-90" : ""}`}>
                    <PhoneFrame src={analytics.src} theme={analytics.theme} alt="Go Salon business analytics" />
                  </div>
                )}
              </Reveal>
            )}

            <Reveal delay={0.15}>
              <div className="mt-12 rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/[0.12] to-transparent p-7">
                <div className="flex items-center gap-3">
                  <span className="btn-satin grid h-10 w-10 place-items-center rounded-xl">
                    <WandSparkles size={18} />
                  </span>
                  <h3 className="text-lg font-medium text-ivory">Consult with the AI try-on</h3>
                </div>
                <p className="mt-3 text-[0.97rem] leading-relaxed text-ivory-soft">
                  Salon owners and their staff can run 360° try-ons too. Show a client the cut
                  before you make it, then book it in on the spot.
                </p>
                <p className="mt-3 flex items-center gap-2 text-sm text-taupe">
                  <Images size={15} className="text-gold" /> Plus a portfolio to show off your best work.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.25} className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={LINKS.salonSignUp}
                className="btn-satin group inline-flex flex-1 items-center justify-center gap-2 rounded-full px-7 py-4 font-medium transition-transform hover:-translate-y-0.5"
              >
                Register your salon
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href={LINKS.barberSignUp}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-ivory/15 px-7 py-4 text-ivory transition-colors hover:border-gold/50 hover:text-gold"
              >
                Join as a barber or stylist
              </a>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ForSalons;
