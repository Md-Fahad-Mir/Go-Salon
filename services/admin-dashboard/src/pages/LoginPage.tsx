import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Field } from '../components/ui/Field';
import { GoSalonMark } from '../components/ui/GoSalonMark';
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
    <div className="login">
      <aside className="login-aside" aria-hidden="true">
        <div className="login-brand">
          <span className="sidebar-mark">
            <GoSalonMark />
          </span>
          <span className="sidebar-wordmark">
            Go Salon <span>ADMIN</span>
          </span>
        </div>
        <div>
          <p className="login-eyebrow">Admin console</p>
          <p className="login-headline">Hairstyles, users, salons and payments, in one place.</p>
        </div>
        <p className="login-aside-foot">v0.9 · dhaka-prod</p>
      </aside>

      <main className="login-main">
        <form className="card login-card" onSubmit={handleSubmit}>
          <header className="login-head">
            <span className="sidebar-mark" aria-hidden="true">
              <GoSalonMark />
            </span>
            <h1>Go Salon admin</h1>
            <p>Sign in with your admin credentials</p>
          </header>
          <div className="stack">
            {error ? (
              <div role="alert" className="alert alert-danger">
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

            <button type="submit" className="btn btn-primary btn-block login-submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
