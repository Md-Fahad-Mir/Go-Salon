import { useState } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../store/useStore';
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

export default function SalonsPage() {
  const createSalon = useStore((state) => state.createSalon);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.ownerName.trim() || !form.phone.trim() || !form.address.trim()) return;

    createSalon({
      name: form.name.trim(),
      businessType: form.businessType,
      ownerName: form.ownerName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      city: form.city.trim(),
      address: form.address.trim(),
      bio: form.bio.trim() || undefined,
    });

    setForm(EMPTY_FORM);
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
          <Field label="Business name" required>
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

          <Field label="Owner name" required>
            <input
              className="input"
              value={form.ownerName}
              onChange={(event) => update('ownerName', event.target.value)}
              placeholder="Owner's full name"
              required
            />
          </Field>

          <Field label="Phone" required>
            <input
              className="input"
              type="tel"
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
              placeholder="01XXXXXXXXX"
              required
            />
          </Field>

          <Field label="Email" hint="Optional">
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
              placeholder="owner@example.com"
            />
          </Field>

          <Field label="City" required>
            <input
              className="input"
              value={form.city}
              onChange={(event) => update('city', event.target.value)}
              required
            />
          </Field>

          <Field label="Address" required>
            <input
              className="input"
              value={form.address}
              onChange={(event) => update('address', event.target.value)}
              placeholder="House, road, area"
              required
            />
          </Field>

          <Field label="Bio" hint="Optional short description">
            <textarea
              className="input"
              rows={3}
              value={form.bio}
              onChange={(event) => update('bio', event.target.value)}
            />
          </Field>

          <button type="submit" className="btn btn-primary">
            Create account
          </button>
        </div>
      </form>
    </>
  );
}
