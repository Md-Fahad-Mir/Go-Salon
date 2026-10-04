import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Building2, CheckCircle2, KeyRound, MapPin, Scissors, Sparkles, Store, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '../store/useStore';
import { salonService } from '../utils/adminService';
import { ApiError } from '../utils/apiError';
import { PageHeader } from '../components/ui/PageHeader';
import { Field } from '../components/ui/Field';
import { PasswordInput } from '../components/ui/PasswordInput';

interface FormState {
  name: string;
  businessType: 'salon' | 'barber';
  ownerName: string;
  phone: string;
  email: string;
  password: string;
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
  password: '',
  city: 'Dhaka',
  address: '',
  bio: '',
};

const FIELD_ERROR_MAP: Partial<Record<string, keyof FormState>> = {
  business_name: 'name',
  owner_name: 'ownerName',
  owner_phone: 'phone',
  owner_email: 'email',
  owner_password: 'password',
  city: 'city',
  address: 'address',
  bio: 'bio',
};

/* `barber` is the backend's value for a parlour. */
const BUSINESS_TYPES: Array<{ value: FormState['businessType']; label: string; icon: LucideIcon }> = [
  { value: 'salon', label: 'Salon', icon: Scissors },
  { value: 'barber', label: 'Parlour', icon: Sparkles },
];

function FormSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="form-section">
      <div className="form-section-head">
        <span className="form-section-icon" aria-hidden="true">
          <Icon size={17} strokeWidth={1.8} />
        </span>
        <h3>{title}</h3>
      </div>
      <div className="form-grid form-grid-2">{children}</div>
    </section>
  );
}

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
    if (
      !form.name.trim() ||
      !form.ownerName.trim() ||
      !form.phone.trim() ||
      !form.password ||
      !form.address.trim()
    )
      return;

    setSubmitting(true);
    try {
      const result = await salonService.create({
        name: form.name.trim(),
        businessType: form.businessType,
        ownerName: form.ownerName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        city: form.city.trim(),
        address: form.address.trim(),
        bio: form.bio.trim() || undefined,
      });

      setSuccess(
        `"${result.salonName}" was created. ${result.ownerName} can now sign in with their phone number and the password you set.`,
      );
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
        title="Salons & Parlour"
        description="Create a new salon or parlour account on the platform."
      />

      <form className="card salon-form" onSubmit={handleSubmit}>
        <div className="card-head salon-form-head">
          <span className="form-section-icon" aria-hidden="true">
            <Store size={18} strokeWidth={1.8} />
          </span>
          <h2>Create salon/parlour account</h2>
        </div>

        {success || formError ? (
          <div className="salon-form-alerts">
            {success ? (
              <div className="alert alert-success">
                <CheckCircle2 size={16} />
                <span>{success}</span>
              </div>
            ) : null}

            {formError ? (
              <div role="alert" className="alert alert-danger">
                {formError}
              </div>
            ) : null}
          </div>
        ) : null}

        <FormSection icon={Building2} title="Business">
          <Field label="Business name" required error={fieldErrors.name} className="form-span-2">
            <input
              className="input"
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="e.g. Elegance Hair Studio"
              required
            />
          </Field>

          <fieldset className="choice-group form-span-2">
            <legend className="label">Business type</legend>
            <div className="choice-grid">
              {BUSINESS_TYPES.map(({ value, label, icon: Icon }) => (
                <label key={value} className="choice" data-checked={form.businessType === value}>
                  <input
                    type="radio"
                    name="businessType"
                    value={value}
                    checked={form.businessType === value}
                    onChange={() => update('businessType', value)}
                  />
                  <span className="choice-icon" aria-hidden="true">
                    <Icon size={17} strokeWidth={1.8} />
                  </span>
                  <span className="choice-label">{label}</span>
                  <span className="choice-check" aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Bio" hint="Optional short description" error={fieldErrors.bio} className="form-span-2">
            <textarea
              className="textarea"
              rows={3}
              value={form.bio}
              onChange={(event) => update('bio', event.target.value)}
              placeholder="A few words about the salon"
            />
          </Field>
        </FormSection>

        <FormSection icon={UserRound} title="Owner">
          <Field label="Owner name" required error={fieldErrors.ownerName}>
            <input
              className="input"
              value={form.ownerName}
              onChange={(event) => update('ownerName', event.target.value)}
              placeholder="Owner's full name"
              autoComplete="off"
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
              autoComplete="off"
            />
          </Field>
        </FormSection>

        <FormSection icon={KeyRound} title="Sign-in">
          <Field label="Phone" required error={fieldErrors.phone}>
            <input
              className="input"
              type="tel"
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
              placeholder="01XXXXXXXXX"
              autoComplete="off"
              required
            />
          </Field>

          <Field
            label="Password"
            required
            error={fieldErrors.password}
            hint="At least 8 characters. The owner signs in with this phone number and password."
          >
            <PasswordInput
              value={form.password}
              onChange={(event) => update('password', event.target.value)}
              placeholder="Set an initial password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
        </FormSection>

        <FormSection icon={MapPin} title="Location">
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
        </FormSection>

        <div className="card-foot salon-form-foot">
          <span className="card-sub">
            <span className="req" aria-hidden="true">*</span> Required fields
          </span>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </>
  );
}
