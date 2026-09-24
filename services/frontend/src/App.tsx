import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LanguageProvider } from './components/LanguageProvider';
import { ThemeProvider } from './components/ThemeProvider';
import {
  AdminOnly,
  CustomerOnly,
  ProviderOnly,
  PublicOnly,
  RequireAuth,
  RequirePendingVerification,
  RoleOnly,
  RootRedirect,
  WomensStylistOnly,
} from './components/RouteGuards';
import { AuthProvider } from './components/AuthProvider';
import { RealtimeProvider } from './components/RealtimeProvider';
import { ScrollToTop } from './components/ScrollToTop';
import { AppFrame } from './components/layout/AppFrame';
import { Spinner } from './components/common/Spinner';

/* One bundle per screen keeps first paint small on a phone. */
const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const OTPPage = lazy(() => import('./pages/auth/OTPPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));

/* Sign-up: the account-type chooser, then one screen per account someone can
   create. A salon employee has none — the owner creates that account. */
const AccountTypePage = lazy(() => import('./pages/auth/AccountTypePage'));
const ChangePasswordPage = lazy(() => import('./pages/profile/ChangePasswordPage'));
const AdminHomePage = lazy(() => import('./pages/AdminHomePage'));
const CustomerRegisterPage = lazy(() => import('./pages/auth/register/CustomerRegisterPage'));
const BarberRegisterPage = lazy(() => import('./pages/auth/register/BarberRegisterPage'));
const SalonOwnerRegisterPage = lazy(() => import('./pages/auth/register/SalonOwnerRegisterPage'));

const HomePage = lazy(() => import('./pages/HomePage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const HairstyleDetailPage = lazy(() => import('./pages/HairstyleDetailPage'));
const ProfessionalDetailPage = lazy(() => import('./pages/ProfessionalDetailPage'));
const ProfessionalReviewsPage = lazy(() => import('./pages/ProfessionalReviewsPage'));

const ServiceSelectPage = lazy(() => import('./pages/booking/ServiceSelectPage'));
const StaffSelectPage = lazy(() => import('./pages/booking/StaffSelectPage'));
const DateTimePage = lazy(() => import('./pages/booking/DateTimePage'));
const SummaryPage = lazy(() => import('./pages/booking/SummaryPage'));
const ConfirmationPage = lazy(() => import('./pages/booking/ConfirmationPage'));

const BookingsPage = lazy(() => import('./pages/BookingsPage'));
const BookingDetailPage = lazy(() => import('./pages/BookingDetailPage'));

const TryOnHomePage = lazy(() => import('./pages/tryon/TryOnHomePage'));
const Capture360Page = lazy(() => import('./pages/tryon/Capture360Page'));
const PhotoUploadPage = lazy(() => import('./pages/tryon/PhotoUploadPage'));
const StyleSelectPage = lazy(() => import('./pages/tryon/StyleSelectPage'));
const PreviewPage = lazy(() => import('./pages/tryon/PreviewPage'));
const HistoryPage = lazy(() => import('./pages/tryon/HistoryPage'));

const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const EditProfilePage = lazy(() => import('./pages/profile/EditProfilePage'));
const MyReviewsPage = lazy(() => import('./pages/profile/MyReviewsPage'));
const SettingsPage = lazy(() => import('./pages/profile/SettingsPage'));
const HelpPage = lazy(() => import('./pages/profile/HelpPage'));

/* Provider app — one bundle per screen, same as the customer side. */
const QueuePage = lazy(() => import('./pages/provider/QueuePage'));
const RequestsPage = lazy(() => import('./pages/provider/RequestsPage'));
const ProSettingsPage = lazy(() => import('./pages/provider/ProSettingsPage'));
const CalendarPage = lazy(() => import('./pages/provider/CalendarPage'));
const ProServicesPage = lazy(() => import('./pages/provider/ServicesPage'));
const PortfolioPage = lazy(() => import('./pages/provider/PortfolioPage'));
const EarningsPage = lazy(() => import('./pages/provider/EarningsPage'));
const ProviderProfilePage = lazy(() => import('./pages/provider/ProviderProfilePage'));
const AppointmentPage = lazy(() => import('./pages/provider/AppointmentPage'));
const SalonQueuePage = lazy(() => import('./pages/provider/SalonQueuePage'));
const StaffRosterPage = lazy(() => import('./pages/provider/StaffRosterPage'));
const StaffMemberPage = lazy(() => import('./pages/provider/StaffMemberPage'));
const SalonServicesPage = lazy(() => import('./pages/provider/SalonServicesPage'));
const SalonProfilePage = lazy(() => import('./pages/provider/SalonProfilePage'));
const AnalyticsPage = lazy(() => import('./pages/provider/AnalyticsPage'));
const ShiftPage = lazy(() => import('./pages/provider/ShiftPage'));
const PerformancePage = lazy(() => import('./pages/provider/PerformancePage'));
const ClientsPage = lazy(() => import('./pages/provider/ClientsPage'));
const ClientProfilePage = lazy(() => import('./pages/provider/ClientProfilePage'));
const TreatmentsPage = lazy(() => import('./pages/provider/TreatmentsPage'));
const LookbookPage = lazy(() => import('./pages/provider/LookbookPage'));

const JoinPage = lazy(() => import('./pages/tenancy/JoinPage'));
/* Its own chunk, and the reason this one matters: the QR decoder rides in it,
   and a customer who never scans anything never downloads it. */
const ScanJoinPage = lazy(() => import('./pages/tenancy/ScanJoinPage'));

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const LegalPage = lazy(() => import('./pages/profile/LegalPage'));

const OWNER = ['salon_owner'] as const;
const EMPLOYEE = ['salon_employee'] as const;

function RouteFallback() {
  return (
    <div className="fullscreen-center" aria-busy="true" style={{ minHeight: '100dvh' }}>
      <Spinner size="lg" label="Loading screen" />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <BrowserRouter>
            <ScrollToTop />
            <AuthProvider>
            <RealtimeProvider>
            <AppFrame>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<RootRedirect />} />

                  {/* What a salon's QR code opens. Deliberately unguarded:
                      whoever scans it may be signed in, signed out, or holding
                      the wrong kind of account, and each of those wants a
                      different answer rather than a redirect. `PublicOnly`
                      would bounce the signed-in customer it is meant for, and
                      `CustomerOnly` would throw an owner out with no word
                      about why. The screen itself does the branching. */}
                  <Route path="/join/:token" element={<JoinPage />} />

                  {/* Signed-out only */}
                  <Route element={<PublicOnly />}>
                    <Route path="/welcome" element={<WelcomePage />} />
                    <Route path="/auth/login" element={<LoginPage />} />
                    {/* The code screen belongs to a sign-up that is waiting
                        for one; there is nothing to verify without it. */}
                    <Route element={<RequirePendingVerification />}>
                      <Route path="/auth/otp" element={<OTPPage />} />
                    </Route>
                    <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

                    <Route path="/auth/register" element={<AccountTypePage />} />
                    <Route path="/auth/register/customer" element={<CustomerRegisterPage />} />
                    <Route path="/auth/register/barber" element={<BarberRegisterPage />} />
                    <Route path="/auth/register/salon-owner" element={<SalonOwnerRegisterPage />} />
                  </Route>

                  {/* Signed-in */}
                  <Route element={<RequireAuth />}>
                    {/* Customer app */}
                    <Route element={<CustomerOnly />}>
                    <Route path="/home" element={<HomePage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/hairstyle/:id" element={<HairstyleDetailPage />} />
                    <Route path="/professional/:id" element={<ProfessionalDetailPage />} />
                    <Route path="/professional/:id/reviews" element={<ProfessionalReviewsPage />} />

                    <Route path="/booking/:professionalId/service" element={<ServiceSelectPage />} />
                    <Route path="/booking/:professionalId/staff" element={<StaffSelectPage />} />
                    <Route path="/booking/:professionalId/datetime" element={<DateTimePage />} />
                    <Route path="/booking/:professionalId/summary" element={<SummaryPage />} />
                    <Route path="/booking/confirmation/:id" element={<ConfirmationPage />} />

                    <Route path="/bookings" element={<BookingsPage />} />
                    <Route path="/bookings/:id" element={<BookingDetailPage />} />

                    {/* Customer-only and signed-in: the scanner joins on
                        behalf of the account using it. The URL a phone's
                        camera opens is unguarded by contrast, because whoever
                        scans it may have no account yet. */}
                    <Route path="/join-salon" element={<ScanJoinPage />} />

                    <Route path="/ai-tryon" element={<TryOnHomePage />} />
                    <Route path="/ai-tryon/capture-360" element={<Capture360Page />} />
                    <Route path="/ai-tryon/upload" element={<PhotoUploadPage />} />
                    <Route path="/ai-tryon/select" element={<StyleSelectPage />} />
                    <Route path="/ai-tryon/preview/:id" element={<PreviewPage />} />
                    <Route path="/ai-tryon/history" element={<HistoryPage />} />

                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/profile/edit" element={<EditProfilePage />} />
                    <Route path="/profile/reviews" element={<MyReviewsPage />} />
                    <Route path="/profile/settings" element={<SettingsPage />} />
                    <Route path="/profile/help" element={<HelpPage />} />
                    </Route>

                    {/* Changing a password is the same screen whatever the
                        role, so it sits outside the customer-only block. The
                        terms and the privacy notice are the same document for
                        everyone for the same reason — only the customer's
                        Settings links to them today. */}
                    <Route path="/profile/password" element={<ChangePasswordPage />} />
                    <Route path="/profile/terms" element={<LegalPage doc="terms" />} />
                    <Route path="/profile/privacy" element={<LegalPage doc="privacy" />} />

                    <Route element={<AdminOnly />}>
                      <Route path="/admin-console" element={<AdminHomePage />} />
                    </Route>

                    {/* Provider app */}
                    <Route element={<ProviderOnly />}>
                      <Route path="/pro/queue" element={<QueuePage />} />
                      {/* Every professional has these two, whatever their
                          role: what is waiting on them, and the app itself. */}
                      <Route path="/pro/requests" element={<RequestsPage />} />
                      <Route path="/pro/settings" element={<ProSettingsPage />} />
                      <Route path="/pro/calendar" element={<CalendarPage />} />
                      <Route path="/pro/services" element={<ProServicesPage />} />
                      <Route path="/pro/portfolio" element={<PortfolioPage />} />
                      <Route path="/pro/earnings" element={<EarningsPage />} />
                      <Route path="/pro/profile" element={<ProviderProfilePage />} />
                      <Route path="/pro/appointment/:id" element={<AppointmentPage />} />

                      <Route element={<RoleOnly allow={OWNER} />}>
                        <Route path="/pro/salon/queue" element={<SalonQueuePage />} />
                        <Route path="/pro/salon/staff" element={<StaffRosterPage />} />
                        <Route path="/pro/salon/staff/:id" element={<StaffMemberPage />} />
                        <Route path="/pro/salon/services" element={<SalonServicesPage />} />
                        <Route path="/pro/salon/profile" element={<SalonProfilePage />} />
                        <Route path="/pro/salon/analytics" element={<AnalyticsPage />} />
                      </Route>

                      <Route element={<RoleOnly allow={EMPLOYEE} />}>
                        <Route path="/pro/shift" element={<ShiftPage />} />
                        <Route path="/pro/performance" element={<PerformancePage />} />
                      </Route>

                      {/* A barber whose clients are women: the same role,
                          working from clients and colour rather than a queue. */}
                      <Route element={<WomensStylistOnly />}>
                        <Route path="/pro/clients" element={<ClientsPage />} />
                        <Route path="/pro/clients/:id" element={<ClientProfilePage />} />
                        <Route path="/pro/treatments" element={<TreatmentsPage />} />
                        <Route path="/pro/lookbook" element={<LookbookPage />} />
                      </Route>
                    </Route>
                  </Route>

                <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </AppFrame>
            </RealtimeProvider>
            </AuthProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </ThemeProvider>
    </LanguageProvider>
  );
}
