import { Scissors, Share2, Sparkles } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Art } from '../components/common/Art';
import { Badge } from '../components/common/Badge';
import { Button, LinkButton } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { IconButton } from '../components/common/IconButton';
import { Rating } from '../components/common/Rating';
import { FeasibilityCallout } from '../components/home/FeasibilityCallout';
import { FACE_SHAPE_KEYS, OCCASION_KEYS, UPKEEP_KEYS } from '../components/home/labels';
import { HAIR_TYPE_KEYS } from '../components/auth/labels';
import { Header } from '../components/layout/Header';
import { Screen, ScreenBody } from '../components/layout/Screen';
import { FooterRow, StickyFooter } from '../components/layout/StickyFooter';
import { OCCASIONS, ROUTES } from '../constants';
import { useT } from '../hooks/useLanguage';
import { getHairstyle } from '../mockData';
import { useAppStore } from '../store/useAppStore';
import { useTryOnStore } from '../store/useTryOnStore';
import { formatCompact } from '../utils/format';
import { shareOrCopy } from '../utils/share';

const UPKEEP_TONES = { low: 'success', medium: 'warning', high: 'coral' } as const;

export default function HairstyleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();
  const user = useAppStore((s) => s.user);
  const toast = useAppStore((s) => s.toast);
  const style = id ? getHairstyle(id) : undefined;

  if (!style || !id) {
    return (
      <Screen nav>
        <Header back title={t('home.hairstyleTitle')} />
        <ScreenBody>
          <EmptyState
            icon={<Scissors size={26} />}
            title={t('home.styleNotFound')}
            description={t('home.styleNotFoundBody')}
            action={
              <LinkButton to={ROUTES.home} replace>
                {t('action.backToHome')}
              </LinkButton>
            }
          />
        </ScreenBody>
      </Screen>
    );
  }

  const occasions = OCCASIONS.filter((o) => style.occasions.includes(o.id));

  const share = async () => {
    const result = await shareOrCopy({
      title: t('home.shareTitle', { name: style.name }),
      text: t('home.shareText', { name: style.name }),
    });
    if (result === 'copied') toast('success', t('home.linkCopied'), t('home.linkCopiedBody'));
    else if (result === 'failed') toast('error', t('home.shareFailed'), t('home.shareFailedBody'));
  };

  const tryOn = () => {
    useTryOnStore.getState().setSelectedHairstyle(id);
    navigate(ROUTES.tryOnUpload, { state: { hairstyleId: id } });
  };

  return (
    <Screen nav>
      <Header
        transparent
        back
        actions={
          <IconButton label={t('home.shareStyle')} variant="scrim" onClick={() => void share()}>
            <Share2 size={20} />
          </IconButton>
        }
      />
      <ScreenBody flush>
        <Art tone={style.tone} ratio="portrait" flat className="hs-detail-hero" alt={t('home.styleHeroAlt', { name: style.name })}>
          {style.trending ? (
            <div className="art-corner hs-detail-corner">
              <Badge tone="dark" plain pill>
                {t('home.trendingBadge')}
              </Badge>
            </div>
          ) : null}
          <div className="art-overlay hs-detail-overlay" aria-hidden="true" />
        </Art>

        <div className="hs-detail-body">
          <div className="stack-sm">
            <h2>{style.name}</h2>
            <div className="hs-detail-meta">
              <Badge tone="accent" plain pill>
                {style.category}
              </Badge>
              <Rating value={style.rating} />
              <span className="hs-detail-tryons">
                <Sparkles size={14} aria-hidden="true" /> {t('biz.tryOns', { count: formatCompact(style.tryOns) })}
              </span>
              <Badge tone={UPKEEP_TONES[style.maintenance]} pill>
                {t(UPKEEP_KEYS[style.maintenance])}
              </Badge>
            </div>
            <p className="body">{style.description}</p>
          </div>

          <FeasibilityCallout user={user} style={style} />

          <section className="section hs-section">
            <h3>{t('home.worksWith')}</h3>
            <dl className="hs-detail-facts stagger">
              <div className="hs-detail-fact">
                <dt className="label">{t('home.faceShapes')}</dt>
                <dd className="chips hs-detail-chips">
                  {style.faceShapes.map((shape) => (
                    <Badge key={shape} tone="neutral" plain pill>
                      {t(FACE_SHAPE_KEYS[shape])}
                    </Badge>
                  ))}
                </dd>
              </div>
              <div className="hs-detail-fact">
                <dt className="label">{t('home.hairTypes')}</dt>
                <dd className="chips hs-detail-chips">
                  {style.hairTypes.map((type) => (
                    <Badge key={type} tone="neutral" plain pill>
                      {t(HAIR_TYPE_KEYS[type])}
                    </Badge>
                  ))}
                </dd>
              </div>
              <div className="hs-detail-fact">
                <dt className="label">{t('home.occasions')}</dt>
                <dd className="chips hs-detail-chips">
                  {occasions.map((option) => (
                    <Badge key={option.id} tone="neutral" plain pill>
                      {t(OCCASION_KEYS[option.id])}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </section>

        </div>
      </ScreenBody>

      <StickyFooter>
        <FooterRow>
          <Button onClick={tryOn} icon={<Sparkles size={18} aria-hidden="true" />}>
            {t('home.tryItOn')}
          </Button>
        </FooterRow>
      </StickyFooter>
    </Screen>
  );
}
