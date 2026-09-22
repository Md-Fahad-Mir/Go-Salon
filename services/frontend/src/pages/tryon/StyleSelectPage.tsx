import { AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { Hairstyle, HairstyleRecommendation, Occasion, TryOnStyle } from '../../types';
import { OCCASIONS, ROUTES } from '../../constants';
import { BuyCreditsSheet } from '../../components/ai-tryon/BuyCreditsSheet';
import { CreditsPill } from '../../components/ai-tryon/CreditsPill';
import { ProcessingScreen } from '../../components/ai-tryon/ProcessingScreen';
import { HairAnalysisCard } from '../../components/ai-tryon/HairAnalysisCard';
import { RecommendationCard } from '../../components/ai-tryon/RecommendationCard';
import { aiErrorKey, aiErrorKeyForCode } from '../../components/ai-tryon/tryonActions';
import { Art } from '../../components/common/Art';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Chip, ChipRow } from '../../components/common/Chip';
import { EmptyState } from '../../components/common/EmptyState';
import { HairstyleCard } from '../../components/common/HairstyleCard';
import { Input } from '../../components/common/Input';
import { SectionHead } from '../../components/common/SectionHead';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useT } from '../../hooks/useLanguage';
import { usePhotoUrl } from '../../hooks/usePhotoUrl';
import type { TKey } from '../../i18n';
import { getHairstyle, mockHairstyles } from '../../mockData';
import { useAppStore } from '../../store/useAppStore';
import { useTryOnStore } from '../../store/useTryOnStore';
import { ApiError, api } from '../../utils/api';
import { nextId } from '../../utils/id';
import { hairstylesForGender } from '../../utils/audience';
import { styleFromHairstyle, styleFromRecommendation } from '../../utils/recommend';
import { photoStore } from '../../utils/storage';
import { anglesToRender, renderRing } from '../../utils/threeSixty';

type OccasionFilter = 'all' | Occasion;

/* OCCASIONS in src/constants is English, so the chips read their label here. */
const OCCASION_KEYS: Record<Occasion, TKey> = {
  casual: 'tryon.occasionCasual',
  formal: 'tryon.occasionFormal',
  wedding: 'tryon.occasionWedding',
  party: 'tryon.occasionParty',
  business: 'tryon.occasionBusiness',
  date: 'tryon.occasionDate',
};

/** What the screen is waiting on. Both are real requests to the AI service;
    a 360 render is several, so it also carries how far round it has got. */
type Busy =
  | { kind: 'analyzing' }
  | { kind: 'generating'; style: TryOnStyle; ring?: { done: number; total: number } }
  | null;

export default function StyleSelectPage() {
  const photoKey = useTryOnStore((s) => s.photoKey);
  if (!photoKey) return <Navigate to={ROUTES.tryOnUpload} replace />;
  return <StyleSelect photoKey={photoKey} />;
}

function StyleSelect({ photoKey }: { photoKey: string }) {
  const t = useT();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const catalogue = useMemo(() => hairstylesForGender(mockHairstyles, user?.gender), [user?.gender]);
  const toast = useAppStore((s) => s.toast);
  const spendCredit = useAppStore((s) => s.spendCredit);
  const addGeneration = useAppStore((s) => s.addGeneration);
  const mode = useTryOnStore((s) => s.mode);
  const capturedAngles = useTryOnStore((s) => s.angles);
  const analysis = useTryOnStore((s) => s.analysis);
  const analysisError = useTryOnStore((s) => s.analysisError);
  const setAnalysis = useTryOnStore((s) => s.setAnalysis);
  const setAnalysisError = useTryOnStore((s) => s.setAnalysisError);
  const setStage = useTryOnStore((s) => s.setStage);
  const setPhotoKey = useTryOnStore((s) => s.setPhotoKey);
  const setSelectedHairstyle = useTryOnStore((s) => s.setSelectedHairstyle);
  const { url } = usePhotoUrl(photoKey);

  const [occasion, setOccasion] = useState<OccasionFilter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [pending, setPending] = useState<TryOnStyle | null>(null);
  /** A style chosen before this screen (hairstyle detail, recommended row). */
  const [autoStyleId] = useState(() => useTryOnStore.getState().selectedHairstyleId);
  const working = useRef(false);
  const analysed = useRef(false);
  const autoRan = useRef(false);

  const credits = user?.credits ?? 0;
  /** The analysis belongs to one photo; a different one has to be read again. */
  const analysisReady = analysis?.photoKey === photoKey;
  const profile = analysisReady ? analysis?.profile : undefined;
  const isRing = mode === '360' && capturedAngles.length > 0;
  /* A 360 preview is one image-model call per angle, so it costs one credit
     per angle. The number is shown on the button rather than discovered at
     the till. */
  const ringSize = isRing ? anglesToRender(capturedAngles).length : 1;

  /** Sends the photo back to the upload screen when it is no longer on the device. */
  const handleMissingPhoto = useCallback(() => {
    toast('error', t('tryon.photoGoneTitle'), t('tryon.photoGoneBody'));
    setPhotoKey(null);
    navigate(ROUTES.tryOnUpload, { replace: true });
  }, [toast, t, setPhotoKey, navigate]);

  /* ── Stage 2: the real analysis ──────────────────────────────────────── */
  const runAnalysis = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    setBusy({ kind: 'analyzing' });
    setStage('analyzing');
    try {
      const source = await photoStore.get(photoKey);
      if (!source) throw new ApiError('missing_photo', 'The photo is no longer on this device.');
      /* A 360 run sends the whole ring in the one call: the crown, the nape
         and the side profile are only observations if the model sees them
         together with the face. */
      let ring: Array<{ angle: (typeof capturedAngles)[number]['angle']; photo: Blob }> | undefined;
      if (isRing) {
        const loaded = await Promise.all(
          capturedAngles.map(async (view) => {
            const blob = await photoStore.get(view.photoKey);
            return blob ? { angle: view.angle, photo: blob } : null;
          }),
        );
        const present = loaded.filter((view): view is NonNullable<typeof view> => view !== null);
        if (present.length) ring = present;
      }
      const result = await api.tryOn.analyze(
        source,
        {
          gender: user?.gender ?? 'unspecified',
          hairLength: user?.hairLength ?? 'unknown',
          occasion: occasion === 'all' ? 'everyday' : occasion,
        },
        photoKey,
        ring,
      );
      setAnalysis(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'missing_photo') {
        handleMissingPhoto();
        return;
      }
      // A failed read is not a dead end: the catalogue below still renders, so
      // the screen keeps the error in view rather than blocking on it.
      setAnalysisError(error instanceof ApiError ? error.code : 'unknown');
    } finally {
      setBusy(null);
      setStage('idle');
      working.current = false;
    }
  }, [photoKey, user, occasion, isRing, capturedAngles, setAnalysis, setAnalysisError, setStage, handleMissingPhoto]);

  /* ── Stage 4: the real render ────────────────────────────────────────── */
  const generate = useCallback(
    async (style: TryOnStyle) => {
      if (working.current) return;
      working.current = true;
      const id = nextId('GEN');
      setBusy({ kind: 'generating', style });
      setStage('generating');
      try {
        const source = await photoStore.get(photoKey);
        if (!source) throw new ApiError('missing_photo', 'The photo is no longer on this device.');
        /* Everything the analysis saw, handed to the render: the observed
           length is the ceiling the cut stays under, and the hairline is left
           where it is. Identical for one view and for eight. */
        const context = {
          gender: user?.gender,
          hairLength: user?.hairLength,
          occasion: occasion === 'all' ? undefined : occasion,
          faceShape: profile?.faceShape,
          hairTexture: profile?.hairTexture,
          hairColor: profile?.hairColor,
          hairLengthObserved: profile?.hairLengthObserved,
          currentHairstyle: profile?.currentHairstyle,
          hairline: profile?.hairline,
          hairDensity: profile?.hairDensity,
          beardStyle: profile?.hasBeard ? profile.beardStyle : undefined,
          hairLengthCategory: profile?.hairLengthCategory,
        };

        if (isRing) {
          const views = await renderRing({
            captured: capturedAngles,
            style,
            context,
            keyFor: (angle) => `result:${id}:${angle}`,
            onProgress: (progress) =>
              setBusy({ kind: 'generating', style, ring: { done: progress.done, total: progress.total } }),
          });
          // One credit per rendered angle, and only for the ones that landed.
          views.forEach(() => spendCredit());
          addGeneration({
            id,
            hairstyleId: style.id,
            hairstyleName: style.name,
            createdAt: new Date().toISOString(),
            feasibility: style.feasibility,
            // The front view stays the headline pair, so history, the tile and
            // the single-photo compare all keep working untouched.
            sourceKey: views[0].sourceKey,
            resultKey: views[0].resultKey,
            views,
            origin: style.origin,
            compatibilityScore: style.compatibilityScore,
            whyItSuits: style.whyItSuits,
          });
          setStage('done');
          navigate(ROUTES.tryOnPreview(id), { replace: true });
          return;
        }

        const render = await api.tryOn.generate(source, style, context);
        const resultKey = `result:${id}`;
        await photoStore.put(resultKey, render.blob);
        spendCredit();
        addGeneration({
          id,
          hairstyleId: style.id,
          hairstyleName: style.name,
          createdAt: new Date().toISOString(),
          feasibility: style.feasibility,
          sourceKey: photoKey,
          resultKey,
          origin: style.origin,
          compatibilityScore: style.compatibilityScore,
          whyItSuits: style.whyItSuits,
          model: render.model,
        });
        setStage('done');
        navigate(ROUTES.tryOnPreview(id), { replace: true });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'missing_photo') {
          handleMissingPhoto();
          return;
        }
        toast('error', t('tryon.renderFailedTitle'), t(aiErrorKey(error)));
        setStage('idle');
      } finally {
        setBusy(null);
        working.current = false;
      }
    },
    [
      photoKey,
      user,
      occasion,
      profile,
      isRing,
      capturedAngles,
      navigate,
      toast,
      spendCredit,
      addGeneration,
      setStage,
      handleMissingPhoto,
      t,
    ],
  );

  const select = useCallback(
    (style: TryOnStyle) => {
      if (working.current) return;
      if (credits < ringSize) {
        setPending(style);
        setBuyOpen(true);
        return;
      }
      void generate(style);
    },
    [credits, ringSize, generate],
  );

  const selectCatalogue = useCallback(
    (style: Hairstyle) => select(styleFromHairstyle(style, user, profile)),
    [select, user, profile],
  );

  const selectRecommendation = useCallback(
    (recommendation: HairstyleRecommendation, index: number) =>
      select(styleFromRecommendation(recommendation, index)),
    [select],
  );

  // Read the photo once per photo. Nothing else on this screen can start until
  // it finishes, so a second run would only be a second bill.
  useEffect(() => {
    if (analysisReady || analysisError || analysed.current) return;
    analysed.current = true;
    void runAnalysis();
  }, [analysisReady, analysisError, runAnalysis]);

  // Auto-start once when a style was chosen before arriving here — after the
  // analysis, so the render gets the same face and hair context as any other.
  useEffect(() => {
    if (!autoStyleId || autoRan.current) return;
    if (busy || (!analysisReady && !analysisError)) return;
    const timer = window.setTimeout(() => {
      autoRan.current = true;
      setSelectedHairstyle(null);
      const style = getHairstyle(autoStyleId);
      if (style) selectCatalogue(style);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoStyleId, busy, analysisReady, analysisError, selectCatalogue, setSelectedHairstyle]);

  const q = query.trim().toLowerCase();
  const styles = catalogue.filter(
    (style) =>
      (occasion === 'all' || style.occasions.includes(occasion)) &&
      (!q || `${style.name} ${style.category} ${style.tags.join(' ')}`.toLowerCase().includes(q)),
  );
  const recommendations = analysisReady ? (analysis?.recommendations ?? []) : [];

  if (busy) {
    return (
      <Screen>
        <ProcessingScreen
          photoUrl={url}
          styleName={busy.kind === 'generating' ? busy.style.name : undefined}
          stage={busy.kind === 'generating' ? 'generating' : 'analyzing'}
          ring={busy.kind === 'generating' ? busy.ring : undefined}
        />
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

        {analysisError && !analysisReady ? (
          <Callout
            tone="warning"
            icon={<AlertTriangle size={20} aria-hidden="true" />}
            title={t('tryon.analysisFailedTitle')}
          >
            {t(aiErrorKeyForCode(analysisError))} {t('tryon.analysisFailedBody')}
            <div className="stack-sm">
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw size={16} aria-hidden="true" />}
                onClick={() => {
                  setAnalysisError(null);
                  void runAnalysis();
                }}
              >
                {t('tryon.analysisRetry')}
              </Button>
            </div>
          </Callout>
        ) : null}

        {/* What the AI saw, before what it suggests — a consultation reads
            that way round, and the picks make sense once the read is on
            screen. A 360 run says so, because it has more to say. */}
        {profile && analysisReady ? (
          <HairAnalysisCard
            profile={profile}
            summary={analysis?.summary}
            angleCount={analysis?.angles?.length ?? 1}
          />
        ) : null}

        {recommendations.length ? (
          <section className="section tryon-picks">
            <SectionHead
              title={t('tryon.aiPicks')}
              action={
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setAnalysisError(null);
                    void runAnalysis();
                  }}
                >
                  {t('tryon.aiRefresh')}
                </button>
              }
            />
            <p className="caption">{isRing ? t('tryon.aiPicksBody360') : t('tryon.aiPicksBody')}</p>
            <div className="hscroll bleed">
              {recommendations.map((recommendation, index) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  tone={index}
                  onSelect={() => selectRecommendation(recommendation, index)}
                />
              ))}
            </div>
          </section>
        ) : null}

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
          <ChipRow scroll label={t('tryon.occasionLabel')}>
            <Chip active={occasion === 'all'} onClick={() => setOccasion('all')}>
              {t('tryon.occasionAll')}
            </Chip>
            {OCCASIONS.map((item) => (
              <Chip key={item.id} active={occasion === item.id} onClick={() => setOccasion(item.id)}>
                {t(OCCASION_KEYS[item.id])}
              </Chip>
            ))}
          </ChipRow>
          {styles.length ? (
            <div className="grid-2">
              {styles.map((style) => (
                <HairstyleCard key={style.id} style={style} onSelect={selectCatalogue} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Search size={24} aria-hidden="true" />}
              title={t('tryon.noStyles')}
              description={t('tryon.noStylesBody')}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setOccasion('all');
                  }}
                >
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
          if (pending) void generate(pending);
          setPending(null);
        }}
      />
    </Screen>
  );
}
