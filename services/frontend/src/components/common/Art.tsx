import { useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface ArtProps {
  /** 0–5 picks one of the warm hatch tones so grids do not read as one slab. */
  tone?: number;
  ratio?: 'square' | 'portrait' | 'wide' | 'banner' | 'circle' | 'none';
  /** A real image (data / object URL). When present the hatch is skipped. */
  src?: string | null;
  alt?: string;
  flat?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Image placeholder drawn exactly as the design kit draws missing photos:
    a warm brown block with a fine diagonal hatch. Real photos drop in via
    `src` and everything else stays the same. */
export function Art({ tone = 0, ratio = 'square', src, alt = '', flat, className, style, children }: ArtProps) {
  const id = useId();
  const t = ((tone % 6) + 6) % 6;
  const bg = t === 0 ? 'var(--art-bg)' : `var(--art-bg-${t})`;
  const line = t === 0 ? 'var(--art-line)' : `var(--art-line-${t})`;
  return (
    <div
      className={cn('art', ratio !== 'none' && `art-${ratio}`, flat && 'art-flat', className)}
      style={{ backgroundColor: bg, ...style }}
      role={src ? undefined : 'img'}
      aria-label={src ? undefined : alt || undefined}
      aria-hidden={!src && !alt ? true : undefined}
    >
      {src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <svg aria-hidden="true" focusable="false">
          <defs>
            <pattern id={`hatch-${id}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" stroke={line} strokeWidth="1.2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#hatch-${id})`} />
        </svg>
      )}
      {children}
    </div>
  );
}
