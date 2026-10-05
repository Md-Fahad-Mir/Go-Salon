import { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, ReceiptText, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PlatformSettings } from '../types';
import { useStore } from '../store/useStore';
import { aiGenerationService, type AIGenerationSettings, type VideoModelOption } from '../utils/adminService';
import { ApiError } from '../utils/apiError';
import { PageHeader } from '../components/ui/PageHeader';
import { UnitInput } from '../components/ui/UnitInput';
import { SettingRow, SettingsCard, ToggleRow } from '../components/settings/SettingRow';
import { SubscriptionTiers } from '../components/settings/SubscriptionTiers';
import { formatBdt } from '../utils/format';

interface NumberRowProps {
  label: string;
  hint: string;
  /** Null while the value is still loading. */
  value: number | null;
  unit: string;
  /** Currency reads before the amount, a measure after it. */
  placement?: 'prefix' | 'suffix';
  min?: number;
  step?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}

/** Numeric settings commit on blur rather than on every keystroke, so the
    audit log gets one entry per real change. Enter commits too, by leaving
    the box. */
function NumberRow({ label, hint, value, unit, placement, min = 0, step = 1, disabled, onCommit }: NumberRowProps) {
  return (
    <SettingRow label={label} hint={hint}>
      <UnitInput
        unit={unit}
        placement={placement}
        type="number"
        inputMode="numeric"
        min={min}
        step={step}
        defaultValue={value ?? ''}
        key={String(value)}
        disabled={disabled || value === null}
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (!Number.isNaN(next) && next !== value) onCommit(next);
        }}
      />
    </SettingRow>
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

/** The model in use, spelled out under the picker: what each clip costs and
    looks like, without reading it out of a long option label. */
function ModelSpecs({ model }: { model: VideoModelOption }) {
  return (
    <dl className="model-specs">
      <div>
        <dt>Clip length</dt>
        <dd>{model.durationSeconds} s</dd>
      </div>
      <div>
        <dt>Resolution</dt>
        <dd>{model.resolution ?? '—'}</dd>
      </div>
      <div>
        <dt>List price</dt>
        <dd>
          {model.pricePerVideoUsd === null ? 'Varies' : `$${model.pricePerVideoUsd.toFixed(2)}`}
          {model.pricePerVideoUsd === null ? null : <small> / video</small>}
        </dd>
      </div>
    </dl>
  );
}

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
  const selected = settings?.models.find((model) => model.id === settings.videoModel);

  let notice: ReactNode = null;
  if (problem) {
    notice = (
      <div role="alert" className="alert alert-danger alert-bar">
        <span>Couldn&rsquo;t load the video models: {problem}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  } else if (settings?.videoModelAvailable === false) {
    notice = (
      <div role="alert" className="alert alert-warning">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>
          The model in use can no longer render a 360° try-on, so every new video will fail. Pick another.
        </span>
      </div>
    );
  } else if (selected) {
    notice = <ModelSpecs model={selected} />;
  }

  return (
    <SettingRow
      stacked
      label="360° video model"
      hint={<>Renders every 360° try-on video. Prices are OpenRouter&rsquo;s list price per clip.</>}
      after={notice}
    >
      <select
        className="select"
        aria-label="360° video model"
        value={settings?.videoModel ?? ''}
        disabled={loading || saving || !settings?.models.length}
        onChange={(event) => void choose(event.target.value)}
      >
        {loading ? <option value="">Loading models…</option> : null}
        {settings && !selected ? (
          <option value={settings.videoModel}>{settings.videoModel || 'No model'} — not available</option>
        ) : null}
        {settings?.models.map((model) => (
          <option key={model.id} value={model.id}>
            {describeModel(model, settings.defaultModel)}
          </option>
        ))}
      </select>
    </SettingRow>
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
      unit="৳"
      placement="prefix"
      disabled={Boolean(ai.loadError)}
      onCommit={(value) => void save(value)}
    />
  );
}

export default function SettingsPage() {
  const settings = useStore((state) => state.settings);
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

      <section className="settings-group" aria-labelledby="settings-platform">
        <h2 className="settings-eyebrow" id="settings-platform">
          Platform
        </h2>
        <div className="settings-grid">
          <SettingsCard icon={ReceiptText} title="Bookings & fees" description="What customers pay on top of a service.">
            <NumberRow
              label="Platform fee"
              hint="Added to every booking total"
              value={settings.platformFee}
              unit="৳"
              placement="prefix"
              onCommit={(value) => set('platformFee', value)}
            />
            <TryOnPriceRow ai={ai} />
          </SettingsCard>

          <SettingsCard
            icon={ShieldCheck}
            title="Verification & security"
            description="The one-time codes that prove a phone number."
          >
            <NumberRow
              label="OTP expiry"
              hint="How long a verification code stays valid"
              value={settings.otpExpiryMinutes}
              unit="min"
              min={1}
              onCommit={(value) => set('otpExpiryMinutes', value)}
            />
            <NumberRow
              label="OTP resend cooldown"
              hint="Wait before a new code can be requested"
              value={settings.otpResendCooldownMinutes}
              unit="min"
              min={1}
              onCommit={(value) => set('otpResendCooldownMinutes', value)}
            />
          </SettingsCard>

          <SettingsCard icon={BellRing} title="Notifications" description="The channels the platform writes to people on.">
            <ToggleRow
              label="SMS notifications"
              hint="Booking updates and OTP codes"
              checked={settings.smsEnabled}
              onChange={(value) => set('smsEnabled', value)}
            />
            <ToggleRow
              label="Email notifications"
              hint="Receipts and monthly summaries"
              checked={settings.emailEnabled}
              onChange={(value) => set('emailEnabled', value)}
            />
          </SettingsCard>

          <SettingsCard icon={Sparkles} title="AI generation" description="The model behind every 360° try-on video.">
            <VideoModelRow ai={ai} />
          </SettingsCard>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="settings-membership">
        <h2 className="settings-eyebrow" id="settings-membership">
          Membership
        </h2>
        <SubscriptionTiers />
      </section>
    </>
  );
}
