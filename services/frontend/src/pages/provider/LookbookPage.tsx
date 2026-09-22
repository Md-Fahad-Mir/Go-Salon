import { Images, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Art } from '../../components/common/Art';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Button } from '../../components/common/Button';
import { Chip, ChipRow } from '../../components/common/Chip';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { IconButton } from '../../components/common/IconButton';
import { Input, Select } from '../../components/common/Input';
import { Toggle } from '../../components/common/Toggle';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { LOOKBOOK_TONES, categoryKey } from '../../components/provider/team/teamHelpers';
import { LOOKBOOK_CATEGORIES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { LookbookItem } from '../../types';
import { formatDate, formatNumber } from '../../utils/format';

/* The stylist's portfolio. Published tiles are what a client sees on the
   public profile; drafts are hers alone until she is happy with them. */

const ALL = '__all__';

export default function LookbookPage() {
  const t = useT();
  const lookbook = useProviderStore((state) => state.lookbook);
  const addLookbookItem = useProviderStore((state) => state.addLookbookItem);
  const updateLookbookItem = useProviderStore((state) => state.updateLookbookItem);
  const removeLookbookItem = useProviderStore((state) => state.removeLookbookItem);
  const toast = useAppStore((state) => state.toast);

  const [category, setCategory] = useState<string>(ALL);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const label = (name: string): string => {
    const key = categoryKey(name);
    return key ? t(key) : name;
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of lookbook) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [lookbook]);

  const shown = category === ALL ? lookbook : lookbook.filter((item) => item.category === category);
  const open: LookbookItem | undefined = lookbook.find((item) => item.id === openId);

  return (
    <Screen nav>
      <Header
        title={t('pt.lookbookTitle')}
        actions={
          <IconButton label={t('pt.addToLookbook')} variant="accent" onClick={() => setAdding(true)}>
            <Plus size={20} />
          </IconButton>
        }
      />
      <ScreenBody>
        <ChipRow scroll label={t('pt.categoryLabel')}>
          <Chip active={category === ALL} onClick={() => setCategory(ALL)}>
            {t('pt.allCategories')}
            <span className="count dim">{formatNumber(lookbook.length)}</span>
          </Chip>
          {LOOKBOOK_CATEGORIES.map((name) => (
            <Chip key={name} active={category === name} onClick={() => setCategory(name)}>
              {label(name)}
              <span className="count dim">{formatNumber(counts.get(name) ?? 0)}</span>
            </Chip>
          ))}
        </ChipRow>

        {shown.length ? (
          <>
            <p className="caption pt-count">{t('pt.photos', { count: formatNumber(shown.length) })}</p>
            <div className="photo-grid photo-grid-2 pt-looks stagger">
              {shown.map((item) => (
                <figure key={item.id} className="pt-look">
                  <button
                    type="button"
                    className="pt-look-tile"
                    onClick={() => setOpenId(item.id)}
                    aria-label={t('pt.openItem', { caption: item.caption })}
                  >
                    <Art tone={item.tone} ratio="portrait" />
                    {!item.published ? <span className="pt-look-draft">{t('pt.draft')}</span> : null}
                  </button>
                  <figcaption className="pt-look-cap">{item.caption}</figcaption>
                </figure>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            className="pt-empty"
            icon={<Images size={26} aria-hidden="true" />}
            title={category === ALL ? t('pt.noLookbook') : t('pt.noneInCategory', { category: label(category) })}
            description={category === ALL ? t('pt.noLookbookBody') : t('pt.noneInCategoryBody')}
            action={
              <Button variant="outline" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
                {t('pt.addToLookbook')}
              </Button>
            }
          />
        )}
      </ScreenBody>

      {/* --- One tile, up close --- */}
      <BottomSheet
        open={open !== undefined}
        onClose={() => setOpenId(null)}
        title={open?.caption}
        description={open ? label(open.category) : undefined}
      >
        {open ? (
          <div className="stack">
            <Art tone={open.tone} ratio="portrait" className="pt-photo-full" />
            <p className="caption">{t('pt.addedOn', { date: formatDate(open.createdAt) })}</p>
            <Toggle
              label={t('pt.showOnProfile')}
              hint={t('pt.showOnProfileHint')}
              checked={open.published}
              onChange={(on) => updateLookbookItem(open.id, { published: on })}
            />
            <Button
              variant="danger-soft"
              block
              icon={<Trash2 size={16} />}
              onClick={() => setConfirmDelete(open.id)}
            >
              {t('action.delete')}
            </Button>
          </div>
        ) : null}
      </BottomSheet>

      {/* --- Add --- */}
      <BottomSheet open={adding} onClose={() => setAdding(false)} title={t('pt.addToLookbook')}>
        {adding ? (
          <AddLookbookForm
            onSubmit={(item) => {
              addLookbookItem(item);
              setAdding(false);
              setCategory(item.category);
              toast('success', t('pt.lookbookAdded'), item.caption);
            }}
          />
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeLookbookItem(confirmDelete);
          setConfirmDelete(null);
          setOpenId(null);
          toast('success', t('pt.lookbookDeleted'));
        }}
        title={t('pt.deleteItemTitle')}
        description={t('pt.deleteItemBody')}
        confirmLabel={t('action.delete')}
        cancelLabel={t('action.cancel')}
        tone="danger"
        icon={<Trash2 size={22} aria-hidden="true" />}
      />
    </Screen>
  );
}

interface NewItem {
  category: string;
  caption: string;
  tone: number;
  published: boolean;
}

function AddLookbookForm({ onSubmit }: { onSubmit: (item: NewItem) => void }) {
  const t = useT();
  const [values, setValues] = useState<NewItem>({
    category: LOOKBOOK_CATEGORIES[0],
    caption: '',
    tone: 0,
    published: true,
  });
  const [error, setError] = useState<string | undefined>();

  const label = (name: string): string => {
    const key = categoryKey(name);
    return key ? t(key) : name;
  };

  const submit = () => {
    if (!values.caption.trim()) {
      setError(t('pt.errCaption'));
      return;
    }
    setError(undefined);
    onSubmit({ ...values, caption: values.caption.trim() });
  };

  return (
    <div className="stack">
      <Select
        label={t('pt.categoryLabel')}
        value={values.category}
        options={LOOKBOOK_CATEGORIES.map((name) => ({ value: name, label: label(name) }))}
        onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))}
      />
      <Input
        label={t('pt.captionLabel')}
        value={values.caption}
        placeholder={t('pt.captionPlaceholder')}
        error={error}
        onChange={(event) => {
          setError(undefined);
          setValues((current) => ({ ...current, caption: event.target.value }));
        }}
      />
      <div className="stack-xs">
        <span className="label">{t('pt.toneLabel')}</span>
        <div className="pt-tones" role="radiogroup" aria-label={t('pt.toneLabel')}>
          {LOOKBOOK_TONES.map((tone) => (
            <button
              key={tone}
              type="button"
              role="radio"
              aria-checked={values.tone === tone}
              aria-label={t('pt.toneOption', { index: formatNumber(tone + 1) })}
              className="pt-tone"
              data-on={values.tone === tone ? 'true' : undefined}
              onClick={() => setValues((current) => ({ ...current, tone }))}
            >
              <Art tone={tone} ratio="square" flat />
            </button>
          ))}
        </div>
      </div>
      <Toggle
        label={t('pt.showOnProfile')}
        hint={t('pt.showOnProfileHint')}
        checked={values.published}
        onChange={(on) => setValues((current) => ({ ...current, published: on }))}
      />
      <Button block onClick={submit}>{t('pt.addToLookbook')}</Button>
    </div>
  );
}
