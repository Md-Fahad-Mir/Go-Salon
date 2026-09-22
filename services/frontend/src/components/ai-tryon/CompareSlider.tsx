import { ChevronsLeftRight, ImageOff } from 'lucide-react';
import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { useT } from '../../hooks/useLanguage';
import { formatNumber } from '../../utils/format';
import { Badge } from '../common/Badge';
import { Skeleton } from '../common/Skeleton';

interface CompareSliderProps {
  beforeUrl: string | null;
  afterUrl: string | null;
  loading?: boolean;
  missing?: boolean;
  styleName: string;
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/** Before / after photos with a draggable divider. Pointer drag anywhere in
    the frame; a hidden range input carries the keyboard and screen-reader
    interaction. */
export function CompareSlider({ beforeUrl, afterUrl, loading, missing, styleName }: CompareSliderProps) {
  const t = useT();
  const [pos, setPos] = useState(50);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const update = (clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPos(clamp(((clientX - rect.left) / rect.width) * 100));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    update(event.clientX);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) update(event.clientX);
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (loading) {
    return (
      <div className="tryon-compare" aria-busy="true">
        <Skeleton className="tryon-compare-skeleton" radius="0" />
      </div>
    );
  }

  if (missing || !beforeUrl || !afterUrl) {
    return (
      <div className="tryon-compare tryon-compare-missing">
        <div className="art-center">
          <ImageOff size={28} aria-hidden="true" />
          {t('tryon.compareMissing')}
        </div>
      </div>
    );
  }

  const style = { '--pos': `${pos}%` } as CSSProperties;
  const percent = Math.round(pos);

  return (
    <div
      ref={frameRef}
      className="tryon-compare"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <img src={beforeUrl} alt={t('tryon.beforeAlt')} draggable={false} />
      <img
        src={afterUrl}
        alt={t('tryon.afterAlt', { style: styleName })}
        className="tryon-compare-after"
        draggable={false}
      />
      <span className="tryon-compare-divider" aria-hidden="true" />
      <span className="tryon-compare-handle" aria-hidden="true">
        <ChevronsLeftRight size={20} />
      </span>
      <span className="tryon-compare-label" data-side="before">
        <Badge tone="dark" plain pill>{t('tryon.before')}</Badge>
      </span>
      <span className="tryon-compare-label" data-side="after">
        <Badge tone="dark" plain pill>{t('tryon.after')}</Badge>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => setPos(Number(event.target.value))}
        className="tryon-compare-range"
        aria-label={t('tryon.compareLabel')}
        aria-valuetext={t('tryon.compareValue', {
          before: formatNumber(percent),
          after: formatNumber(100 - percent),
        })}
      />
    </div>
  );
}
