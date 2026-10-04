import { Camera, HistoryIcon, ImageIcon, ImageOff, Orbit } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Hairstyle } from '../../types';
import { ROUTES } from '../../constants';
import { AiHero } from '../../components/ai-tryon/AiHero';
import { BuyCreditsSheet } from '../../components/ai-tryon/BuyCreditsSheet';
import { CreditsPill } from '../../components/ai-tryon/CreditsPill';
import { GenerationCard } from '../../components/ai-tryon/GenerationCard';
import { PhotoTipsSheet } from '../../components/ai-tryon/PhotoTipsSheet';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { HairstyleCard } from '../../components/common/HairstyleCard';
import { IconButton } from '../../components/common/IconButton';
import { SectionHead } from '../../components/common/SectionHead';
import { Skeleton } from '../../components/common/Skeleton';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useHairstyles } from '../../hooks/useHairstyles';
import { useT } from '../../hooks/useLanguage';
import type { TKey } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { PreferenceButtons } from '../../components/home/PreferenceButtons';
import { useTryOnStore } from '../../store/useTryOnStore';
import { formatNumber } from '../../utils/format';

const STEPS: TKey[] = ['tryon.step1', 'tryon.step2', 'tryon.step3'];

export default function TryOnHomePage() {
  const t = useT();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const generations = useAppStore((s) => s.generations);
  const photoKey = useTryOnStore((s) => s.photoKey);
  const setSelectedHairstyle = useTryOnStore((s) => s.setSelectedHairstyle);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  /* The admin's catalogue, and only it. A failed or empty fetch drops the row
     rather than the screen: the try-on itself starts from the buttons above,
     and the style picker says why there is nothing to choose. */
  const { hairstyles, loading } = useHairstyles();

  const credits = user?.credits ?? 0;
  const recent = generations.slice(0, 3);

  const startWith = (mode: 'camera' | 'gallery') => navigate(ROUTES.tryOnUpload, { state: { mode } });

  /** A style picked before a photo exists: remember it, then get the photo. */
  const pickStyle = (style: Hairstyle) => {
    setSelectedHairstyle(style.id);
    if (photoKey) navigate(ROUTES.tryOnSelect);
    else navigate(ROUTES.tryOnUpload, { state: { mode: 'camera', hairstyleId: style.id } });
  };

  return (
    <Screen nav>
      <Header
        title={t('nav.tryOn')}
        actions={
          <>
            {/* A salon's staff have no Settings: every tab of theirs carries
                light/dark and language. A customer's are on their Home. */}
            {user?.role === 'customer' ? null : <PreferenceButtons />}
            <IconButton label={t('tryon.historyAction')} onClick={() => navigate(ROUTES.tryOnHistory)}>
              <HistoryIcon size={22} />
            </IconButton>
          </>
        }
      />
      <ScreenBody className="stagger">
        <AiHero />

        <div className="between tryon-bar">
          <CreditsPill credits={credits} />
          <Button variant="ghost" size="sm" onClick={() => setBuyOpen(true)}>
            {t('tryon.buyCredits')}
          </Button>
        </div>

        {/* Two ways in, named for what the customer gets rather than for what
            the app does: one photo and one render, or a walk round the head
            and a preview that turns. */}
        <div className="stack-sm tryon-cta">
          <div className="tryon-mode" data-mode="single">
            <div className="tryon-mode-copy">
              <strong>{t('tryon.modeSingle')}</strong>
              <span className="caption">{t('tryon.modeSingleBody')}</span>
            </div>
            <div className="stack-sm">
              <Button block size="lg" icon={<Camera size={20} aria-hidden="true" />} onClick={() => startWith('camera')}>
                {t('tryon.takeSelfie')}
              </Button>
              <Button
                block
                size="lg"
                variant="secondary"
                icon={<ImageIcon size={20} aria-hidden="true" />}
                onClick={() => startWith('gallery')}
              >
                {t('tryon.choosePhoto')}
              </Button>
            </div>
          </div>

          <div className="tryon-mode" data-mode="360">
            <div className="tryon-mode-copy">
              <strong>{t('tryon.mode360')}</strong>
              <span className="caption">{t('tryon.mode360Body')}</span>
            </div>
            <Button
              block
              size="lg"
              variant="outline"
              icon={<Orbit size={20} aria-hidden="true" />}
              onClick={() => navigate(ROUTES.tryOnCapture360)}
            >
              {t('tryon.start360')}
            </Button>
          </div>

          <button type="button" className="link-btn tryon-center-link" onClick={() => setTipsOpen(true)}>
            {t('tryon.tipsTitle')}
          </button>
        </div>

        <section className="section tryon-chapter">
          <SectionHead title={t('tryon.howItWorks')} />
          <ol className="checklist tryon-steps">
            {STEPS.map((step, index) => (
              <li key={step}>
                <span className="num" aria-hidden="true">{formatNumber(index + 1)}</span>
                <span>{t(step)}</span>
              </li>
            ))}
          </ol>
        </section>

        {loading || hairstyles.length ? (
          <section className="section tryon-chapter">
            <SectionHead title={t('tryon.allStyles')} />
            <div className="hscroll bleed" aria-busy={loading || undefined}>
              {loading
                ? [0, 1, 2].map((index) => (
                    <Skeleton key={index} width="8.5rem" height="11.33rem" radius="var(--radius-lg)" />
                  ))
                : hairstyles.map((style) => (
                    <HairstyleCard key={style.id} style={style} size="sm" onSelect={pickStyle} />
                  ))}
            </div>
          </section>
        ) : null}

        <section className="section tryon-chapter">
          <SectionHead title={t('tryon.recentResults')} action={{ label: t('action.seeAll'), to: ROUTES.tryOnHistory }} />
          {recent.length ? (
            <div className="grid-3">
              {recent.map((generation) => (
                <GenerationCard key={generation.id} generation={generation} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ImageOff size={24} aria-hidden="true" />}
              title={t('tryon.emptyTitle')}
              description={t('tryon.emptyHomeBody')}
              className="tryon-empty-compact"
            />
          )}
        </section>
      </ScreenBody>

      <PhotoTipsSheet open={tipsOpen} onClose={() => setTipsOpen(false)} />
      <BuyCreditsSheet open={buyOpen} onClose={() => setBuyOpen(false)} />
    </Screen>
  );
}
