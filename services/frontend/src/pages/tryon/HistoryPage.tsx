import { ImageOff, MoreVertical, Share2, ThumbsUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { AIGeneration } from '../../types';
import { ROUTES } from '../../constants';
import { GenerationCard } from '../../components/ai-tryon/GenerationCard';
import { shareGeneration } from '../../components/ai-tryon/tryonActions';
import { ActionSheet } from '../../components/common/ActionSheet';
import { LinkButton } from '../../components/common/Button';
import { Chip, ChipRow } from '../../components/common/Chip';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { IconButton } from '../../components/common/IconButton';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useT } from '../../hooks/useLanguage';
import type { TFunction, TKey } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { useTryOnStore } from '../../store/useTryOnStore';
import { formatDayGroup, formatNumber } from '../../utils/format';
import { photoStore } from '../../utils/storage';

type Filter = 'all' | 'liked' | 'latest';

const FILTERS: Array<{ id: Filter; label: TKey }> = [
  { id: 'all', label: 'tryon.filterAll' },
  { id: 'liked', label: 'tryon.filterLiked' },
  { id: 'latest', label: 'tryon.filterLatest' },
];

/* formatDayGroup returns the English words for the three relative buckets;
   the shared `time.*` keys carry them in the active language. */
const DAY_GROUP_KEYS: Record<string, TKey> = {
  Today: 'time.today',
  Yesterday: 'time.yesterday',
  'Earlier this week': 'time.earlierThisWeek',
};

const dayGroupLabel = (group: string, t: TFunction): string => {
  const key = DAY_GROUP_KEYS[group];
  return key ? t(key) : group;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "Latest" = rendered in the last seven days. */
const isRecent = (iso: string): boolean => Date.now() - new Date(iso).getTime() < WEEK_MS;

const groupByDay = (items: AIGeneration[]): Array<[string, AIGeneration[]]> => {
  const groups = new Map<string, AIGeneration[]>();
  for (const item of items) {
    const label = formatDayGroup(item.createdAt);
    const bucket = groups.get(label);
    if (bucket) bucket.push(item);
    else groups.set(label, [item]);
  }
  return Array.from(groups.entries());
};

export default function HistoryPage() {
  const t = useT();
  const generations = useAppStore((s) => s.generations);
  const setGenerationFeedback = useAppStore((s) => s.setGenerationFeedback);
  const removeGeneration = useAppStore((s) => s.removeGeneration);
  const clearGenerations = useAppStore((s) => s.clearGenerations);
  const toast = useAppStore((s) => s.toast);
  const photoKey = useTryOnStore((s) => s.photoKey);
  const setPhotoKey = useTryOnStore((s) => s.setPhotoKey);

  const [filter, setFilter] = useState<Filter>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = [...generations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visible = sorted.filter((g) => {
    if (filter === 'liked') return g.feedback === 'like';
    if (filter === 'latest') return isRecent(g.createdAt);
    return true;
  });
  const groups = groupByDay(visible);
  const deleting = deleteId ? generations.find((g) => g.id === deleteId) : undefined;

  const toggleLike = (g: AIGeneration) =>
    setGenerationFeedback(g.id, g.feedback === 'like' ? undefined : 'like');

  const share = async (g: AIGeneration) => {
    const outcome = await shareGeneration(g, t);
    if (outcome === 'copied') toast('success', t('tryon.toastCopied'), t('tryon.toastCopiedBody'));
    else if (outcome === 'failed') toast('error', t('tryon.toastShareFailed'), t('tryon.toastShareFailedBody'));
    else if (outcome === 'missing') toast('error', t('tryon.toastPhotoGone'), t('tryon.toastPhotoGoneBody'));
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const sourceShared = generations.some((g) => g.id !== deleting.id && g.sourceKey === deleting.sourceKey);
    await photoStore.remove(deleting.resultKey);
    if (!sourceShared) {
      await photoStore.remove(deleting.sourceKey);
      if (photoKey === deleting.sourceKey) setPhotoKey(null);
    }
    removeGeneration(deleting.id);
    setBusy(false);
    setDeleteId(null);
    toast('success', t('tryon.resultDeleted'));
  };

  const clearAll = async () => {
    setBusy(true);
    await photoStore.clear();
    clearGenerations();
    setPhotoKey(null);
    setBusy(false);
    setConfirmClear(false);
    toast('success', t('tryon.historyCleared'));
  };

  return (
    <Screen nav>
      <Header
        title={t('tryon.historyTitle')}
        back
        backTo={ROUTES.tryOn}
        actions={
          <IconButton
            label={t('tryon.moreOptions')}
            onClick={() => setMenuOpen(true)}
            disabled={generations.length === 0}
          >
            <MoreVertical size={22} />
          </IconButton>
        }
      />
      <ScreenBody className="stagger">
        {generations.length === 0 ? (
          <EmptyState
            icon={<ImageOff size={24} aria-hidden="true" />}
            title={t('tryon.emptyTitle')}
            description={t('tryon.historyEmptyBody')}
            action={<LinkButton to={ROUTES.tryOn}>{t('tryon.tryAStyle')}</LinkButton>}
          />
        ) : (
          <>
            <div className="stack-sm tryon-history-head">
              <p className="caption">
                {t('tryon.historyCount', {
                  count: generations.length,
                  value: formatNumber(generations.length),
                })}
              </p>
              <ChipRow label={t('tryon.filterLabel')}>
                {FILTERS.map((item) => (
                  <Chip key={item.id} active={filter === item.id} onClick={() => setFilter(item.id)}>
                    {t(item.label)}
                  </Chip>
                ))}
              </ChipRow>
            </div>

            {groups.length === 0 ? (
              <EmptyState
                icon={<ThumbsUp size={24} aria-hidden="true" />}
                title={filter === 'liked' ? t('tryon.noLikedTitle') : t('tryon.noRecentTitle')}
                description={filter === 'liked' ? t('tryon.noLikedBody') : t('tryon.noRecentBody')}
              />
            ) : (
              groups.map(([label, items]) => (
                <section key={label} className="section tryon-chapter tryon-history-group">
                  <h2 className="label tryon-day">{dayGroupLabel(label, t)}</h2>
                  <div className="grid-2 tryon-gen-grid">
                    {items.map((g) => (
                      <GenerationCard
                        key={g.id}
                        generation={g}
                        showTime
                        footer={
                          <div className="tryon-gen-actions">
                            <IconButton label={t('tryon.like')} active={g.feedback === 'like'} onClick={() => toggleLike(g)}>
                              <ThumbsUp size={18} />
                            </IconButton>
                            <IconButton label={t('action.share')} onClick={() => void share(g)}>
                              <Share2 size={18} />
                            </IconButton>
                            <IconButton label={t('action.delete')} onClick={() => setDeleteId(g.id)}>
                              <Trash2 size={18} />
                            </IconButton>
                          </div>
                        }
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </ScreenBody>

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            label: t('tryon.clearAll'),
            icon: <Trash2 size={20} aria-hidden="true" />,
            danger: true,
            onSelect: () => setConfirmClear(true),
          },
        ]}
      />
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => void clearAll()}
        title={t('tryon.clearAllTitle')}
        description={t('tryon.clearAllBody')}
        confirmLabel={t('tryon.clearAll')}
        tone="danger"
        loading={busy}
        icon={
          <span className="icon-circle icon-circle-danger">
            <Trash2 size={24} aria-hidden="true" />
          </span>
        }
      />
      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void remove()}
        title={t('tryon.deleteResultTitle')}
        description={
          deleting ? t('tryon.deleteResultNamedBody', { name: deleting.hairstyleName }) : undefined
        }
        confirmLabel={t('action.delete')}
        tone="danger"
        loading={busy}
        icon={
          <span className="icon-circle icon-circle-danger">
            <Trash2 size={24} aria-hidden="true" />
          </span>
        }
      />
    </Screen>
  );
}
