import { Check } from 'lucide-react';
import type { PlatformSettings } from '../types';
import { AI_MODELS, SUBSCRIPTION_TIERS } from '../mockData/settings';
import { useStore } from '../store/useStore';
import { PageHeader } from '../components/ui/PageHeader';
import { Toggle } from '../components/ui/Toggle';
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

export default function SettingsPage() {
  const settings = useStore((state) => state.settings);
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
            <NumberRow
              label="Cancellation window"
              hint="Free cancellation before the appointment"
              value={settings.cancellationWindowHours}
              suffix="hours"
              min={0}
              onCommit={(value) => set('cancellationWindowHours', value)}
            />
            <div className="setting-row">
              <div className="info">
                <strong>Currency</strong>
                <span>Display currency across the app and receipts</span>
              </div>
              <div className="control">
                <select
                  className="select"
                  aria-label="Currency"
                  value={settings.currency}
                  onChange={(event) => set('currency', event.target.value)}
                >
                  <option value="BDT">BDT ৳</option>
                  <option value="USD">USD $</option>
                </select>
              </div>
            </div>
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
            <div className="setting-row">
              <div className="info">
                <strong>Auto-verify new businesses</strong>
                <span>Skip the manual approval queue</span>
              </div>
              <div className="control">
                <Toggle
                  checked={settings.autoVerifyBusinesses}
                  hideLabel
                  label="Auto-verify new businesses"
                  onChange={(value) => set('autoVerifyBusinesses', value)}
                />
              </div>
            </div>

            <h3 className="section-label">Required documents</h3>
            {Object.entries(settings.verificationDocs).map(([doc, required]) => (
              <div className="setting-row" key={doc}>
                <div className="info">
                  <strong>{doc}</strong>
                </div>
                <div className="control">
                  <Toggle
                    checked={required}
                    hideLabel
                    label={`Require ${doc}`}
                    onChange={(value) =>
                      updateSettings({ verificationDocs: { ...settings.verificationDocs, [doc]: value } })
                    }
                  />
                </div>
              </div>
            ))}
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

            <h3 className="section-label">Message types</h3>
            {Object.entries(settings.notificationTypes).map(([type, enabled]) => (
              <div className="setting-row" key={type}>
                <div className="info">
                  <strong>{type}</strong>
                </div>
                <div className="control">
                  <Toggle
                    checked={enabled}
                    hideLabel
                    label={type}
                    onChange={(value) =>
                      updateSettings({ notificationTypes: { ...settings.notificationTypes, [type]: value } })
                    }
                  />
                </div>
              </div>
            ))}
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
            <span className="card-sub">monthly, in {settings.currency}</span>
          </div>
          <div className="card-body stack-sm">
            {SUBSCRIPTION_TIERS.map((tier) => (
              <article
                className="tier-card"
                key={tier.id}
                data-featured={'featured' in tier && tier.featured ? 'true' : 'false'}
              >
                <div className="row-between">
                  <strong>{tier.name}</strong>
                  <span className="strong">{tier.price === 0 ? 'Free' : `${formatBdt(tier.price)} / mo`}</span>
                </div>
                <ul>
                  {tier.features.map((feature) => (
                    <li key={feature}>
                      <Check size={14} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
