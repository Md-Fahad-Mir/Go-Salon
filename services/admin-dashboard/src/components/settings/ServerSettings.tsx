import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';
import { KeyRound, LockKeyhole, MessageSquareText, QrCode, RefreshCw, ShieldCheck, Timer } from 'lucide-react';
import { useStore } from '../../store/useStore';
import {
  platformConfigService,
  type ConfigEntry,
  type PlatformConfig,
  type PlatformConfigKey,
  type PlatformConfigValues,
} from '../../utils/adminService';
import { ApiError } from '../../utils/apiError';
import { Badge } from '../ui/Badge';
import { UnitInput } from '../ui/UnitInput';
import { SettingRow, SettingsCard } from './SettingRow';

type KeysOf<T> = { [K in PlatformConfigKey]: PlatformConfigValues[K] extends T ? K : never }[PlatformConfigKey];
type NumberKey = KeysOf<number>;
type TextKey = KeysOf<string>;
type RateKey = Extract<TextKey, `throttle${string}`>;

/** The server's .env settings, loaded once for every card below. */
function useServerSettings() {
  const pushToast = useStore((state) => state.pushToast);
  const recordAudit = useStore((state) => state.recordAudit);
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    platformConfigService
      .get()
      .then((data) => {
        if (live) setConfig(data);
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
    setConfig(null);
    setAttempt((n) => n + 1);
  };

  /** Saves one setting — null resets it to .env. Resolves to whether it was
      saved, so a row can put back the value still in force. */
  const save = async <K extends PlatformConfigKey>(
    key: K,
    label: string,
    value: PlatformConfigValues[K] | null,
    show: (value: PlatformConfigValues[K]) => string,
  ): Promise<boolean> => {
    const before = config?.settings[key].value;
    try {
      const next = await platformConfigService.set(key, value);
      setConfig(next);
      const after = show(next.settings[key].value);
      recordAudit({
        actionType: 'update',
        resourceType: 'Settings',
        resourceId: key,
        details: value === null ? `Reset ${label} to the server default` : `Updated ${label}`,
        before: before === undefined ? undefined : show(before),
        after,
      });
      pushToast('success', value === null ? 'Setting reset' : 'Setting saved', `${label}: ${after}`);
      return true;
    } catch (error) {
      pushToast('error', `Could not save ${label}`, error instanceof ApiError ? error.message : 'Try again.');
      return false;
    }
  };

  return { config, loadError, retry, save };
}

type ServerState = ReturnType<typeof useServerSettings>;

/** One row's saving: its entry, whether it is busy, and a revision that
    remounts an uncontrolled input so a refused value gives way to the one
    still in force. */
function useSettingRow<K extends PlatformConfigKey>(
  server: ServerState,
  key: K,
  label: string,
  show: (value: PlatformConfigValues[K]) => string,
) {
  const pushToast = useStore((state) => state.pushToast);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const entry = server.config?.settings[key];

  const revert = () => setRevision((n) => n + 1);

  const commit = async (value: PlatformConfigValues[K] | null) => {
    setBusy(true);
    const saved = await server.save(key, label, value, show);
    setBusy(false);
    if (!saved) revert();
  };

  const refuse = (message: string) => {
    pushToast('error', `Could not save ${label}`, message);
    revert();
  };

  return { entry, busy, disabled: !entry || busy, inputKey: `${String(entry?.value)}-${revision}`, commit, refuse };
}

/** Under a row's hint once it has been changed here: the .env value it
    replaced, and the way back to it. */
function OverrideNote<T>({
  entry,
  show,
  busy,
  onReset,
}: {
  entry: ConfigEntry<T> | undefined;
  show: (value: T) => string;
  busy: boolean;
  onReset: () => void;
}) {
  if (!entry?.overridden) return null;
  return (
    <span className="setting-override">
      Changed here · server default {show(entry.defaultValue)}
      <button type="button" className="setting-reset" disabled={busy} onClick={onReset}>
        Reset
      </button>
    </span>
  );
}

const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur();
};

interface NumberRowProps {
  server: ServerState;
  field: NumberKey;
  label: string;
  hint: string;
  unit: string;
  min: number;
  max: number;
}

/** A whole number with its unit, committed on blur like the rows above it. */
function NumberRow({ server, field, label, hint, unit, min, max }: NumberRowProps) {
  const show = (value: number) => `${value} ${unit}`;
  const row = useSettingRow(server, field, label, show);

  return (
    <SettingRow
      label={label}
      hint={
        <>
          {hint}
          <OverrideNote entry={row.entry} show={show} busy={row.busy} onReset={() => void row.commit(null)} />
        </>
      }
    >
      <UnitInput
        unit={unit}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        defaultValue={row.entry?.value ?? ''}
        key={row.inputKey}
        disabled={row.disabled}
        aria-label={label}
        onKeyDown={blurOnEnter}
        onBlur={(event) => {
          const text = event.target.value.trim();
          const next = Number(text);
          if (!row.entry || next === row.entry.value) return;
          if (!text || !Number.isInteger(next) || next < min || next > max) {
            row.refuse(`Enter a whole number from ${min} to ${max}.`);
            return;
          }
          void row.commit(next);
        }}
      />
    </SettingRow>
  );
}

const PERIODS = ['sec', 'min', 'hour', 'day'] as const;
type Period = (typeof PERIODS)[number];

/** A DRF rate as the server reads it — by the period's first letter, so
    "100/minute" in .env is "100 / min" here. */
function parseRate(rate: string): { count: number; period: Period } | null {
  const match = /^(\d+)\s*\/\s*([smhd])/i.exec(rate.trim());
  if (!match) return null;
  const period = PERIODS.find((p) => p[0] === match[2].toLowerCase()) ?? 'min';
  return { count: Number(match[1]), period };
}

const showRate = (rate: string): string => {
  const parsed = parseRate(rate);
  return parsed ? `${parsed.count} / ${parsed.period}` : rate;
};

/** A rate limit: how many requests, then per what, in one box. */
function RateRow({ server, field, label, hint }: { server: ServerState; field: RateKey; label: string; hint: string }) {
  const row = useSettingRow(server, field, label, showRate);
  const boxRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLInputElement>(null);
  const current = row.entry ? parseRate(row.entry.value) : null;

  /* One rate, saved once: picking a period sends the count beside it, and
     the count is sent when focus leaves the box — not when it only moves
     across to the period, which would save the old period first. */
  const submit = (period = current?.period) => {
    if (!current || !period || row.busy) return;
    const text = countRef.current?.value.trim() ?? '';
    const count = Number(text);
    if (!text || !Number.isInteger(count) || count < 1) {
      row.refuse('Enter a whole number of requests, 1 or more.');
      return;
    }
    if (count === current.count && period === current.period) return;
    void row.commit(`${count}/${period}`);
  };

  const leavingBox = (event: FocusEvent<HTMLElement>) => !boxRef.current?.contains(event.relatedTarget);

  return (
    <SettingRow
      label={label}
      hint={
        <>
          {hint}
          <OverrideNote entry={row.entry} show={showRate} busy={row.busy} onReset={() => void row.commit(null)} />
        </>
      }
    >
      <div ref={boxRef} className="unit-input unit-input-rate" data-disabled={row.disabled ? 'true' : undefined}>
        <input
          ref={countRef}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          defaultValue={current?.count ?? ''}
          key={row.inputKey}
          disabled={row.disabled}
          aria-label={`${label}: requests`}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          onBlur={(event) => leavingBox(event) && submit()}
        />
        <select
          aria-label={`${label}: per`}
          value={current?.period ?? 'min'}
          disabled={row.disabled}
          onChange={(event) => submit(event.target.value as Period)}
          onBlur={(event) => leavingBox(event) && submit()}
        >
          {PERIODS.map((period) => (
            <option key={period} value={period}>
              / {period}
            </option>
          ))}
        </select>
      </div>
    </SettingRow>
  );
}

interface TextRowProps {
  server: ServerState;
  field: TextKey;
  label: string;
  hint: string;
  type?: 'text' | 'url';
  placeholder: string;
  maxLength: number;
  /** The box takes the full width under its label — for addresses. */
  stacked?: boolean;
  after?: ReactNode;
}

/** Free text, committed on blur. Emptying the box hands the setting back to
    .env, as Reset does. */
function TextRow({ server, field, label, hint, type = 'text', placeholder, maxLength, stacked, after }: TextRowProps) {
  const show = (value: string) => value || 'not set';
  const row = useSettingRow(server, field, label, show);

  return (
    <SettingRow
      stacked={stacked}
      label={label}
      hint={
        <>
          {hint}
          <OverrideNote entry={row.entry} show={show} busy={row.busy} onReset={() => void row.commit(null)} />
        </>
      }
      after={after}
    >
      <input
        className={stacked ? 'input' : 'input input-short'}
        type={type}
        maxLength={maxLength}
        spellCheck={false}
        autoComplete="off"
        placeholder={row.entry?.defaultValue || placeholder}
        defaultValue={row.entry?.value ?? ''}
        key={row.inputKey}
        disabled={row.disabled}
        aria-label={label}
        onKeyDown={blurOnEnter}
        onBlur={(event) => {
          const text = event.target.value.trim();
          if (!row.entry || text === row.entry.value) return;
          if (text) void row.commit(text);
          else if (row.entry.overridden) void row.commit(null);
          else row.refuse('Enter a value, or leave the server default as it is.');
        }}
      />
    </SettingRow>
  );
}

const SMS_PROVIDERS = [
  { id: 'http', label: 'HTTP gateway' },
  { id: 'console', label: 'Console — development only' },
];

const showProvider = (id: string): string => SMS_PROVIDERS.find((provider) => provider.id === id)?.label ?? id;

function SmsProviderRow({ server }: { server: ServerState }) {
  const row = useSettingRow(server, 'smsProvider', 'SMS provider', showProvider);
  const value = row.entry?.value ?? '';
  const consoleAllowed = server.config?.sms.consoleAllowed ?? false;

  return (
    <SettingRow
      label="Provider"
      hint={
        <>
          How codes and booking updates reach a phone
          <OverrideNote entry={row.entry} show={showProvider} busy={row.busy} onReset={() => void row.commit(null)} />
        </>
      }
      after={
        value === 'console' ? (
          <p className="setting-note">Codes are written to the server log, not sent. Use it for local development.</p>
        ) : null
      }
    >
      <select
        className="select"
        aria-label="SMS provider"
        value={value}
        disabled={row.disabled}
        onChange={(event) => void row.commit(event.target.value)}
      >
        {!row.entry ? <option value="">Loading…</option> : null}
        {row.entry && !SMS_PROVIDERS.some((provider) => provider.id === value) ? (
          <option value={value}>{value} — from .env</option>
        ) : null}
        {SMS_PROVIDERS.map((provider) => (
          <option
            key={provider.id}
            value={provider.id}
            disabled={provider.id === 'console' && !consoleAllowed && value !== 'console'}
          >
            {provider.label}
          </option>
        ))}
      </select>
    </SettingRow>
  );
}

/** Whether the gateway's credentials are set — never what they are. */
function SmsCredentialsRow({ server }: { server: ServerState }) {
  const sms = server.config?.sms;
  return (
    <SettingRow label="API key & secret" hint="Kept in the server’s .env and never shown here">
      {sms ? (
        <span className="setting-badges">
          <Badge tone={sms.apiKeyConfigured ? 'success' : 'warning'}>{sms.apiKeyConfigured ? 'Key set' : 'No key'}</Badge>
          <Badge tone={sms.apiSecretConfigured ? 'success' : 'neutral'}>
            {sms.apiSecretConfigured ? 'Secret set' : 'No secret'}
          </Badge>
        </span>
      ) : null}
    </SettingRow>
  );
}

/** The server's .env settings an admin may override, read from and saved to
    the backend (/api/admin/settings/platform/). A row changed here says so,
    with the .env value it replaced and a way back to it. Secrets stay in
    .env and never reach this page. */
export function ServerSettings() {
  const server = useServerSettings();
  const joinBase = server.config?.settings.joinUrlBase.value;

  return (
    <>
      {server.loadError ? (
        <div role="alert" className="alert alert-danger alert-bar">
          <span>Couldn&rsquo;t load the server settings: {server.loadError}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={server.retry}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : null}

      <div className="settings-grid">
        <SettingsCard icon={KeyRound} title="Authentication" description="The one-time codes that prove a phone number.">
          <NumberRow
            server={server}
            field="otpExpirationMinutes"
            label="Code expiry"
            hint="How long a verification code stays valid"
            unit="min"
            min={1}
            max={60}
          />
          <NumberRow
            server={server}
            field="otpResendCooldownSeconds"
            label="Resend cooldown"
            hint="Wait before another code can be sent"
            unit="sec"
            min={10}
            max={3600}
          />
          <NumberRow
            server={server}
            field="otpMaxVerifyAttempts"
            label="Wrong guesses allowed"
            hint="A code is retired after this many"
            unit="tries"
            min={1}
            max={10}
          />
          <NumberRow
            server={server}
            field="otpMaxSendsPerHour"
            label="Codes per hour"
            hint="The most one number can be sent in an hour"
            unit="codes"
            min={1}
            max={30}
          />
        </SettingsCard>

        <SettingsCard icon={LockKeyhole} title="Password policy" description="The rule every account’s password meets.">
          <NumberRow
            server={server}
            field="passwordMinLength"
            label="Minimum length"
            hint="Checked at sign-up, reset and change"
            unit="chars"
            min={8}
            max={64}
          />
          <NumberRow
            server={server}
            field="passwordResetWindowSeconds"
            label="Reset window"
            hint="Time to set a new password once the code is accepted"
            unit="sec"
            min={60}
            max={3600}
          />
        </SettingsCard>

        <SettingsCard icon={MessageSquareText} title="SMS" description="The gateway codes and booking updates go out through.">
          <SmsProviderRow server={server} />
          <TextRow
            server={server}
            field="smsBaseUrl"
            label="Gateway URL"
            hint="Where the HTTP gateway takes messages"
            type="url"
            placeholder="https://"
            maxLength={300}
            stacked
          />
          <TextRow
            server={server}
            field="smsSenderId"
            label="Sender ID"
            hint="The name or number messages come from"
            placeholder="Not set"
            maxLength={20}
          />
          <NumberRow
            server={server}
            field="smsTimeoutSeconds"
            label="Gateway timeout"
            hint="How long to wait for the gateway to answer"
            unit="sec"
            min={1}
            max={60}
          />
          <SmsCredentialsRow server={server} />
        </SettingsCard>

        <SettingsCard
          icon={ShieldCheck}
          title="Security"
          description="Rate limits: how many requests a caller may make before being asked to wait."
        >
          <RateRow server={server} field="throttleAnon" label="Signed-out requests" hint="Per IP address, across the API" />
          <RateRow server={server} field="throttleUser" label="Signed-in requests" hint="Per account, across the API" />
          <RateRow server={server} field="throttleLogin" label="Sign-in attempts" hint="Per IP address — password guessing" />
          <RateRow server={server} field="throttleRegister" label="Sign-ups" hint="Per IP address" />
          <RateRow server={server} field="throttleOtp" label="Code requests" hint="Per IP address — sending and checking codes" />
          <RateRow
            server={server}
            field="throttlePasswordReset"
            label="Password resets"
            hint="Per IP address — forgot, verify and reset"
          />
        </SettingsCard>

        <SettingsCard
          icon={Timer}
          title="JWT sessions"
          description="How long a sign-in lasts. Tokens already issued keep their expiry."
        >
          <NumberRow
            server={server}
            field="jwtAccessLifetimeMinutes"
            label="Access token lifetime"
            hint="Renewed quietly while the app is in use"
            unit="min"
            min={1}
            max={1440}
          />
          <NumberRow
            server={server}
            field="jwtRefreshLifetimeDays"
            label="Refresh token lifetime"
            hint="How long someone stays signed in"
            unit="days"
            min={1}
            max={365}
          />
        </SettingsCard>

        <SettingsCard icon={QrCode} title="QR / Join URL" description="Where every salon’s QR code sends a customer.">
          <TextRow
            server={server}
            field="joinUrlBase"
            label="Join URL base"
            hint="The app’s public address"
            type="url"
            placeholder="https://"
            maxLength={200}
            stacked
            after={
              joinBase ? (
                <p className="setting-note">
                  Codes open <code>{joinBase.replace(/\/$/, '')}/join/…</code>. Codes already printed keep the address
                  they were printed with, so reprint them after a change.
                </p>
              ) : null
            }
          />
        </SettingsCard>
      </div>
    </>
  );
}
