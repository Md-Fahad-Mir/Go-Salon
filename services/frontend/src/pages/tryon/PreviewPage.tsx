import { Download, ImageOff, MoreVertical, Orbit, RefreshCw, Share2, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AIGeneration, Feedback } from '../../types';
import { DEFAULT_LOCATION, ROUTES } from '../../constants';
import { AngleViewer } from '../../components/ai-tryon/AngleViewer';
import { CompareSlider } from '../../components/ai-tryon/CompareSlider';
import { FeasibilityCallout } from '../../components/ai-tryon/FeasibilityCallout';
import { downloadGeneration, shareGeneration } from '../../components/ai-tryon/tryonActions';
import { ActionSheet } from '../../components/common/ActionSheet';
import { Badge } from '../../components/common/Badge';
import { Segmented } from '../../components/common/Tabs';
import { Button, LinkButton } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { IconButton } from '../../components/common/IconButton';
import { ProfessionalCard } from '../../components/common/ProfessionalCard';
import { CardSkeleton } from '../../components/common/Skeleton';
import { SectionHead } from '../../components/common/SectionHead';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { FooterRow, StickyFooter } from '../../components/layout/StickyFooter';
import { useT } from '../../hooks/useLanguage';
import { usePhotoUrl } from '../../hooks/usePhotoUrl';
import { useNearby } from '../../hooks/useNearby';
import { useAppStore } from '../../store/useAppStore';
import { useTryOnStore } from '../../store/useTryOnStore';
import { angleSpec } from '../../utils/angles';
import { formatNumber, formatRelative } from '../../utils/format';
import { photoStore } from '../../utils/storage';

export default function PreviewPage() {
  const t = useT();
  const { id = '' } = useParams();
  const generation = useAppStore((s) => s.generations.find((g) => g.id === id));

  if (!generation) {
    return (
      <Screen>
        <Header title={t('tryon.resultTitle')} back backTo={ROUTES.tryOn} />
        <ScreenBody>
          <EmptyState
            icon={<ImageOff size={24} aria-hidden="true" />}
            title={t('tryon.resultGoneTitle')}
            description={t('tryon.resultGoneBody')}
            action={<LinkButton to={ROUTES.tryOn}>{t('tryon.tryAStyle')}</LinkButton>}
          />
        </ScreenBody>
      </Screen>
    );
  }

  return <Preview generation={generation} />;
}

function Preview({ generation }: { generation: AIGeneration }) {
  const t = useT();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const generations = useAppStore((s) => s.generations);
  const setGenerationFeedback = useAppStore((s) => s.setGenerationFeedback);
  const removeGeneration = useAppStore((s) => s.removeGeneration);
  const toast = useAppStore((s) => s.toast);
  const photoKey = useTryOnStore((s) => s.photoKey);
  const setPhotoKey = useTryOnStore((s) => s.setPhotoKey);
  const before = usePhotoUrl(generation.sourceKey);
  const after = usePhotoUrl(generation.resultKey);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  /* A 360 result has no draggable divider — the drag is the rotation — so
     before/after becomes a switch instead. */
  const [side, setSide] = useState<'after' | 'before'>('after');

  const views = generation.views ?? [];
  const isRing = views.length > 0;

  const origin = user?.location ?? DEFAULT_LOCATION;
  /* Places near this customer. Nothing links a hairstyle to a price list yet,
     so this cannot claim to be "the people who do this cut". */
  const { list: pros, loading: prosLoading } = useNearby(origin, 4);

  const tryAnother = () => {
    setPhotoKey(generation.sourceKey);
    navigate(ROUTES.tryOnSelect);
  };

  const bookLook = () => {
    if (pros.length === 1) {
      navigate(ROUTES.bookingStaff(pros[0].id), { state: { hairstyleId: generation.hairstyleId } });
      return;
    }
    // An AI pick is not in the catalogue, so there is nothing to filter by —
    // the customer asks for it by name at the salon.
    // Was a jump into cross-salon search for somewhere that does this style.
    // That is withdrawn, so this goes to the salons they have joined instead.
    navigate(ROUTES.home);
  };

  const download = async () => {
    const ok = await downloadGeneration(generation);
    if (ok) toast('success', t('tryon.toastPhotoSaved'), t('tryon.toastPhotoSavedBody'));
    else toast('error', t('tryon.toastPhotoGone'), t('tryon.toastPhotoGoneBody'));
  };

  const share = async () => {
    setSharing(true);
    const outcome = await shareGeneration(generation, t);
    setSharing(false);
    if (outcome === 'copied') toast('success', t('tryon.toastCopied'), t('tryon.toastCopiedBody'));
    else if (outcome === 'failed') toast('error', t('tryon.toastShareFailed'), t('tryon.toastShareFailedBody'));
    else if (outcome === 'missing') toast('error', t('tryon.toastPhotoGone'), t('tryon.toastPhotoGoneBody'));
  };

  const rate = (value: Feedback) =>
    setGenerationFeedback(generation.id, generation.feedback === value ? undefined : value);

  const remove = async () => {
    setDeleting(true);
    const sourceShared = generations.some((g) => g.id !== generation.id && g.sourceKey === generation.sourceKey);
    // Every render this result owns, not just the headline one: a 360 preview
    // is four or more blobs, and the rest would be orphaned in IndexedDB.
    await Promise.all([
      photoStore.remove(generation.resultKey),
      ...views.map((view) => photoStore.remove(view.resultKey)),
    ]);
    if (!sourceShared) {
      // The captures are the customer's own photos; a shared front photo still
      // belongs to another result, so only the unshared ones go.
      await Promise.all([
        photoStore.remove(generation.sourceKey),
        ...views.map((view) => photoStore.remove(view.sourceKey)),
      ]);
      if (photoKey === generation.sourceKey) setPhotoKey(null);
    }
    removeGeneration(generation.id);
    toast('success', t('tryon.resultDeleted'));
    navigate(ROUTES.tryOn, { replace: true });
  };

  return (
    <Screen>
      <Header
        title={t('tryon.resultTitle')}
        back
        backTo={ROUTES.tryOn}
        actions={
          <>
            <IconButton label={t('tryon.savePhoto')} onClick={() => void download()}>
              <Download size={22} />
            </IconButton>
            <IconButton label={t('action.share')} onClick={() => void share()} disabled={sharing}>
              <Share2 size={22} />
            </IconButton>
            <IconButton label={t('tryon.moreOptions')} onClick={() => setMenuOpen(true)}>
              <MoreVertical size={22} />
            </IconButton>
          </>
        }
      />
      <ScreenBody className="stagger">
        {isRing ? (
          <>
            <AngleViewer
              views={views}
              styleName={generation.hairstyleName}
              showOriginal={side === 'before'}
            />
            <Segmented
              tabs={[
                { id: 'after', label: t('tryon.after') },
                { id: 'before', label: t('tryon.before') },
              ]}
              active={side}
              onChange={setSide}
              label={t('tryon.compareLabel')}
            />
          </>
        ) : (
          <CompareSlider
            beforeUrl={before.url}
            afterUrl={after.url}
            loading={before.loading || after.loading}
            missing={before.missing || after.missing}
            styleName={generation.hairstyleName}
          />
        )}

        <div className="between tryon-meta">
          <Badge tone="accent" plain pill className="tryon-credits">
            <Sparkles size={14} aria-hidden="true" /> {generation.hairstyleName}
          </Badge>
          <span className="small dim">{formatRelative(generation.createdAt)}</span>
        </div>

        {isRing ? (
          <p className="caption tryon-why">
            <Orbit size={14} aria-hidden="true" />{' '}
            {t('tryon.ringRendered', {
              count: formatNumber(views.length),
              angles: views.map((view) => t(angleSpec(view.angle).label)).join(' · '),
            })}
          </p>
        ) : null}

        {generation.whyItSuits ? <p className="caption tryon-why">{generation.whyItSuits}</p> : null}

        <FeasibilityCallout feasibility={generation.feasibility} />

        <section className="section tryon-chapter tryon-feedback">
          <h3>{t('tryon.feedbackTitle')}</h3>
          <div className="row">
            <Button
              variant="outline"
              block
              icon={<ThumbsUp size={18} aria-hidden="true" />}
              aria-pressed={generation.feedback === 'like'}
              onClick={() => rate('like')}
            >
              {t('tryon.like')}
            </Button>
            <Button
              variant="outline"
              block
              icon={<ThumbsDown size={18} aria-hidden="true" />}
              aria-pressed={generation.feedback === 'dislike'}
              onClick={() => rate('dislike')}
            >
              {t('tryon.notForMe')}
            </Button>
          </div>
        </section>

        <section className="section tryon-chapter">
          <SectionHead title={t('tryon.prosTitle')} />
          {prosLoading ? (
            <CardSkeleton count={2} />
          ) : pros.length ? (
            <div className="stack-sm">
              {pros.map((pro) => (
                <ProfessionalCard key={pro.id} pro={pro} variant="row" hairstyleId={generation.hairstyleId} bookLabel={t('action.book')} />
              ))}
            </div>
          ) : (
            <p className="caption">{t('tryon.prosEmpty')}</p>
          )}
        </section>
      </ScreenBody>

      <StickyFooter>
        <FooterRow>
          <Button variant="secondary" onClick={tryAnother}>
            {t('tryon.tryAnother')}
          </Button>
          <Button onClick={bookLook}>{t('tryon.bookLook')}</Button>
        </FooterRow>
      </StickyFooter>

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          { label: t('tryon.tryAnotherStyle'), icon: <RefreshCw size={20} aria-hidden="true" />, onSelect: tryAnother },
          {
            label: t('tryon.deleteResult'),
            icon: <Trash2 size={20} aria-hidden="true" />,
            danger: true,
            onSelect: () => setConfirmDelete(true),
          },
        ]}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title={t('tryon.deleteResultTitle')}
        description={t('tryon.deleteResultBody')}
        confirmLabel={t('action.delete')}
        tone="danger"
        loading={deleting}
        icon={
          <span className="icon-circle icon-circle-danger">
            <Trash2 size={24} aria-hidden="true" />
          </span>
        }
      />
    </Screen>
  );
}
