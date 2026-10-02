import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { AuthGate } from './components/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeProvider';
import { Skeleton } from './components/ui/Skeleton';
import { ROUTES } from './constants';

/* One bundle per page keeps the first paint small. */
const LoginPage = lazy(() => import('./pages/LoginPage'));
const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const HairstylesPage = lazy(() => import('./pages/HairstylesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const SalonsPage = lazy(() => import('./pages/SalonsPage'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function RouteFallback() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading page">
      <Skeleton width="14rem" height="2rem" />
      <Skeleton height="6rem" radius="0.75rem" />
      <Skeleton height="20rem" radius="0.75rem" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to={ROUTES.overview} replace />} />
            <Route
              path={ROUTES.login}
              element={
                <Suspense fallback={<RouteFallback />}>
                  <LoginPage />
                </Suspense>
              }
            />
            <Route
              path="/admin"
              element={
                <AuthGate>
                  <Layout />
                </AuthGate>
              }
            >
              <Route
                index
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <OverviewPage />
                  </Suspense>
                }
              />
              <Route
                path="hairstyles"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <HairstylesPage />
                  </Suspense>
                }
              />
              <Route
                path="users"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <UsersPage />
                  </Suspense>
                }
              />
              <Route
                path="salons-barbers"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <SalonsPage />
                  </Suspense>
                }
              />
              <Route
                path="payments"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <PaymentsPage />
                  </Suspense>
                }
              />
              <Route
                path="notifications"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <NotificationsPage />
                  </Suspense>
                }
              />
              <Route
                path="settings"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <SettingsPage />
                  </Suspense>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to={ROUTES.overview} replace />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
