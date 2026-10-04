import { AlertTriangle, Scissors, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { Hairstyle } from '../../types';
import { ROUTES } from '../../constants';
import { BuyCreditsSheet } from '../../components/ai-tryon/BuyCreditsSheet';
import { CreditsPill } from '../../components/ai-tryon/CreditsPill';
import { ProcessingScreen } from '../../components/ai-tryon/ProcessingScreen';
import { aiErrorKey } from '../../components/ai-tryon/tryonActions';
import { Art } from '../../components/common/Art';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { HairstyleCard } from '../../components/common/HairstyleCard';
import { Input } from '../../components/common/Input';
import { SectionHead } from '../../components/common/SectionHead';
import { Skeleton } from '../../components/common/Skeleton';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useHairstyles } from '../../hooks/useHairstyles';
import { useT } from '../../hooks/useLanguage';
import { usePhotoUrl } from '../../hooks/usePhotoUrl';
import { useAppStore } from '../../store/useAppStore';
import { useTryOnStore, type PendingVideo } from '../../store/useTryOnStore';
import { ApiError } from '../../utils/apiError';
import { nextId } from '../../utils/id';
import { photoStore } from '../../utils/storage';
import { tryOnVideoService, waitForVideo } from '../../utils/tryOnVideoService';

export default function StyleSelectPage() {
  const photoKey = useTryOnStore((s) => s.photoKey);
  const pending = useTryOnStore((s) => s.pending);
  // A video still being made outranks a missing photo: it is resumed, not lost.
  const key = photoKey ?? pending?.sourceKey;
  if (!key) return <Navigate to={ROUTES.tryOnUpload} replace />;
  return <StyleSelect photoKey={key} />;
}

const isAbort = (error: unknown) => (error as DOMException)?.name === 'AbortError';

function StyleSelect({ photoKey }: { photoKey: string }) {
  const t = useT();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const toast = useAppStore((s) => s.toast);
  const spendCredit = useAppStore((s) => s.spendCredit);
  const addGeneration = useAppStore((s) => s.addGeneration);
  const stage = useTryOnStore((s) => s.stage);
  const setStage = useTryOnStore((s) => s.setStage);
  const setPhotoKey = useTryOnStore((s) => s.setPhotoKey);
  const setSelectedHairstyle = useTryOnStore((s) => s.setSelectedHairstyle);
  const setPending = useTryOnStore((s) => s.setPending);
  const { url } = usePhotoUrl(photoKey);
  /* The admin's active styles — the only catalogue the try-on offers. Fetched
     on every visit, so a style the admin has just added is here and one just
     switched off is not. */
  const {
    hairstyles: catalogue,
    loading: catalogueLoading,
    failed: catalogueFailed,
    reload: reloadCatalogue,
  } = useHairstyles();

  const [query, setQuery] = useState('');
  /** The style being made, and the styled still once there is one. */
  const [busy, setBusy] = useState<{ styleName: string; posterKey?: string } | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [waiting, setWaiting] = useState<Hairstyle | null>(null);
  /** A style chosen before this screen (hairstyle detail, the home row). */
  const [autoStyleId] = useState(() => useTryOnStore.getState().selectedHairstyleId);
  const { url: posterUrl } = usePhotoUrl(busy?.posterKey);
  const working = useRef(false);
  const autoRan = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const credits = user?.credits ?? 0;

  // Leaving the screen stops the polling, not the video: the job stays in the
  // session and the next visit picks it up where this one left off.
  useEffect(() => () => abort.current?.abort(), []);

  /** Wait for a started video, keep it on the device, open it. One credit,
      spent only for a video that actually arrived. */
  const finish = useCallback(
    async (job: PendingVideo, signal: AbortSignal) => {
      setStage('filming');
      await waitForVideo(job.jobId, signal);
      const clip = await tryOnVideoService.content(job.jobId);
      const videoKey = `video:${job.generationId}`;
      await photoStore.put(videoKey, clip);
      spendCredit();
      addGeneration({
        id: job.generationId,
        hairstyleId: job.hairstyleId,
        hairstyleName: job.hairstyleName,
        createdAt: new Date().toISOString(),
        // A curated style says nothing about the length or texture it needs,
        // so there is nothing to judge it against: the "cannot tell" middle.
        feasibility: 'moderate',
        sourceKey: job.sourceKey,
        resultKey: job.posterKey,
        videoKey,
        origin: 'catalogue',
        model: job.videoModel,
      });
      setPending(null);
      setStage('done');
      navigate(ROUTES.tryOnPreview(job.generationId), { replace: true });
    },
    [setStage, spendCredit, addGeneration, setPending, navigate],
  );

  /** Anything but leaving the screen ends the job and says why. */
  const fail = useCallback(
    (error: unknown, job?: PendingVideo) => {
      if (isAbort(error)) return;
      if (job) {
        setPending(null);
        void photoStore.remove(job.posterKey);
      }
      setStage('idle');
      if (error instanceof ApiError && error.code === 'missing_photo') {
        toast('error', t('tryon.photoGoneTitle'), t('tryon.photoGoneBody'));
        setPhotoKey(null);
        navigate(ROUTES.tryOnUpload, { replace: true });
        return;
      }
      if (error instanceof ApiError && error.code === 'hairstyle_unavailable') {
        toast('error', t('tryon.renderFailedTitle'), t('tryon.errorStyleGone'));
        reloadCatalogue();
        return;
      }
      toast('error', t('tryon.renderFailedTitle'), t(aiErrorKey(error)));
    },
    [setPending, setStage, setPhotoKey, toast, t, navigate, reloadCatalogue],
  );

  const generate = useCallback(
    async (style: Hairstyle) => {
      if (working.current) return;
      working.current = true;
      const controller = new AbortController();
      abort.current = controller;
      setBusy({ styleName: style.name });
      setStage('styling');
      let job: PendingVideo | undefined;
      try {
        const source = await photoStore.get(photoKey);
        if (!source) throw new ApiError('missing_photo', 'The photo is no longer on this device.');
        const started = await tryOnVideoService.start(source, style.id);
        const generationId = nextId('GEN');
        job = {
          generationId,
          jobId: started.job.id,
          hairstyleId: style.id,
          hairstyleName: started.job.hairstyleName || style.name,
          sourceKey: photoKey,
          posterKey: `result:${generationId}`,
          videoModel: started.job.videoModel,
        };
        // The styled still: the poster while it films, the result's tile after.
        await photoStore.put(job.posterKey, started.poster ?? source);
        setPending(job);
        setBusy({ styleName: job.hairstyleName, posterKey: job.posterKey });
        await finish(job, controller.signal);
      } catch (error) {
        fail(error, job);
      } finally {
        if (!controller.signal.aborted) setBusy(null);
        working.current = false;
      }
    },
    [photoKey, setStage, setPending, finish, fail],
  );

  // Pick up a video that was still being made when the screen was last left.
  // The job is claimed inside the timer, not before it: StrictMode mounts,
  // unmounts and mounts again, and a claim made by the first mount would
  // leave the second one believing the work was already under way.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const job = useTryOnStore.getState().pending;
      if (!job || working.current) return;
      working.current = true;
      const controller = new AbortController();
      abort.current = controller;
      setBusy({ styleName: job.hairstyleName, posterKey: job.posterKey });
      finish(job, controller.signal)
        .catch((error: unknown) => fail(error, job))
        .finally(() => {
          if (!controller.signal.aborted) setBusy(null);
          working.current = false;
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [finish, fail]);

  const select = useCallback(
    (style: Hairstyle) => {
      if (working.current) return;
      if (credits < 1) {
        setWaiting(style);
        setBuyOpen(true);
        return;
      }
      void generate(style);
    },
    [credits, generate],
  );

  // Auto-start once when a style was chosen before arriving here, looked up
  // in the admin's list as it is now: a style switched off since it was
  // picked is simply not started.
  useEffect(() => {
    if (!autoStyleId || autoRan.current || catalogueLoading) return;
    const timer = window.setTimeout(() => {
      autoRan.current = true;
      setSelectedHairstyle(null);
      const style = catalogue.find((item) => item.id === autoStyleId);
      if (style) select(style);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoStyleId, catalogue, catalogueLoading, select, setSelectedHairstyle]);

  const q = query.trim().toLowerCase();
  const styles = catalogue.filter((style) => !q || `${style.name} ${style.category}`.toLowerCase().includes(q));

  if (busy) {
    return (
      <Screen>
        <ProcessingScreen photoUrl={posterUrl ?? url} styleName={busy.styleName} stage={stage} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title={t('tryon.chooseStyle')}
        back
        actions={
          <Link
            to={ROUTES.tryOnUpload}
            className="tryon-photo-chip"
            aria-label={t('tryon.changePhoto')}
            title={t('tryon.changePhoto')}
          >
            <Art ratio="circle" src={url} tone={2} className="tryon-photo-chip-art" />
          </Link>
        }
      />
      <ScreenBody className="stagger">
        <div className="between tryon-bar">
          <CreditsPill credits={credits} />
          {credits < 2 ? (
            <button type="button" className="link-btn" onClick={() => setBuyOpen(true)}>
              {t('tryon.buyCredits')}
            </button>
          ) : null}
        </div>

        <p className="caption">{t('tryon.selectIntro')}</p>

        <section className="section tryon-chapter">
          <SectionHead title={t('tryon.allStyles')} />
          <Input
            icon={<Search size={18} aria-hidden="true" />}
            placeholder={t('tryon.searchStyles')}
            aria-label={t('tryon.searchStyles')}
            inputMode="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {catalogueLoading ? (
            <div className="grid-2" aria-busy="true">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} height="14rem" radius="var(--radius-lg)" />
              ))}
            </div>
          ) : catalogueFailed ? (
            <EmptyState
              icon={<AlertTriangle size={24} aria-hidden="true" />}
              title={t('state.loadFailedTitle')}
              description={catalogueFailed}
              action={
                <Button variant="secondary" size="sm" onClick={reloadCatalogue}>
                  {t('state.retry')}
                </Button>
              }
            />
          ) : !catalogue.length ? (
            <EmptyState
              icon={<Scissors size={24} aria-hidden="true" />}
              title={t('tryon.catalogueEmpty')}
              description={t('tryon.catalogueEmptyBody')}
            />
          ) : styles.length ? (
            <div className="grid-2">
              {styles.map((style) => (
                <HairstyleCard key={style.id} style={style} onSelect={select} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Search size={24} aria-hidden="true" />}
              title={t('tryon.noStyles')}
              description={t('tryon.noStylesBody')}
              action={
                <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                  {t('action.clearFilters')}
                </Button>
              }
            />
          )}
        </section>
      </ScreenBody>

      <BuyCreditsSheet
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        onPurchased={() => {
          if (waiting) void generate(waiting);
          setWaiting(null);
        }}
      />
    </Screen>
  );
}
