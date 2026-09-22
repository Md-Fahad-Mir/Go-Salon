import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { HOME_ROUTE_FOR, ROUTES } from '../constants';
import { useAppStore } from '../store/useAppStore';
import { useBookingStore } from '../store/useBookingStore';
import { useProviderStore } from '../store/useProviderStore';
import { useTryOnStore } from '../store/useTryOnStore';
import { authService } from '../utils/authService';
import type {
  AuthSession,
  CustomerRegistration,
  ProfessionalRegistration,
  RegistrableAccountType,
  User,
  VerificationRequired,
} from '../types';

/** Auth flow glue: register -> verify the phone -> a session, or sign in with
    a phone and a password. Every call reaches the backend; nothing here
    decides who exists, which code is right, or what role anyone has. */
export function useAuth() {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const authStatus = useAppStore((s) => s.authStatus);
  const pendingVerification = useAppStore((s) => s.pendingVerification);
  const accountType = useAppStore((s) => s.pendingAccountType);
  const setSession = useAppStore((s) => s.setSession);
  const setPendingVerification = useAppStore((s) => s.setPendingVerification);
  const setAccountType = useAppStore((s) => s.setAccountType);
  const clearSession = useAppStore((s) => s.clearSession);

  /** Takes a session and loads whatever else belongs to that account. */
  const accept = useCallback(
    (session: AuthSession): User => {
      setSession(session);
      // A provider's own screens read from their store; loading here means
      // their first screen is not an empty flash.
      if (session.user.role && session.user.role !== 'customer') {
        void useProviderStore.getState().load();
      }
      return session.user;
    },
    [setSession],
  );

  /** Registration never signs anyone in: the phone is unproved until a code
      comes back, so this parks the sign-up and the caller shows the code
      screen. */
  const remember = useCallback(
    (verification: VerificationRequired): VerificationRequired => {
      setPendingVerification({
        phone: verification.phone,
        purpose: 'registration',
        resendIn: verification.resendIn,
      });
      return verification;
    },
    [setPendingVerification],
  );

  const registerCustomer = useCallback(
    async (request: CustomerRegistration) => remember(await authService.registerCustomer(request)),
    [remember],
  );

  const registerProfessional = useCallback(
    async (request: ProfessionalRegistration) =>
      remember(await authService.registerProfessional(request)),
    [remember],
  );

  /** Verifying a registration code activates the account and is where a new
      user's first session comes from. */
  const verifyOtp = useCallback(
    async (code: string): Promise<User> => {
      const phone = useAppStore.getState().pendingVerification?.phone;
      if (!phone) throw new Error('No sign-up is waiting for a code.');
      return accept(await authService.verifyOtp(phone, code));
    },
    [accept],
  );

  const resendOtp = useCallback(async (): Promise<number> => {
    const phone = useAppStore.getState().pendingVerification?.phone;
    if (!phone) throw new Error('No sign-up is waiting for a code.');
    const { resend_in: resendIn } = await authService.resendOtp(phone);
    setPendingVerification({ phone, purpose: 'registration', resendIn });
    return resendIn;
  }, [setPendingVerification]);

  /** Sends a fresh code to a number that already has an unverified account —
      how an owner-created employee proves their phone. */
  const startVerification = useCallback(
    async (phone: string): Promise<number> => {
      const { resend_in: resendIn } = await authService.requestOtp(phone);
      setPendingVerification({ phone, purpose: 'registration', resendIn });
      return resendIn;
    },
    [setPendingVerification],
  );

  const login = useCallback(
    async (phone: string, password: string): Promise<User> =>
      accept(await authService.login(phone, password)),
    [accept],
  );

  const changePassword = useCallback(
    async (input: { currentPassword: string; newPassword: string; confirmPassword?: string }) =>
      accept(await authService.changePassword(input)),
    [accept],
  );

  const forgotPassword = useCallback((phone: string) => authService.forgotPassword(phone), []);
  const verifyResetOtp = useCallback(
    (phone: string, code: string) => authService.verifyResetOtp(phone, code),
    [],
  );
  const resetPassword = useCallback(
    (input: { resetToken: string; password: string; confirmPassword?: string }) =>
      authService.resetPassword(input),
    [],
  );

  const chooseAccountType = useCallback(
    (type: RegistrableAccountType | null) => setAccountType(type),
    [setAccountType],
  );

  /** The first screen for whoever is signed in. */
  const landingRoute = useCallback(
    (): string => HOME_ROUTE_FOR[user?.role ?? 'customer'] ?? ROUTES.home,
    [user?.role],
  );

  /** The same, for a user handed back by a call this render — the store copy
      is a render behind at that point. */
  const landingRouteForUser = useCallback(
    (account: User): string => HOME_ROUTE_FOR[account.role ?? 'customer'] ?? ROUTES.home,
    [],
  );

  /** Tells the backend to blacklist the refresh token, then drops everything
      this device holds. The local half happens either way: a failed call must
      not leave someone signed in on a shared phone.

      Whatever the role, it ends on the sign-in screen — where `RequireAuth`
      sends anyone without a session, and one step from getting back in. */
  const logout = useCallback(async () => {
    const refresh = useAppStore.getState().refreshToken;
    try {
      if (refresh) await authService.logout(refresh);
    } catch {
      // The token may already be expired or blacklisted; nothing to save.
    } finally {
      clearSession();
      useBookingStore.getState().reset();
      useTryOnStore.getState().reset();
      useProviderStore.getState().clear();
      navigate(ROUTES.login, { replace: true });
    }
  }, [clearSession, navigate]);

  return {
    user,
    isAuthenticated,
    authStatus,
    pendingVerification,
    accountType,
    registerCustomer,
    registerProfessional,
    startVerification,
    verifyOtp,
    resendOtp,
    login,
    logout,
    forgotPassword,
    verifyResetOtp,
    resetPassword,
    changePassword,
    chooseAccountType,
    landingRoute,
    landingRouteForUser,
  };
}
