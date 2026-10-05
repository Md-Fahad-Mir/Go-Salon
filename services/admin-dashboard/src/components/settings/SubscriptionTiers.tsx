import { useEffect, useId, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import type { SubscriptionTierPlan } from '../../types';
import { useStore } from '../../store/useStore';
import {
  SUBSCRIPTION_TIER_FIELDS,
  subscriptionTierService,
  type SubscriptionTierInput,
} from '../../utils/adminService';
import { ApiError } from '../../utils/apiError';
import { formatNumber } from '../../utils/format';
import { EmptyState } from '../ui/EmptyState';
import { Field } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { RowMenu } from '../ui/RowMenu';
import type { RowMenuItem } from '../ui/RowMenu';
import { Skeleton } from '../ui/Skeleton';
import { TagInput } from '../ui/TagInput';
import { UnitInput } from '../ui/UnitInput';
import { Toggle } from '../ui/Toggle';
import { ToggleRow } from './SettingRow';

/** Mirror the backend's ceilings (Apps/subscriptions/serializers.py). */
const MAX_PRICE_BDT = 1_000_000;
const MAX_MONTHLY_CREDITS = 100_000;

const messageFor = (error: unknown): string =>
  error instanceof ApiError ? error.message : 'Could not reach the server.';

const accounts = (count: number): string => `${formatNumber(count)} ${count === 1 ? 'account' : 'accounts'}`;

/** What a plan gives in try-ons, as a pricing card would put it. */
const creditsLine = (monthlyCredits: number | null): string =>
  monthlyCredits === null
    ? 'Unlimited try-ons'
    : `${formatNumber(monthlyCredits)} try-on credit${monthlyCredits === 1 ? '' : 's'} a month`;

const subscribers = (count: number): string =>
  count === 0 ? 'No subscribers yet' : `${formatNumber(count)} ${count === 1 ? 'subscriber' : 'subscribers'}`;

/* --------------------------------------------------------------------------
   The card — a plan as a pricing page would show it
   -------------------------------------------------------------------------- */

interface TierCardProps {
  plan: SubscriptionTierPlan;
  /** Shown inside the editor: no actions, and no subscriber line for a plan
      that does not exist yet. */
  preview?: 'new' | 'existing';
  menu?: RowMenuItem[];
  onEdit?: () => void;
}

function TierCard({ plan, preview, menu, onEdit }: TierCardProps) {
  const headingId = useId();
  return (
    <article
      className="tier"
      data-featured={plan.featured ? 'true' : 'false'}
      aria-labelledby={headingId}
    >
      <div className="tier-top">
        <div className="tier-tags">
          {plan.featured ? (
            <span className="tier-tag tier-tag-featured">
              <Sparkles size={11} strokeWidth={2} aria-hidden="true" /> Featured
            </span>
          ) : null}
          {plan.isDefault ? (
            <span className="tier-tag" title="New accounts start on this plan">
              Default
            </span>
          ) : null}
        </div>
        {menu ? <RowMenu items={menu} label={`Actions for ${plan.name}`} /> : null}
      </div>

      <h4 className="tier-name" id={headingId}>
        {plan.name}
      </h4>

      <p className="tier-price">
        <span className="tier-currency">৳</span>
        <span className="tier-amount">{formatNumber(plan.price)}</span>
        <span className="tier-period">/ month</span>
      </p>

      <p className="tier-credits">
        <Sparkles size={13} strokeWidth={1.9} aria-hidden="true" />
        {creditsLine(plan.monthlyCredits)}
      </p>

      {preview === 'new' ? null : (
        <p className="tier-subs">
          <Users size={13} strokeWidth={1.8} aria-hidden="true" />
          {subscribers(plan.subscriberCount)}
        </p>
      )}

      {plan.features.length ? (
        <ul className="tier-features">
          {plan.features.map((feature) => (
            <li key={feature}>
              <span className="tier-check" aria-hidden="true">
                <Check size={11} strokeWidth={2.6} />
              </span>
              {feature}
            </li>
          ))}
        </ul>
      ) : (
        <p className="tier-features tier-features-empty">No features listed yet.</p>
      )}

      {onEdit ? (
        <button type="button" className="btn btn-secondary btn-block tier-edit" onClick={onEdit}>
          <Pencil size={14} /> Edit plan
        </button>
      ) : null}
    </article>
  );
}

/* --------------------------------------------------------------------------
   Add / edit — a form beside a live preview of the card
   -------------------------------------------------------------------------- */

interface TierForm {
  name: string;
  /** Kept as typed, so the box can be empty mid-edit. */
  price: string;
  /** Try-ons a month, as typed; ignored while `unlimited`. */
  credits: string;
  unlimited: boolean;
  features: string[];
  featured: boolean;
  isDefault: boolean;
}

type TierErrors = Partial<Record<keyof SubscriptionTierInput, string>>;

const formFor = (tier: SubscriptionTierPlan | null): TierForm =>
  tier
    ? {
        name: tier.name,
        price: String(tier.price),
        credits: tier.monthlyCredits === null ? '' : String(tier.monthlyCredits),
        unlimited: tier.monthlyCredits === null,
        features: tier.features,
        featured: tier.featured,
        isDefault: tier.isDefault,
      }
    : { name: '', price: '', credits: '', unlimited: false, features: [], featured: false, isDefault: false };

interface TierDialogProps {
  /** Null to add a new plan. */
  tier: SubscriptionTierPlan | null;
  onClose: () => void;
  onSaved: (plan: SubscriptionTierPlan) => void;
}

function TierDialog({ tier, onClose, onSaved }: TierDialogProps) {
  const pushToast = useStore((state) => state.pushToast);
  const [form, setForm] = useState<TierForm>(() => formFor(tier));
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<TierErrors>({});
  const [saving, setSaving] = useState(false);

  const price = form.price.trim() === '' ? Number.NaN : Number(form.price);
  const priceValid = Number.isInteger(price) && price >= 0 && price <= MAX_PRICE_BDT;
  const nameValid = form.name.trim().length >= 2;
  const credits = form.credits.trim() === '' ? Number.NaN : Number(form.credits);
  const creditsValid =
    form.unlimited || (Number.isInteger(credits) && credits >= 0 && credits <= MAX_MONTHLY_CREDITS);

  const errors: TierErrors = {
    name: touched && !nameValid ? 'Give this plan a name.' : serverErrors.name,
    price:
      touched && !priceValid
        ? price > MAX_PRICE_BDT
          ? `Keep it under ৳${formatNumber(MAX_PRICE_BDT)}.`
          : 'Enter a whole amount in taka — 0 for a free plan.'
        : serverErrors.price,
    monthlyCredits:
      touched && !creditsValid
        ? credits > MAX_MONTHLY_CREDITS
          ? `Keep it under ${formatNumber(MAX_MONTHLY_CREDITS)} — or make it unlimited.`
          : 'Enter a whole number of try-ons — 0 for none.'
        : serverErrors.monthlyCredits,
    features: serverErrors.features,
  };

  const update = (patch: Partial<TierForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    // A field the admin has just changed no longer carries the server's
    // complaint about its old value.
    setServerErrors((current) => {
      const next = { ...current };
      if ('name' in patch) delete next.name;
      if ('price' in patch) delete next.price;
      if ('credits' in patch || 'unlimited' in patch) delete next.monthlyCredits;
      if ('features' in patch) delete next.features;
      return next;
    });
  };

  const save = async () => {
    setTouched(true);
    if (!nameValid || !priceValid || !creditsValid) return;
    const input: SubscriptionTierInput = {
      name: form.name.trim(),
      price,
      monthlyCredits: form.unlimited ? null : credits,
      features: form.features,
      featured: form.featured,
      isDefault: form.isDefault,
    };
    setSaving(true);
    try {
      const saved = tier
        ? await subscriptionTierService.update(tier.id, input)
        : await subscriptionTierService.create(input);
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError) {
        const mapped: TierErrors = {};
        for (const [field, messages] of Object.entries(error.errors)) {
          const key = SUBSCRIPTION_TIER_FIELDS[field];
          if (key && messages.length) mapped[key] = messages[0];
        }
        setServerErrors(mapped);
      }
      pushToast('error', 'Could not save the plan', messageFor(error));
    } finally {
      setSaving(false);
    }
  };

  const preview: SubscriptionTierPlan = {
    id: tier?.id ?? 'new',
    slug: tier?.slug ?? '',
    name: form.name.trim() || 'Plan name',
    price: Number.isFinite(price) && price >= 0 ? Math.floor(price) : 0,
    monthlyCredits: form.unlimited ? null : Number.isFinite(credits) && credits >= 0 ? Math.floor(credits) : 0,
    featured: form.featured,
    isDefault: form.isDefault,
    features: form.features,
    subscriberCount: tier?.subscriberCount ?? 0,
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={tier ? `Edit ${tier.name}` : 'Add a subscription tier'}
      description={
        tier
          ? 'Changes apply to everyone on this plan as soon as you save.'
          : 'A new monthly plan, listed after the ones you already have.'
      }
      size="xl"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : tier ? 'Save changes' : 'Add tier'}
          </button>
        </>
      }
    >
      <form
        className="tier-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="tier-editor-form">
          <div className="form-grid form-grid-2">
            <Field label="Plan name" required error={errors.name}>
              <input
                className="input"
                value={form.name}
                maxLength={40}
                placeholder="e.g. Premium"
                autoFocus={!tier}
                onChange={(event) => update({ name: event.target.value })}
              />
            </Field>
            <Field label="Monthly price" required error={errors.price} hint="0 makes it a free plan.">
              <UnitInput
                unit="৳"
                placement="prefix"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_PRICE_BDT}
                step={1}
                placeholder="0"
                value={form.price}
                onChange={(event) => update({ price: event.target.value })}
              />
            </Field>
            <div className="form-span-2 tier-credits-row">
              <Field
                label="Try-on credits a month"
                required={!form.unlimited}
                error={errors.monthlyCredits}
                hint="One per 360° try-on video. They start over on the 1st of every month."
              >
                <UnitInput
                  unit="/ month"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_MONTHLY_CREDITS}
                  step={1}
                  placeholder={form.unlimited ? 'Unlimited' : '0'}
                  disabled={form.unlimited}
                  value={form.unlimited ? '' : form.credits}
                  onChange={(event) => update({ credits: event.target.value })}
                />
              </Field>
              <div className="tier-credits-unlimited">
                <Toggle
                  checked={form.unlimited}
                  label="Unlimited"
                  onChange={(unlimited) => update({ unlimited })}
                />
              </div>
            </div>
            <Field
              label="Features"
              className="form-span-2"
              error={errors.features}
              hint="Enter to add, backspace to remove the last. Listed in this order."
            >
              <TagInput
                value={form.features}
                onChange={(features) => update({ features })}
                placeholder="Add a feature…"
              />
            </Field>
          </div>

          <div className="tier-editor-switches">
            <ToggleRow
              label="Featured"
              hint="Highlight this plan on pricing pages"
              checked={form.featured}
              onChange={(featured) => update({ featured })}
            />
            <ToggleRow
              label="Default plan"
              hint={
                tier?.isDefault
                  ? 'New accounts start on this plan. Make another plan the default to change it.'
                  : 'New accounts start on this plan'
              }
              checked={form.isDefault}
              disabled={Boolean(tier?.isDefault)}
              onChange={(isDefault) => update({ isDefault })}
            />
          </div>
          {/* Lets Enter in a text box submit; TagInput keeps Enter for itself. */}
          <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
        </div>

        <aside className="tier-editor-preview" aria-label="Preview">
          <p className="tier-editor-preview-label">Preview</p>
          <TierCard plan={preview} preview={tier ? 'existing' : 'new'} />
        </aside>
      </form>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Delete — moving anyone on the plan somewhere first
   -------------------------------------------------------------------------- */

interface DeleteTierDialogProps {
  tier: SubscriptionTierPlan;
  tiers: SubscriptionTierPlan[];
  onClose: () => void;
  onDeleted: (moveTo: SubscriptionTierPlan | null) => void;
}

function DeleteTierDialog({ tier, tiers, onClose, onDeleted }: DeleteTierDialogProps) {
  const pushToast = useStore((state) => state.pushToast);
  const others = tiers.filter((item) => item.id !== tier.id);
  const [moveTo, setMoveTo] = useState(() => (others.find((item) => item.isDefault) ?? others[0])?.id ?? '');
  const [deleting, setDeleting] = useState(false);
  const target = others.find((item) => item.id === moveTo) ?? null;
  const hasSubscribers = tier.subscriberCount > 0;

  const confirm = async () => {
    setDeleting(true);
    try {
      await subscriptionTierService.remove(tier.id, hasSubscribers ? moveTo : undefined);
      onDeleted(hasSubscribers ? target : null);
    } catch (error) {
      pushToast('error', 'Could not delete the plan', messageFor(error));
      setDeleting(false);
    }
  };

  if (tier.isDefault) {
    return (
      <Modal
        open
        onClose={onClose}
        title={`${tier.name} can’t be deleted yet`}
        footer={
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Got it
          </button>
        }
      >
        <div className="dialog-message">
          <span className="dialog-mark dialog-mark-neutral" aria-hidden="true">
            <Star size={18} />
          </span>
          <p>
            New accounts start on {tier.name}, so it has to stay. Make another plan the default first, then
            delete this one.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${tier.name}?`}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={confirm}
            disabled={deleting || (hasSubscribers && !target)}
          >
            {deleting
              ? 'Deleting…'
              : hasSubscribers
                ? `Move ${accounts(tier.subscriberCount)} and delete`
                : 'Delete plan'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="dialog-message">
          <span className="dialog-mark" aria-hidden="true">
            <AlertTriangle size={18} />
          </span>
          <p>
            {hasSubscribers
              ? `${accounts(tier.subscriberCount)} ${tier.subscriberCount === 1 ? 'is' : 'are'} on ${tier.name}. They move to the plan you choose, then ${tier.name} is removed from pricing pages.`
              : `Nobody is on ${tier.name}. It is removed from pricing pages straight away.`}
          </p>
        </div>
        {hasSubscribers ? (
          <Field label="Move them to">
            <select className="select" value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
              {others.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.price === 0 ? 'Free' : `৳${formatNumber(item.price)} / month`}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   The section
   -------------------------------------------------------------------------- */

/** The monthly plans, read from and saved to the backend
    (/api/admin/subscription-tiers/). After every change the list is read
    again rather than patched: making one plan the default, or moving a
    deleted plan's accounts, changes other plans too. */
export function SubscriptionTiers() {
  const pushToast = useStore((state) => state.pushToast);
  const recordAudit = useStore((state) => state.recordAudit);
  const [tiers, setTiers] = useState<SubscriptionTierPlan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Undefined while closed; null to add a plan. */
  const [editing, setEditing] = useState<SubscriptionTierPlan | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<SubscriptionTierPlan | null>(null);

  useEffect(() => {
    let live = true;
    subscriptionTierService
      .list()
      .then((data) => {
        if (live) setTiers(data);
      })
      .catch((error: unknown) => {
        if (live) setLoadError(messageFor(error));
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => {
    setLoadError(null);
    setTiers(null);
    setAttempt((n) => n + 1);
  };

  const resync = async () => {
    try {
      setTiers(await subscriptionTierService.list());
    } catch {
      // Keep what is on screen; the next change reads the list again.
    }
  };

  const quickUpdate = async (tier: SubscriptionTierPlan, patch: Partial<SubscriptionTierInput>, done: string) => {
    try {
      await subscriptionTierService.update(tier.id, patch);
      recordAudit({
        actionType: 'update',
        resourceType: 'SubscriptionTier',
        resourceId: tier.slug,
        details: `${done}: "${tier.name}"`,
      });
      pushToast('success', done, tier.name);
      await resync();
    } catch (error) {
      pushToast('error', 'Could not save the plan', messageFor(error));
    }
  };

  const move = async (index: number, offset: -1 | 1) => {
    if (!tiers) return;
    const reordered = [...tiers];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(index + offset, 0, moved);
    setTiers(reordered);
    try {
      setTiers(await subscriptionTierService.reorder(reordered.map((tier) => tier.id)));
      recordAudit({
        actionType: 'update',
        resourceType: 'SubscriptionTier',
        resourceId: moved.slug,
        details: `Reordered subscription tiers: ${reordered.map((tier) => tier.name).join(', ')}`,
      });
    } catch (error) {
      pushToast('error', 'Could not reorder the plans', messageFor(error));
      await resync();
    }
  };

  const saved = (plan: SubscriptionTierPlan) => {
    const created = editing === null;
    recordAudit({
      actionType: created ? 'create' : 'update',
      resourceType: 'SubscriptionTier',
      resourceId: plan.slug,
      details: `${created ? 'Added' : 'Updated'} subscription tier "${plan.name}"`,
    });
    pushToast('success', created ? 'Plan added' : 'Plan saved', plan.name);
    setEditing(undefined);
    void resync();
  };

  const deleted = (tier: SubscriptionTierPlan, moveTo: SubscriptionTierPlan | null) => {
    recordAudit({
      actionType: 'delete',
      resourceType: 'SubscriptionTier',
      resourceId: tier.slug,
      details: moveTo
        ? `Deleted subscription tier "${tier.name}", moving ${accounts(tier.subscriberCount)} to "${moveTo.name}"`
        : `Deleted subscription tier "${tier.name}"`,
    });
    pushToast(
      'success',
      'Plan deleted',
      moveTo ? `${accounts(tier.subscriberCount)} moved to ${moveTo.name}` : tier.name,
    );
    setPendingDelete(null);
    void resync();
  };

  const menuFor = (tier: SubscriptionTierPlan, index: number, count: number): RowMenuItem[] => [
    { label: 'Edit plan', icon: <Pencil size={15} />, onSelect: () => setEditing(tier) },
    ...(tier.isDefault
      ? []
      : [
          {
            label: 'Make default',
            icon: <Star size={15} />,
            onSelect: () => void quickUpdate(tier, { isDefault: true }, 'Default plan changed'),
          },
        ]),
    {
      label: tier.featured ? 'Stop featuring' : 'Feature this plan',
      icon: <Sparkles size={15} />,
      onSelect: () =>
        void quickUpdate(tier, { featured: !tier.featured }, tier.featured ? 'Plan unfeatured' : 'Plan featured'),
    },
    ...(index > 0
      ? [{ label: 'Move earlier', icon: <ArrowLeft size={15} />, onSelect: () => void move(index, -1) }]
      : []),
    ...(index < count - 1
      ? [{ label: 'Move later', icon: <ArrowRight size={15} />, onSelect: () => void move(index, 1) }]
      : []),
    {
      label: 'Delete plan',
      icon: <Trash2 size={15} />,
      danger: true,
      separatorBefore: true,
      onSelect: () => setPendingDelete(tier),
    },
  ];

  const totalSubscribers = tiers?.reduce((sum, tier) => sum + tier.subscriberCount, 0) ?? 0;

  return (
    <section className="card tiers-panel" aria-labelledby="tiers-heading">
      <header className="tiers-head">
        <div className="set-card-head">
          <span className="icon-tile" aria-hidden="true">
            <Crown size={17} strokeWidth={1.8} />
          </span>
          <div className="set-card-titles">
            <h3 id="tiers-heading">Subscription tiers</h3>
            <p>Monthly plans, priced in taka and listed in the order customers see them.</p>
          </div>
        </div>
        <div className="tiers-head-end">
          {tiers ? (
            <dl className="tiers-stats">
              <div>
                <dt>Plans</dt>
                <dd>{formatNumber(tiers.length)}</dd>
              </div>
              <div>
                <dt>Subscribers</dt>
                <dd>{formatNumber(totalSubscribers)}</dd>
              </div>
            </dl>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => setEditing(null)} disabled={!tiers}>
            <Plus size={16} /> Add tier
          </button>
        </div>
      </header>

      <div className="tiers-stage">
        {loadError ? (
          <EmptyState
            icon={<Crown size={28} strokeWidth={1.5} />}
            title="Couldn’t load the subscription tiers"
            message={loadError}
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
                <RefreshCw size={14} /> Retry
              </button>
            }
          />
        ) : !tiers ? (
          <div className="tiers-grid" aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} height="22rem" radius="var(--radius-lg)" />
            ))}
          </div>
        ) : (
          <div className="tiers-grid">
            {tiers.map((tier, index) => (
              <TierCard
                key={tier.id}
                plan={tier}
                menu={menuFor(tier, index, tiers.length)}
                onEdit={() => setEditing(tier)}
              />
            ))}
            <button type="button" className="tier-add" onClick={() => setEditing(null)}>
              <span className="tier-add-icon" aria-hidden="true">
                <Plus size={20} strokeWidth={1.8} />
              </span>
              <strong>Add a tier</strong>
              <span>Create another monthly plan</span>
            </button>
          </div>
        )}
      </div>

      {editing !== undefined ? (
        <TierDialog key={editing?.id ?? 'new'} tier={editing} onClose={() => setEditing(undefined)} onSaved={saved} />
      ) : null}

      {pendingDelete && tiers ? (
        <DeleteTierDialog
          key={pendingDelete.id}
          tier={pendingDelete}
          tiers={tiers}
          onClose={() => setPendingDelete(null)}
          onDeleted={(moveTo) => deleted(pendingDelete, moveTo)}
        />
      ) : null}
    </section>
  );
}
