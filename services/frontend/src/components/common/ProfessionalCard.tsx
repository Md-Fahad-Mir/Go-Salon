import { Clock, MapPin } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { Professional } from '../../types';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { formatBdt, formatDistance } from '../../utils/format';
import { Art } from './Art';
import { Badge } from './Badge';
import { Button } from './Button';
import { Rating } from './Rating';

interface ProfessionalCardProps {
  pro: Professional;
  /** `list`: full card with cover + Book button. `row`: compact one-liner. */
  variant?: 'list' | 'row';
  bookLabel?: string;
  onBook?: () => void;
  hairstyleId?: string;
}

/** Placeholder art when a business has not uploaded a picture yet. Derived
    from the id so the same salon always draws the same colour. */
const toneFor = (id: string): number =>
  [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;

export function ProfessionalCard({ pro, variant = 'list', bookLabel, onBook, hairstyleId }: ProfessionalCardProps) {
  const t = useT();
  const label = bookLabel ?? t('action.book');
  const navigate = useNavigate();
  const detail = ROUTES.professional(pro.id);
  const cover = pro.gallery[0]?.image || pro.coverImage || pro.avatar;
  const book = () => {
    if (onBook) return onBook();
    navigate(ROUTES.bookingStaff(pro.id), { state: { hairstyleId } });
  };

  if (variant === 'row') {
    return (
      <div className="pro-row">
        <Link to={detail} className="pro-row-main">
          {/* Not `.pro-photo` — that is the portfolio grid's full-width photo
              style, and it loads after this one, so it beat the thumbnail's
              own width and blew the row open. */}
          {cover ? (
            <img src={cover} alt="" className="pro-row-art" loading="lazy" decoding="async" />
          ) : (
            <Art tone={toneFor(pro.id)} ratio="square" className="pro-row-art" alt="" />
          )}
          <span className="pro-row-body">
            <span className="pro-row-name">{pro.name}</span>
            <span className="pro-row-meta">
              {/* Nobody has been reviewed yet, so there is nothing to score.
                  The area is what a customer can actually use instead. */}
              {pro.reviewCount > 0 && pro.rating !== null ? (
                <Rating value={pro.rating} count={pro.reviewCount} size={13} />
              ) : (
                <span className="dim">{pro.location.area}</span>
              )}
              {pro.distanceKm !== undefined ? <span className="dim">· {formatDistance(pro.distanceKm)}</span> : null}
            </span>
          </span>
        </Link>
        <Button size="sm" variant="accent-soft" onClick={book}>{label}</Button>
      </div>
    );
  }

  return (
    <article className="pro-card">
      <Link to={detail} className="pro-card-cover">
        {cover ? (
          <div className="pro-cover-photo">
            <img src={cover} alt={t('biz.coverAlt', { name: pro.name })} />
            <div className="art-corner">
              <Badge tone={pro.type === 'barber' ? 'accent' : 'sage'} plain pill>
                {t(pro.type === 'barber' ? 'biz.barber' : 'biz.salon')}
              </Badge>
            </div>
            <div className="art-corner-end">
              {pro.openNow ? <Badge tone="dark" pill className="open-badge">{t('status.openNow')}</Badge> : null}
            </div>
          </div>
        ) : (
          <Art tone={toneFor(pro.id)} ratio="wide" alt={t('biz.coverAlt', { name: pro.name })}>
            <div className="art-corner">
              <Badge tone={pro.type === 'barber' ? 'accent' : 'sage'} plain pill>
                {t(pro.type === 'barber' ? 'biz.barber' : 'biz.salon')}
              </Badge>
            </div>
            <div className="art-corner-end">
              {pro.openNow ? <Badge tone="dark" pill className="open-badge">{t('status.openNow')}</Badge> : null}
            </div>
          </Art>
        )}
      </Link>
      <div className="pro-card-body">
        <div className="between">
          <Link to={detail} className="pro-card-name">{pro.name}</Link>
          {pro.reviewCount > 0 && pro.rating !== null ? (
            <Rating value={pro.rating} count={pro.reviewCount} />
          ) : (
            <Badge tone="neutral" plain pill>{t('biz.newHere')}</Badge>
          )}
        </div>
        {pro.tagline ? <p className="pro-card-tagline clamp-2">{pro.tagline}</p> : null}
        <div className="pro-card-meta">
          {pro.distanceKm !== undefined ? (
            <span><MapPin size={14} aria-hidden="true" /> {formatDistance(pro.distanceKm)} · {pro.location.area}</span>
          ) : (
            <span><MapPin size={14} aria-hidden="true" /> {pro.location.area || pro.location.city}</span>
          )}
          <span>
            <Clock size={14} aria-hidden="true" />{' '}
            {t(pro.acceptance === 'auto' ? 'biz.instantConfirm' : 'biz.manualApproval')}
          </span>
        </div>
        <div className="between pro-card-foot">
          {/* No menu yet is not "from ৳0" — it is a business that has not set
              its prices, and saying so is more use than a fake number. */}
          <span className="caption">
            {pro.priceFrom === null
              ? t('biz.noPricesYet')
              : <>{t('biz.from')} <strong>{formatBdt(pro.priceFrom)}</strong></>}
          </span>
          <Button size="sm" onClick={book}>{label}</Button>
        </div>
      </div>
    </article>
  );
}
