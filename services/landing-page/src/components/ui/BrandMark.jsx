import React from "react";

/** Open shears whose finger rings spell the name: the left ring is a G, the
    smaller right ring is the o. Same paths as the PWA's GoSalonMark and its
    icons (services/frontend/src/components/auth/BrandMark.tsx). */
export const GoSalonMark = ({ className = "", hole = "transparent" }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
    <g transform="translate(1 -2.6)">
      <path d="M21.2 21.59 L34.3 9.8 Q31.1 18.5 24.86 24.69 Z" fill="currentColor" />
      <path d="M26.82 21.76 L15 10 Q17.39 18.52 22.98 24.64 Z" fill="currentColor" />
      <path
        d="M24 22 L17.39 29.81 A6.8 6.8 0 1 0 19.8 35 H15.6"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M24 22 L31.38 31.84" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="34.5" cy="36" r="5.2" stroke="currentColor" strokeWidth="3.2" />
      <circle cx="24" cy="22" r="1.1" fill={hole} />
    </g>
  </svg>
);

const SIZES = {
  md: { tile: "h-9 w-9 rounded-[0.625rem]", word: "text-[1.35rem]" },
  lg: { tile: "h-12 w-12 rounded-[0.875rem]", word: "text-[1.75rem]" },
};

/** The gold satin tile with the word-mark beside it. */
const BrandMark = ({ size = "md", tone = "light", className = "" }) => {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`btn-satin grid place-items-center text-[#1a1509] ${s.tile}`}
        aria-hidden="true"
      >
        <GoSalonMark className="h-[82%] w-[82%]" hole="#e0b47f" />
      </span>
      <span
        className={`${s.word} font-semibold tracking-[-0.01em] ${
          tone === "light" ? "text-ivory" : "text-ink"
        }`}
      >
        Go Salon
      </span>
    </span>
  );
};

export default BrandMark;
