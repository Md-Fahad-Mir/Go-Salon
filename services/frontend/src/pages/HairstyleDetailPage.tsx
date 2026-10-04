import { AlertTriangle, Scissors, Share2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Hairstyle } from '../types';
import { Art } from '../components/common/Art';
import { Badge } from '../components/common/Badge';
import { Button, LinkButton } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { IconButton } from '../components/common/IconButton';
import { Spinner } from '../components/common/Spinner';
import { Header } from '../components/layout/Header';
import { Screen, ScreenBody } from '../components/layout/Screen';
import { FooterRow, StickyFooter } from '../components/layout/StickyFooter';
import { ROUTES } from '../constants';
import { useT } from '../hooks/useLanguage';
import { useAppStore } from '../store/useAppStore';
import { useTryOnStore } from '../store/useTryOnStore';
import { ApiError, api } from '../utils/api';
import { messageOf } from '../utils/errorMessage';
import { shareOrCopy } from '../utils/share';

/** What the request for this style came back with. A 404 is its own answer —
    the admin deleted the style or switched it off — and reads differently
    from a request that never got through. */
type Load =
  | { id: string; style: Hairstyle }
  | { id: string; missing: true }
  | { id: string; failed: string };

export default function HairstyleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();
  const toast = useAppStore((s) => s.toast);
  const [load, setLoad] = useState<Load | null>(null);
  const [attempt, setAttempt] = useState(0);

  /* Asked for on every visit: this screen shows the admin's catalogue as it
     is now, never a copy of it from an earlier one. */
  useEffect(() => {
    if (!id) return;
    let live = true;
    api.hairstyles
      .get(id)
      .then((style) => {
        if (live) setLoad({ id, style });
      })
      .catch((error: unknown) => {
        if (!live) return;
        if (error instanceof ApiError && error.status === 404) setLoad({ id, missing: true });
        else setLoad({ id, failed: messageOf(error) });
      });
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const current = load?.id === id ? load : null;

  if (id && !current) {
    return (
      <Screen nav>
        <Header back title={t('home.hairstyleTitle')} />
        <ScreenBody>
          <div className="fullscreen-center" aria-busy="true">
            <Spinner size="lg" label={t('state.loading')} />
          </div>
        </ScreenBody>
      </Screen>
    );
  }

  if (current && 'failed' in current) {
    return (
      <Screen nav>
        <Header back title={t('home.hairstyleTitle')} />
        <ScreenBody>
          <EmptyState
            icon={<AlertTriangle size={26} aria-hidden="true" />}
            title={t('state.loadFailedTitle')}
            description={current.failed}
            action={<Button onClick={() => setAttempt((n) => n + 1)}>{t('state.retry')}</Button>}
          />
        </ScreenBody>
      </Screen>
    );
  }

  if (!id || !current || !('style' in current)) {
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

  const style = current.style;

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
        <Art
          tone={style.tone}
          ratio="portrait"
          flat
          src={style.image || undefined}
          className="hs-detail-hero"
          alt={t('home.styleHeroAlt', { name: style.name })}
        >
          <div className="art-overlay hs-detail-overlay" aria-hidden="true" />
        </Art>

        <div className="hs-detail-body">
          <div className="stack-sm">
            <h2>{style.name}</h2>
            <div className="hs-detail-meta">
              <Badge tone="accent" plain pill>
                {style.category}
              </Badge>
            </div>
          </div>
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
