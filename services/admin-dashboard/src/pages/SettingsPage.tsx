import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { PlatformSettings, SubscriptionTierPlan } from '../types';
import { useStore } from '../store/useStore';
import { aiGenerationService, type AIGenerationSettings, type VideoModelOption } from '../utils/adminService';
import { ApiError } from '../utils/apiError';
import { PageHeader } from '../components/ui/PageHeader';
import { Toggle } from '../components/ui/Toggle';
import { Field } from '../components/ui/Field';
import { TagInput } from '../components/ui/TagInput';
import { formatBdt } from '../utils/format';

interface NumberRowProps {
  label: string;
  hint: string;
  /** Null while the value is still loading. */
  value: number | null;
  suffix?: string;
  min?: number;
  step?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}

/** Numeric settings commit on blur rather than on every keystroke, so the
    audit log gets one entry per real change. */
function NumberRow({ label, hint, value, suffix, min = 0, step = 1, disabled, onCommit }: NumberRowProps) {
  return (
    <div className="setting-row">
      <div className="info">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      <div className="control row" style={{ gap: '0.375rem' }}>
        <input
          className="input"
          type="number"
          min={min}
          step={step}
          defaultValue={value ?? ''}
          key={String(value)}
          disabled={disabled || value === null}
          aria-label={label}
          onBlur={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next) && next !== value) onCommit(next);
          }}
        />
        {suffix ? <span className="dim">{suffix}</span> : null}
      </div>
    </div>
  );
}

const describeModel = (model: VideoModelOption, defaultModel: string): string =>
  [
    model.name,
    `${model.durationSeconds} s`,
    model.resolution,
    model.pricePerVideoUsd === null ? 'price varies' : `≈ $${model.pricePerVideoUsd.toFixed(2)} / video`,
  ]
    .filter(Boolean)
    .join(' · ') + (model.id === defaultModel ? ' — default' : '');

/** The 360° video model and the try-on price live on one backend row
    (/api/admin/settings/ai-generation/), so the page loads it once and both
    rows share it. */
function useAIGeneration() {
  const [settings, setSettings] = useState<AIGenerationSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    aiGenerationService
      .get()
      .then((data) => {
        if (live) setSettings(data);
      })
      .catch((error: unknown) => {
        if (live) setLoadError(error instanceof ApiError ? error.message : 'Could not reach the server.');
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => {
    setLoadError(null);
    setSettings(null);
    setAttempt((n) => n + 1);
  };

  return { settings, setSettings, loadError, retry };
}

type AIGeneration = ReturnType<typeof useAIGeneration>;

/** The OpenRouter video model behind every 360° try-on — read from and saved
    to the backend, which hands it to the AI service with each video. */
function VideoModelRow({ ai }: { ai: AIGeneration }) {
  const pushToast = useStore((state) => state.pushToast);
  const { settings, setSettings, loadError, retry } = ai;
  const [saving, setSaving] = useState(false);

  const choose = async (id: string) => {
    if (!settings || id === settings.videoModel) return;
    setSaving(true);
    try {
      const next = await aiGenerationService.setVideoModel(id);
      setSettings(next);
      pushToast('success', 'Video model saved', next.models.find((model) => model.id === id)?.name ?? id);
    } catch (error) {
      pushToast('error', 'Could not save', error instanceof ApiError ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const loading = !settings && !loadError;
  const problem = loadError ?? settings?.modelsError ?? null;
  const listed = settings?.models.some((model) => model.id === settings.videoModel) ?? false;

  return (
    <div className="setting-row setting-row-stacked">
      <div className="info">
        <strong>360° video model</strong>
        <span>Renders every 360° try-on video. Prices are OpenRouter&rsquo;s list price per clip.</span>
      </div>
      <div className="control">
        <select
          className="select"
          aria-label="360° video model"
          value={settings?.videoModel ?? ''}
          disabled={loading || saving || !settings?.models.length}
          onChange={(event) => void choose(event.target.value)}
        >
          {loading ? <option value="">Loading models…</option> : null}
          {settings && !listed ? (
            <option value={settings.videoModel}>{settings.videoModel || 'No model'} — not available</option>
          ) : null}
          {settings?.models.map((model) => (
            <option key={model.id} value={model.id}>
              {describeModel(model, settings.defaultModel)}
            </option>
          ))}
        </select>
      </div>
      {problem ? (
        <div role="alert" className="alert alert-danger alert-bar">
          <span>Couldn&rsquo;t load the video models: {problem}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : settings?.videoModelAvailable === false ? (
        <div role="alert" className="alert alert-warning">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            The model in use can no longer render a 360° try-on, so every new video will fail. Pick another.
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** What a customer pays per 360° try-on video — saved to the backend, where
    the Overview's AI spend vs revenue reads it. */
function TryOnPriceRow({ ai }: { ai: AIGeneration }) {
  const pushToast = useStore((state) => state.pushToast);

  const save = async (price: number) => {
    try {
      const next = await aiGenerationService.setVideoPrice(price);
      ai.setSettings(next);
      pushToast('success', 'Setting saved', formatBdt(next.videoPriceBdt));
    } catch (error) {
      pushToast('error', 'Could not save', error instanceof ApiError ? error.message : 'Try again.');
    }
  };

  return (
    <NumberRow
      label="360° try-on video price"
      hint={
        ai.loadError
          ? 'Couldn’t load the price — retry under AI generation'
          : 'Charged per generated 360° try-on video'
      }
      value={ai.settings?.videoPriceBdt ?? null}
      suffix="৳"
      disabled={Boolean(ai.loadError)}
      onCommit={(value) => void save(value)}
    />
  );
}

function TierEditor({ tier }: { tier: SubscriptionTierPlan }) {
  const updateSubscriptionTier = useStore((state) => state.updateSubscriptionTier);

  return (
    <article className="tier-card" data-featured={tier.featured ? 'true' : 'false'}>
      <div className="row" style={{ gap: '0.75rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Field label="Plan name">
            <input
              className="input"
              defaultValue={tier.name}
              key={tier.name}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next && next !== tier.name) updateSubscriptionTier(tier.id, { name: next });
              }}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Price / mo (৳)">
            <input
              className="input"
              type="number"
              min={0}
              defaultValue={tier.price}
              key={tier.price}
              onBlur={(event) => {
                const next = Number(event.target.value);
                if (!Number.isNaN(next) && next !== tier.price) updateSubscriptionTier(tier.id, { price: next });
              }}
            />
          </Field>
        </div>
      </div>
      <Field label="Features" hint="Enter to add, backspace to remove the last">
        <TagInput
          value={tier.features}
          onChange={(features) => updateSubscriptionTier(tier.id, { features })}
          placeholder="Add a feature…"
        />
      </Field>
      <div className="setting-row">
        <div className="info">
          <strong>Featured</strong>
          <span>Highlight this plan on pricing pages</span>
        </div>
        <div className="control">
          <Toggle
            checked={Boolean(tier.featured)}
            hideLabel
            label="Featured"
            onChange={(value) => updateSubscriptionTier(tier.id, { featured: value })}
          />
        </div>
      </div>
      <span className="dim">{tier.price === 0 ? 'Free' : `${formatBdt(tier.price)} / mo`}</span>
    </article>
  );
}

export default function SettingsPage() {
  const settings = useStore((state) => state.settings);
  const subscriptionTiers = useStore((state) => state.subscriptionTiers);
  const updateSettings = useStore((state) => state.updateSettings);
  const pushToast = useStore((state) => state.pushToast);
  const ai = useAIGeneration();

  const set = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    updateSettings({ [key]: value } as Partial<PlatformSettings>);
    pushToast('success', 'Setting saved', String(value));
  };

  return (
    <>
      <PageHeader
        title="System settings"
        description="Changes apply platform-wide as soon as they are saved and are written to the audit log."
      />

      <div className="masonry">
        <section className="card">
          <div className="card-head">
            <h2>Bookings & fees</h2>
          </div>
          <div className="card-body">
            <NumberRow
              label="Platform fee"
              hint="Added to every booking total"
              value={settings.platformFee}
              suffix="৳"
              onCommit={(value) => set('platformFee', value)}
            />
            <TryOnPriceRow ai={ai} />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Verification & security</h2>
          </div>
          <div className="card-body">
            <NumberRow
              label="OTP expiry"
              hint="How long a verification code stays valid"
              value={settings.otpExpiryMinutes}
              suffix="min"
              min={1}
              onCommit={(value) => set('otpExpiryMinutes', value)}
            />
            <NumberRow
              label="OTP resend cooldown"
              hint="Wait before a new code can be requested"
              value={settings.otpResendCooldownMinutes}
              suffix="min"
              min={1}
              onCommit={(value) => set('otpResendCooldownMinutes', value)}
            />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Notifications</h2>
          </div>
          <div className="card-body">
            <div className="setting-row">
              <div className="info">
                <strong>SMS notifications</strong>
                <span>Booking updates and OTP codes</span>
              </div>
              <div className="control">
                <Toggle
                  checked={settings.smsEnabled}
                  hideLabel
                  label="SMS notifications"
                  onChange={(value) => set('smsEnabled', value)}
                />
              </div>
            </div>
            <div className="setting-row">
              <div className="info">
                <strong>Email notifications</strong>
                <span>Receipts and monthly summaries</span>
              </div>
              <div className="control">
                <Toggle
                  checked={settings.emailEnabled}
                  hideLabel
                  label="Email notifications"
                  onChange={(value) => set('emailEnabled', value)}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>AI generation</h2>
          </div>
          <div className="card-body">
            <VideoModelRow ai={ai} />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Subscription tiers</h2>
            <span className="card-sub">monthly, in BDT</span>
          </div>
          <div className="card-body stack-sm">
            {subscriptionTiers.map((tier) => (
              <TierEditor tier={tier} key={tier.id} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
