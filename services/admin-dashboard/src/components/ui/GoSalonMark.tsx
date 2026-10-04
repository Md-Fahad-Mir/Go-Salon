/** The Go Salon mark: open shears whose finger rings spell the name — the left
    ring is a G, the smaller right ring is the o. A copy of GoSalonMark in
    services/frontend/src/components/auth/BrandMark.tsx (the two apps build
    separately, so it cannot be imported); keep the paths in step with it and
    with public/favicon.svg. Ink is currentColor; the pivot hole takes
    --mark-hole so it reads as a hole in whatever tile it sits on. */
export function GoSalonMark({ className }: { className?: string }) {
  return (
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
        <circle cx="24" cy="22" r="1.1" fill="var(--mark-hole, transparent)" />
      </g>
    </svg>
  );
}
