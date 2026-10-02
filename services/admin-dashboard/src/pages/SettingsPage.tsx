import type { PlatformSettings, SubscriptionTierPlan } from '../types';
import { AI_MODELS } from '../mockData/settings';
import { useStore } from '../store/useStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Toggle } from '../components/ui/Toggle';
import { Field } from '../components/ui/Field';
import { TagInput } from '../components/ui/TagInput';
import { formatBdt } from '../utils/format';

interface NumberRowProps {
  label: string;
  hint: string;
  value: number;
  suffix?: string;
  min?: number;
  step?: number;
  onCommit: (value: number) => void;
}

/** Numeric settings commit on blur rather than on every keystroke, so the
    audit log gets one entry per real change. */
function NumberRow({ label, hint, value, suffix, min = 0, step = 1, onCommit }: NumberRowProps) {
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
          defaultValue={value}
          key={value}
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
            <NumberRow
              label="AI image price"
              hint="Charged per generated image on Advanced"
              value={settings.aiImagePrice}
              suffix="৳"
              onCommit={(value) => set('aiImagePrice', value)}
            />
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
            <div className="setting-row">
              <div className="info">
                <strong>Image model</strong>
                <span>Used for every try-on request</span>
              </div>
              <div className="control">
                <select
                  className="select"
                  aria-label="AI image model"
                  value={settings.aiModel}
                  onChange={(event) => set('aiModel', event.target.value)}
                >
                  {AI_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <NumberRow
              label="Max concurrent requests"
              hint="Queue anything above this limit"
              value={settings.aiMaxConcurrent}
              min={1}
              onCommit={(value) => set('aiMaxConcurrent', value)}
            />
            <NumberRow
              label="Processing timeout"
              hint="Fail the request after this long"
              value={settings.aiTimeoutSeconds}
              suffix="s"
              min={5}
              step={5}
              onCommit={(value) => set('aiTimeoutSeconds', value)}
            />
            <NumberRow
              label="Rate limit"
              hint="Requests per user per hour"
              value={settings.aiRateLimitPerHour}
              suffix="/hr"
              min={1}
              onCommit={(value) => set('aiRateLimitPerHour', value)}
            />
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
