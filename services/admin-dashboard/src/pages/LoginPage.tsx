import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Field } from '../components/ui/Field';
import { useAuthStore, selectIsAuthenticated } from '../store/useAuthStore';
import { authService } from '../utils/authService';
import { ApiError } from '../utils/apiError';
import { ROUTES } from '../constants';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((state) => state.setSession);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!phone.trim() || !password) return;

    setSubmitting(true);
    setError(null);
    try {
      const session = await authService.login(phone.trim(), password);
      setSession(session.user, session.access, session.refresh);
      const redirectTo = (location.state as { from?: string } | null)?.from ?? ROUTES.overview;
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isAuthenticated) {
    return <Navigate to={ROUTES.overview} replace />;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <form className="card" style={{ width: '100%', maxWidth: '24rem' }} onSubmit={handleSubmit}>
        <div className="card-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
          <span className="sidebar-mark" aria-hidden="true" style={{ marginBottom: '0.5rem' }}>
            E
          </span>
          <h2>Go Salon admin</h2>
          <span className="card-sub">Sign in with your admin credentials</span>
        </div>
        <div className="card-body stack-sm">
          {error ? (
            <div role="alert" className="setting-row" style={{ color: 'var(--status-danger-ink)' }}>
              {error}
            </div>
          ) : null}

          <Field label="Phone" required>
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="01XXXXXXXXX"
              autoComplete="username"
              autoFocus
              required
            />
          </Field>

          <Field label="Password" required>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
