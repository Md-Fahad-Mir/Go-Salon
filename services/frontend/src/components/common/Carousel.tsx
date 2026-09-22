import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { useT } from '../../hooks/useLanguage';
import { Badge } from './Badge';

interface CarouselProps {
  children: ReactNode[];
  dots?: boolean;
  counter?: boolean;
  className?: string;
  label?: string;
}

/** Native scroll-snap carousel — swipes like the platform, no JS physics. */
export function Carousel({ children, dots = true, counter, className, label }: CarouselProps) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const count = children.length;

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    if (next !== index) setIndex(next);
  };

  return (
    <div
      className={cn('carousel', className)}
      role="region"
      aria-label={label ?? t('gallery.label')}
      aria-roledescription="carousel"
    >
      <div ref={trackRef} className="carousel-track" onScroll={onScroll}>
        {children.map((child, i) => (
          <div key={i} aria-hidden={i !== index} role="group" aria-label={t('gallery.slideOf', { index: i + 1, total: count })}>
            {child}
          </div>
        ))}
      </div>
      {dots && count > 1 ? (
        <div className="carousel-dots" aria-hidden="true">
          {children.map((_, i) => <span key={i} data-active={i === index ? 'true' : undefined} />)}
        </div>
      ) : null}
      {counter && count > 1 ? (
        <div className="carousel-counter">
          <Badge tone="dark" plain pill>{index + 1} / {count}</Badge>
        </div>
      ) : null}
    </div>
  );
}
