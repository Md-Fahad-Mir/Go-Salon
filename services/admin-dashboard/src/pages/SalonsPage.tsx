import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { salonService } from '../utils/adminService';
import { ApiError } from '../utils/apiError';
import { PageHeader } from '../components/ui/PageHeader';
import { Field } from '../components/ui/Field';

interface FormState {
  name: string;
  businessType: 'salon' | 'barber';
  ownerName: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  bio: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  businessType: 'salon',
  ownerName: '',
  phone: '',
  email: '',
  city: 'Dhaka',
  address: '',
  bio: '',
};

const FIELD_ERROR_MAP: Partial<Record<string, keyof FormState>> = {
  business_name: 'name',
  owner_name: 'ownerName',
  owner_phone: 'phone',
  owner_email: 'email',
  city: 'city',
  address: 'address',
  bio: 'bio',
};

export default function SalonsPage() {
  const pushToast = useStore((state) => state.pushToast);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [success, setSuccess] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);
    if (!form.name.trim() || !form.ownerName.trim() || !form.phone.trim() || !form.address.trim()) return;

    setSubmitting(true);
    try {
      const result = await salonService.create({
        name: form.name.trim(),
        businessType: form.businessType,
        ownerName: form.ownerName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        city: form.city.trim(),
        address: form.address.trim(),
        bio: form.bio.trim() || undefined,
      });

      setSuccess(`"${result.salonName}" was created. ${result.ownerName} can sign in once they set a password via "Forgot password".`);
      pushToast('success', 'Salon account created', result.salonName);
      setForm(EMPTY_FORM);
      setFieldErrors({});
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        const mapped: Partial<Record<keyof FormState, string>> = {};
        for (const [key, messages] of Object.entries(err.errors)) {
          const field = FIELD_ERROR_MAP[key];
          if (field && messages[0]) mapped[field] = messages[0];
        }
        setFieldErrors(mapped);
      } else {
        setFormError('Something went wrong. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Salons & barbers"
        description="Create a new salon or parlour account on the platform."
      />

      <form className="card" style={{ maxWidth: '40rem' }} onSubmit={handleSubmit}>
        <div className="card-head">
          <h2>Create salon/parlour account</h2>
        </div>
        <div className="card-body stack-sm">
          {success ? (
            <div className="setting-row" style={{ color: 'var(--status-success-ink)' }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
              <span>{success}</span>
            </div>
          ) : null}

          {formError ? (
            <div role="alert" className="setting-row" style={{ color: 'var(--status-danger-ink)' }}>
              {formError}
            </div>
          ) : null}

          <Field label="Business name" required error={fieldErrors.name}>
            <input
              className="input"
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="e.g. Elegance Hair Studio"
              required
            />
          </Field>

          <div className="setting-row">
            <div className="info">
              <strong>Business type</strong>
              <span>Salon or parlour</span>
            </div>
            <div className="control">
              <select
                className="select"
                value={form.businessType}
                onChange={(event) => update('businessType', event.target.value as FormState['businessType'])}
              >
                <option value="salon">Salon</option>
                <option value="barber">Parlour</option>
              </select>
            </div>
          </div>

          <Field label="Owner name" required error={fieldErrors.ownerName}>
            <input
              className="input"
              value={form.ownerName}
              onChange={(event) => update('ownerName', event.target.value)}
              placeholder="Owner's full name"
              required
            />
          </Field>

          <Field label="Phone" required error={fieldErrors.phone}>
            <input
              className="input"
              type="tel"
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
              placeholder="01XXXXXXXXX"
              required
            />
          </Field>

          <Field label="Email" hint="Optional" error={fieldErrors.email}>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
              placeholder="owner@example.com"
            />
          </Field>

          <Field label="City" required error={fieldErrors.city}>
            <input
              className="input"
              value={form.city}
              onChange={(event) => update('city', event.target.value)}
              required
            />
          </Field>

          <Field label="Address" required error={fieldErrors.address}>
            <input
              className="input"
              value={form.address}
              onChange={(event) => update('address', event.target.value)}
              placeholder="House, road, area"
              required
            />
          </Field>

          <Field label="Bio" hint="Optional short description" error={fieldErrors.bio}>
            <textarea
              className="input"
              rows={3}
              value={form.bio}
              onChange={(event) => update('bio', event.target.value)}
            />
          </Field>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </>
  );
}
