import { Check, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Hairstyle } from '../../types';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { cn } from '../../utils/cn';
import { formatCompact, formatRating } from '../../utils/format';
import { Art } from './Art';
import { hairstyleArt } from './hairstyleArt';
import { Badge } from './Badge';

interface HairstyleCardProps {
  style: Hairstyle;
  size?: 'sm' | 'md';
  /** When set the card is a button (style picker) instead of a link. */
  onSelect?: (style: Hairstyle) => void;
  selected?: boolean;
  badge?: string;
  className?: string;
}

export function HairstyleCard({ style, size = 'md', onSelect, selected, badge, className }: HairstyleCardProps) {
  const t = useT();
  const body = (
    <Art
      tone={style.tone}
      ratio="portrait"
      src={hairstyleArt(style.id, style.tone)}
      alt={t('style.portraitAlt', { name: style.name })}
      className="hs-art"
    >
      {badge ? <div className="art-corner"><Badge tone="solid" plain pill>{badge}</Badge></div> : null}
      {style.trending && !badge ? (
        <div className="art-corner"><Badge tone="dark" plain pill>{t('biz.trending')}</Badge></div>
      ) : null}
      {/* Ticked in a picker. The border alone was easy to miss on a busy
          grid, and a picker is the one place being sure matters. */}
      {onSelect && selected ? (
        <span className="hs-tick" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
      ) : null}
      <div className="art-overlay">
        <span className="hs-name">{style.name}</span>
        <span className="hs-meta">
          <span><Sparkles size={12} aria-hidden="true" /> {formatCompact(style.tryOns)}</span>
          <span>★ {formatRating(style.rating)}</span>
        </span>
      </div>
    </Art>
  );
  const classes = cn('hs-card', `hs-card-${size}`, selected && 'hs-card-selected', className);
  if (onSelect) {
    return (
      <button type="button" className={classes} aria-pressed={selected} onClick={() => onSelect(style)}>
        {body}
      </button>
    );
  }
  return <Link to={ROUTES.hairstyle(style.id)} className={classes}>{body}</Link>;
}
