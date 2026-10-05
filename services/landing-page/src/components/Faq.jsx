import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, Plus } from "lucide-react";
import SectionIntro from "./ui/SectionIntro";
import Reveal from "./ui/Reveal";
import { FAQS, LINKS, SUPPORT_EMAIL } from "../constants";

const Faq = () => {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="bg-linen py-24 text-ink sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <SectionIntro tone="light" align="left" eyebrow="Questions" title="Good to know.">
            The short answers. For anything else, a human reads every message.
          </SectionIntro>
          <Reveal delay={0.1}>
            <a
              href={LINKS.support}
              className="mt-8 inline-flex items-center gap-2.5 rounded-full border border-gold-deep/30 px-5 py-3 text-ink transition-colors hover:border-gold-deep hover:text-gold-ink"
            >
              <Mail size={17} /> {SUPPORT_EMAIL}
            </a>
          </Reveal>
        </div>

        <ul className="border-t border-gold-deep/20">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <li key={item.q} className="border-b border-gold-deep/20">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-6 py-6 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <span className={`text-lg sm:text-xl ${isOpen ? "font-medium text-ink" : "text-ink-soft"}`}>
                    {item.q}
                  </span>
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-all duration-300 ${
                      isOpen ? "rotate-45 border-gold-deep bg-gold-deep text-linen" : "border-gold-deep/30 text-gold-ink"
                    }`}
                  >
                    <Plus size={17} />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-2xl pb-7 pr-12 text-[1.02rem] leading-relaxed text-ink-soft">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default Faq;
