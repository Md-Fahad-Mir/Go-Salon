import React from "react";
import { BatteryFull, Signal, Wifi } from "lucide-react";

/** A dark, satin-edged handset for showing real PWA screens. The screenshots
    are captured at 390×844 without a status bar, so the frame adds one above
    them (47px tall at that scale) rather than letting the island cover the
    app's own header. `theme` matches the bar to the screenshot's ground.
    `children`, when given, is a live screen drawn in place of a screenshot;
    it sits in the same @container, so `cqw` sizes it to the glass. */
const PhoneFrame = ({ src, alt, theme = "dark", className = "", eager = false, children }) => (
  <div
    className={`relative rounded-[2.6rem] bg-gradient-to-b from-[#3a332b] via-[#1b1814] to-[#2b261f] p-[7px] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8),0_0_0_1px_rgba(224,176,120,0.2)] ${className}`}
  >
    <div
      className={`@container relative flex aspect-[390/891] flex-col overflow-hidden rounded-[2.15rem] ${
        theme === "dark" ? "bg-obsidian text-ivory" : "bg-cashmere text-ink"
      }`}
    >
      <div className="flex h-[5.3%] shrink-0 items-center justify-between px-[8%] text-[3.6cqw] font-semibold">
        <span>9:41</span>
        <span className="flex items-center gap-[1.2cqw]">
          <Signal className="h-[3.6cqw] w-[3.6cqw]" strokeWidth={2.5} />
          <Wifi className="h-[3.6cqw] w-[3.6cqw]" strokeWidth={2.5} />
          <BatteryFull className="h-[4.4cqw] w-[4.4cqw]" strokeWidth={2} />
        </span>
      </div>
      {children ? (
        <div className="relative min-h-0 flex-1">{children}</div>
      ) : src && (
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="block w-full flex-1 object-cover object-top"
        />
      )}
      {/* Dynamic island */}
      <div className="pointer-events-none absolute left-1/2 top-[1.2%] h-[3.3%] w-[30%] -translate-x-1/2 rounded-full bg-black" />
      {/* Glass sheen */}
      <div className="pointer-events-none absolute inset-0 rounded-[2.15rem] bg-gradient-to-br from-white/[0.07] via-transparent to-transparent" />
    </div>
  </div>
);

export default PhoneFrame;
