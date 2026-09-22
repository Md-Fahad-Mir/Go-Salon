import type { HairType } from '../../types';

const PATHS: Record<HairType, string> = {
  straight: 'M7 4v16M12 4v16M17 4v16',
  wavy: 'M3 8c3-4 6 4 9 0s6 4 9 0M3 16c3-4 6 4 9 0s6 4 9 0',
  curly: 'M3 8c1.5-4 3.5-4 5 0s3.5 4 5 0 3.5-4 5 0 3.5 4 3 0M3 16c1.5-4 3.5-4 5 0s3.5 4 5 0 3.5-4 5 0 3.5 4 3 0',
  coily: 'M3 9l3-4 3 4 3-4 3 4 3-4 3 4M3 17l3-4 3 4 3-4 3 4 3-4 3 4',
};

/** Tiny stroke glyphs for the hair-type tiles: lines, waves, curls, coils. */
export function HairTypeIcon({ type, size = 26 }: { type: HairType; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[type]} />
    </svg>
  );
}
