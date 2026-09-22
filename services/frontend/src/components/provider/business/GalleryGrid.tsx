import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../../../hooks/useLanguage';
import type { GalleryImage } from '../../../types';
import { formatNumber } from '../../../utils/format';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { IconButton } from '../../common/IconButton';

interface GalleryGridProps {
  images: GalleryImage[];
  /** Offered in the lightbox for the person who owns the pictures. */
  onDelete?: (image: GalleryImage) => void;
  /** Shown when there are no pictures at all. */
  empty?: ReactNode;
}

/** A wall of pictures, and a way to look at one properly.
 *
 *  Three across is the right count on a phone: wide enough that a face is
 *  recognisable, tight enough that six pictures read as a body of work rather
 *  than a list. Tiles are square and cropped so a mixed bag of portrait and
 *  landscape photographs still lines up.
 *
 *  Opening one steps *through* the set rather than showing it alone. Closing a
 *  photo to open the next is two taps and a lost place, which on a phone is
 *  the difference between looking at somebody's work and giving up on it.
 */
export function GalleryGrid({ images, onDelete, empty }: GalleryGridProps) {
  const t = useT();
  const [openAt, setOpenAt] = useState<number | null>(null);

  const total = images.length;
  const current = openAt === null ? null : (images[openAt] ?? null);

  const step = useCallback(
    (by: number) => {
      // Wraps, so the last picture goes back to the first rather than dead-ending.
      setOpenAt((at) => (at === null || total === 0 ? at : (at + by + total) % total));
    },
    [total],
  );

  /* A keyboard is not the main way in, but this is a web app and somebody on a
     laptop will press the arrow keys. */
  useEffect(() => {
    if (openAt === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openAt, step]);

  if (!total) return <>{empty}</>;

  return (
    <>
      <div className="photo-grid">
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            className="pb-tile"
            onClick={() => setOpenAt(index)}
            aria-label={t('pb.tileOpen', { caption: image.caption || t('pb.photoTitle') })}
          >
            <img
              src={image.image}
              alt={image.caption}
              className="pb-tile-photo"
              loading="lazy"
              decoding="async"
            />
            {image.caption ? <span className="pb-tile-cap">{image.caption}</span> : null}
          </button>
        ))}
      </div>

      <BottomSheet
        open={current !== null}
        onClose={() => setOpenAt(null)}
        title={current?.caption || t('pb.photoTitle')}
        description={total > 1 ? t('pb.photoCount', {
          index: formatNumber((openAt ?? 0) + 1),
          total: formatNumber(total),
        }) : undefined}
        footer={
          onDelete && current ? (
            <Button
              variant="danger-soft"
              block
              icon={<Trash2 size={18} aria-hidden="true" />}
              onClick={() => onDelete(current)}
            >
              {t('pb.photoDelete')}
            </Button>
          ) : null
        }
      >
        {current ? (
          <div className="pb-viewer">
            <img src={current.image} alt={current.caption} className="pb-lightbox" />
            {total > 1 ? (
              <div className="pb-viewer-nav">
                <IconButton label={t('pb.photoPrev')} variant="scrim" onClick={() => step(-1)}>
                  <ChevronLeft size={20} />
                </IconButton>
                <IconButton label={t('pb.photoNext')} variant="scrim" onClick={() => step(1)}>
                  <ChevronRight size={20} />
                </IconButton>
              </div>
            ) : null}
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}
