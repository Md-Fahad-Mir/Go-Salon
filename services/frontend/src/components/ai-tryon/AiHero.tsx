import { Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../../hooks/useLanguage';
import { AI_HERO_PHOTO } from '../../constants';
import { Badge } from '../common/Badge';

/** The one picture on the screen that has to sell the feature.
 *
 *  It is a *compare*, not a still: the same photograph shown twice, with the
 *  left side cooled and flattened to read as "before" and the right side left
 *  warm and sharp as "after". One photograph, because a genuine two-shot
 *  before/after of the same person in the same light is not something a stock
 *  library reliably has — and a composite of two different people would be a
 *  lie about what the product does.
 *
 *  The handle is draggable, which is the point: a person who drags it has
 *  understood the feature without reading a word of the copy.
 */
export function AiHero() {
  const t = useT();
  const frame = useRef<HTMLDivElement | null>(null);
  const [split, setSplit] = useState(52);
  const [dragging, setDragging] = useState(false);

  const moveTo = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const next = ((clientX - box.left) / box.width) * 100;
    setSplit(Math.min(88, Math.max(12, next)));
  };

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    moveTo(event.clientX);
  };

  /* Keyboard too: the slider is the only way to see the "before", so it
     cannot be mouse-only. */
  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') setSplit((v) => Math.max(12, v - 4));
    if (event.key === 'ArrowRight') setSplit((v) => Math.min(88, v + 4));
  };

  return (
    <div className="ai-hero">
      <div
        ref={frame}
        className="ai-hero-frame"
        data-dragging={dragging || undefined}
        onPointerDown={onDown}
        onPointerMove={(event) => dragging && moveTo(event.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <img className="ai-hero-photo ai-hero-after" src={AI_HERO_PHOTO} alt="" />
        {/* The same photograph, cooled and softened, revealed to the left of
            the handle. `clip-path` rather than a second element width, so the
            face never squashes as the handle moves. */}
        <img
          className="ai-hero-photo ai-hero-before"
          src={AI_HERO_PHOTO}
          alt={t('tryon.compareLabel')}
          style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
        />

        <div className="ai-hero-scrim" />

        <div className="ai-hero-tags">
          <Badge tone="dark" plain pill>{t('tryon.before')}</Badge>
          <Badge tone="solid" plain pill>
            <Sparkles size={12} aria-hidden="true" /> {t('tryon.afterAi')}
          </Badge>
        </div>

        <div
          className="ai-hero-handle"
          style={{ insetInlineStart: `${split}%` }}
          role="slider"
          tabIndex={0}
          aria-label={t('tryon.compareLabel')}
          aria-valuemin={12}
          aria-valuemax={88}
          aria-valuenow={Math.round(split)}
          onKeyDown={onKey}
        >
          <span className="ai-hero-grip" aria-hidden="true" />
        </div>

        <div className="ai-hero-copy">
          <h2>{t('tryon.heroTitle')}</h2>
          <p>{t('tryon.heroBody')}</p>
        </div>
      </div>
    </div>
  );
}
