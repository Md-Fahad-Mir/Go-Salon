import { Sparkles } from 'lucide-react';
import { AI_HOME_PHOTO, ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { formatNumber } from '../../utils/format';
import { Art } from '../common/Art';
import { Badge } from '../common/Badge';
import { LinkButton } from '../common/Button';

interface HeroCardProps {
  credits: number;
}

/** The home hero: one big invitation to try a style. The button is the only
    link; its ::after stretches over the card so the whole thing is tappable
    without nesting interactive elements. */
export function HeroCard({ credits }: HeroCardProps) {
  const t = useT();
  return (
    <div className="home-hero">
      <Art tone={5} ratio="banner" src={AI_HOME_PHOTO} alt="" className="home-hero-art">
        <div className="art-corner-end">
          <Badge tone="dark" plain pill>
            <Sparkles size={12} aria-hidden="true" />{' '}
            {t(credits === 1 ? 'unit.credits_one' : 'unit.credits_other', { count: formatNumber(credits) })}
          </Badge>
        </div>
        <div className="art-overlay home-hero-overlay">
          <Badge tone="solid" plain pill>
            {t('home.heroBadge')}
          </Badge>
          <h3 className="home-hero-title">{t('home.heroTitle')}</h3>
          <p className="home-hero-sub">{t('home.heroSub')}</p>
          <LinkButton to={ROUTES.tryOn} size="sm" variant="light" className="home-hero-cta" icon={<Sparkles size={16} aria-hidden="true" />}>
            {t('home.heroCta')}
          </LinkButton>
        </div>
      </Art>
    </div>
  );
}
