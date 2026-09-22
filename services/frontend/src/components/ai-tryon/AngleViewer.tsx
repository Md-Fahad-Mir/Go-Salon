import { ImageOff, RotateCw } from 'lucide-react';
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GeneratedView } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { usePhotoUrl } from '../../hooks/usePhotoUrl';
import { angleSpec } from '../../utils/angles';
import { formatNumber } from '../../utils/format';
import { Badge } from '../common/Badge';
import { Skeleton } from '../common/Skeleton';

interface AngleViewerProps {
  views: GeneratedView[];
  styleName: string;
  /** Show the photo that went in instead of the render. */
  showOriginal: boolean;
}

/** The rendered head, turned by dragging.

    Not a 3D engine — four to eight photographs in ring order, swapped as the
    pointer moves, which is what every product photographer's "360 spin" has
    always been. The whole ring is preloaded through `usePhotoUrl` so a drag
    does not flicker while a blob is read out of IndexedDB. */
export function AngleViewer({ views, styleName, showOriginal }: AngleViewerProps) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const frame = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startIndex = useRef(0);

  const safeIndex = Math.min(index, Math.max(0, views.length - 1));
  const view = views[safeIndex];

  const stepFrom = (clientX: number) => {
    const width = frame.current?.getBoundingClientRect().width ?? 0;
    if (!width || views.length < 2) return;
    /* One full drag across the frame turns the head all the way round. */
    const moved = ((clientX - startX.current) / width) * views.length;
    const next = Math.round(startIndex.current + moved);
    setIndex(((next % views.length) + views.length) % views.length);
  };

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    startX.current = event.clientX;
    startIndex.current = safeIndex;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) stepFrom(event.clientX);
  };
  const onEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="tryon-viewer">
      <div
        ref={frame}
        className="tryon-viewer-frame"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        role="group"
        aria-label={t('tryon.viewerLabel')}
      >
        {/* Every view stays mounted and only the current one is shown: the
            browser has already decoded the others, so a drag is instant. */}
        {views.map((item, i) => (
          <AngleFrame
            key={item.angle}
            view={item}
            styleName={styleName}
            showOriginal={showOriginal}
            visible={i === safeIndex}
          />
        ))}

        <span className="tryon-viewer-badge">
          <Badge tone="dark" plain pill>
            {t(angleSpec(view?.angle ?? 'front').label)}
          </Badge>
        </span>
        {views.length > 1 ? (
          <span className="tryon-viewer-hint" aria-hidden="true">
            <RotateCw size={14} /> {t('tryon.viewerDrag')}
          </span>
        ) : null}
      </div>

      {views.length > 1 ? (
        <>
          <input
            type="range"
            min={0}
            max={views.length - 1}
            step={1}
            value={safeIndex}
            onChange={(event) => setIndex(Number(event.target.value))}
            className="tryon-viewer-range"
            aria-label={t('tryon.viewerLabel')}
            aria-valuetext={t(angleSpec(view?.angle ?? 'front').label)}
          />
          <ul className="tryon-viewer-dots">
            {views.map((item, i) => (
              <li key={item.angle}>
                <button
                  type="button"
                  className="tryon-viewer-dot"
                  data-active={i === safeIndex || undefined}
                  aria-label={t(angleSpec(item.angle).label)}
                  aria-current={i === safeIndex ? 'true' : undefined}
                  onClick={() => setIndex(i)}
                >
                  {t(angleSpec(item.angle).label)}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="small dim center">
        {t('tryon.viewerCount', { count: formatNumber(views.length) })}
      </p>
    </div>
  );
}

/** One view of the ring. Its own component so each keeps its own blob URL. */
function AngleFrame({
  view,
  styleName,
  showOriginal,
  visible,
}: {
  view: GeneratedView;
  styleName: string;
  showOriginal: boolean;
  visible: boolean;
}) {
  const t = useT();
  const after = usePhotoUrl(view.resultKey);
  const before = usePhotoUrl(view.sourceKey);
  const shown = showOriginal ? before : after;

  /* Every slide is mounted whether or not it is the one on screen, so the
     browser decodes the whole ring up front and a drag never waits on
     IndexedDB. Only its visibility changes. */
  return (
    <div className="tryon-viewer-slide" data-visible={visible || undefined} aria-hidden={!visible}>
      {shown.url ? (
        <img
          src={shown.url}
          alt={
            showOriginal
              ? t('tryon.beforeAlt')
              : t('tryon.afterAlt', { style: styleName })
          }
          draggable={false}
        />
      ) : shown.loading ? (
        <Skeleton className="tryon-viewer-skeleton" radius="0" />
      ) : (
        <span className="art-center">
          <ImageOff size={26} aria-hidden="true" />
          {t('tryon.compareMissing')}
        </span>
      )}
    </div>
  );
}
