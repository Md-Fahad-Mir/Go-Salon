import { ImageOff, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AIGeneration } from '../../types';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { usePhotoUrl } from '../../hooks/usePhotoUrl';
import { getHairstyle } from '../../mockData';
import { formatClock, formatRelative } from '../../utils/format';
import { Art } from '../common/Art';
import { Badge } from '../common/Badge';
import { Spinner } from '../common/Spinner';

interface GenerationCardProps {
  generation: AIGeneration;
  /** Show the time of day under the name (history grid). */
  showTime?: boolean;
  /** Extra row rendered under the picture, outside the link. */
  footer?: ReactNode;
}

/** A rendered result as a portrait tile that opens the preview. */
export function GenerationCard({ generation, showTime, footer }: GenerationCardProps) {
  const t = useT();
  const { url, loading, missing } = usePhotoUrl(generation.resultKey);
  const style = getHairstyle(generation.hairstyleId);
  const name = generation.hairstyleName;

  return (
    <div className="tryon-gen">
      <Link
        to={ROUTES.tryOnPreview(generation.id)}
        className="tryon-gen-link"
        aria-label={t('tryon.genCardLabel', { name, when: formatRelative(generation.createdAt) })}
      >
        <Art ratio="portrait" src={url} tone={style?.tone ?? 0} alt={url ? t('tryon.genAlt', { name }) : ''}>
          {loading ? (
            <span className="tryon-gen-loading" aria-hidden="true">
              <Spinner size="sm" />
            </span>
          ) : null}
          {missing ? (
            <div className="art-center" aria-hidden="true">
              <ImageOff size={22} />
              {t('tryon.photoGoneShort')}
            </div>
          ) : null}
          {generation.feedback ? (
            <div className="art-corner-end">
              <Badge tone="dark" plain pill>
                {generation.feedback === 'like' ? (
                  <ThumbsUp size={12} aria-hidden="true" />
                ) : (
                  <ThumbsDown size={12} aria-hidden="true" />
                )}
                {generation.feedback === 'like' ? t('tryon.liked') : t('tryon.notForMe')}
              </Badge>
            </div>
          ) : null}
          <div className="art-overlay">
            <span className="tryon-gen-name">{name}</span>
            {showTime ? <span className="tryon-gen-time">{formatClock(generation.createdAt)}</span> : null}
          </div>
        </Art>
      </Link>
      {footer}
    </div>
  );
}
