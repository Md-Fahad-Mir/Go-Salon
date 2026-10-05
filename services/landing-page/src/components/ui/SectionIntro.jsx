import React from "react";
import Reveal from "./Reveal";

/** Eyebrow, headline and lede — the opening of every section. `tone` is the
    ground it sits on: "dark" for obsidian, "light" for cashmere. */
const SectionIntro = ({ eyebrow, title, children, tone = "dark", align = "center", className = "" }) => {
  const centered = align === "center";
  return (
    <Reveal className={`${centered ? "mx-auto text-center" : ""} max-w-3xl ${className}`}>
      <p
        className={`mb-5 inline-flex items-center gap-3 text-[0.75rem] font-medium uppercase tracking-[0.2em] sm:text-[0.78rem] sm:tracking-[0.28em] ${
          tone === "dark" ? "text-gold" : "text-gold-ink"
        }`}
      >
        <span className={`hidden h-px w-8 sm:block ${tone === "dark" ? "bg-gold/60" : "bg-gold-deep/60"}`} />
        {eyebrow}
        {centered && (
          <span className={`hidden h-px w-8 sm:block ${tone === "dark" ? "bg-gold/60" : "bg-gold-deep/60"}`} />
        )}
      </p>
      <h2
        className={`text-[2.4rem] font-light leading-[1.05] tracking-[-0.025em] sm:text-5xl lg:text-[3.6rem] ${
          tone === "dark" ? "text-ivory" : "text-ink"
        }`}
      >
        {title}
      </h2>
      {children && (
        <p
          className={`mt-6 text-[1.06rem] leading-relaxed sm:text-lg ${
            centered ? "mx-auto max-w-2xl" : "max-w-xl"
          } ${tone === "dark" ? "text-ivory-soft" : "text-ink-soft"}`}
        >
          {children}
        </p>
      )}
    </Reveal>
  );
};

export default SectionIntro;
