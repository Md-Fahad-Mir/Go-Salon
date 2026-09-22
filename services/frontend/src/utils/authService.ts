/* ==========================================================================
   The authentication API.

   Every auth screen goes through here, and everything here is a real call to
   the Django service in services/backend. Nothing is mocked: the backend
   decides who exists, which code is right and what role someone has.

   This file is also the only place the two vocabularies meet. The API speaks
   snake_case and stores a profile per role; the app speaks camelCase and has
   one `User`. Mapping in one place keeps that seam out of the screens.
   ========================================================================== */

import type {
  Audience,
  AuthSession,
  BarberRegistration,
  CustomerRegistration,
  Gender,
  HairLength,
  HairType,
  Location,
  ProfessionalRegistration,
  RegistrationBase,
  SalonOwnerRegistration,
  User,
  UserRole,
  VerificationRequired,
} from '../types';
import { api } from './apiClient';

/* --- what the API returns -------------------------------------------------- */

interface ApiLocation {
  area?: string;
  city?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface ApiUser {
  id: number;
  phone: string;
  name: string;
  email: string;
  role: UserRole;
  is_phone_verified: boolean;
  try_on_credits: number;
  date_joined: string;
  profile?: {
    avatar?: string;
    gender?: string;
    hair_type?: string;
    hair_length?: string;
    location?: ApiLocation;
    barber?: { audience?: Audience; business_name?: string; avatar?: string;
               experience_years?: number; service_ids?: string[]; location?: ApiLocation };
    salon?: { id: number; name: string; location?: ApiLocation };
    employment?: { salon_id: number; salon_name: string; title: string };
  };
}

interface ApiSession {
  access: string;
  refresh: string;
  user: ApiUser;
}

interface ApiVerification {
  detail: string;
  verification_required: boolean;
  phone: string;
  purpose: 'registration';
  resend_in: number;
  expires_in_minutes: number;
  user: ApiUser;
}

interface ApiOtpSent {
  detail: string;
  purpose: string;
  resend_in: number;
  expires_in_minutes: number;
}

/* --- mapping --------------------------------------------------------------- */

const toLocation = (location: ApiLocation | undefined): Location | undefined => {
  if (!location) return undefined;
  const { latitude, longitude, area = '', city = '', address = '' } = location;
  if (latitude == null || longitude == null) {
    // The app's Location needs a point. Without one there is nothing to sort
    // by distance, so the area alone is not a location.
    return undefined;
  }
  return { lat: latitude, lng: longitude, area, city, address };
};

export function mapUser(user: ApiUser): User {
  const profile = user.profile ?? {};
  return {
    id: String(user.id),
    name: user.name,
    phone: user.phone,
    email: user.email || undefined,
    role: user.role,
    isPhoneVerified: user.is_phone_verified,
    avatar: (profile.avatar || profile.barber?.avatar || undefined) as string | undefined,
    gender: (profile.gender || undefined) as Gender | undefined,
    hairType: (profile.hair_type || undefined) as HairType | undefined,
    hairLength: (profile.hair_length || undefined) as HairLength | undefined,
    audience: profile.barber?.audience,
    location:
      toLocation(profile.location) ??
      toLocation(profile.barber?.location) ??
      toLocation(profile.salon?.location),
    createdAt: user.date_joined,
    credits: user.try_on_credits,
  };
}

const toSession = (session: ApiSession): AuthSession => ({
  access: session.access,
  refresh: session.refresh,
  user: mapUser(session.user),
});

const toVerification = (response: ApiVerification): VerificationRequired => ({
  phone: response.phone,
  purpose: 'registration',
  resendIn: response.resend_in,
  expiresInMinutes: response.expires_in_minutes,
  user: mapUser(response.user),
});

const locationPayload = (location: Location | undefined) =>
  location
    ? {
        area: location.area,
        city: location.city,
        address: location.address,
        latitude: location.lat,
        longitude: location.lng,
      }
    : undefined;

const basePayload = (request: RegistrationBase) => ({
  phone: request.phone,
  name: request.name,
  email: request.email || '',
  password: request.password,
  accepted_terms: request.acceptedTerms,
  location: locationPayload(request.location),
});

/* --- the endpoints --------------------------------------------------------- */

export const authService = {
  /* Registration. Three roles, because an employee's account is made by their
     owner and an admin's from the command line. */

  async registerCustomer(request: CustomerRegistration): Promise<VerificationRequired> {
    const response = await api.post<ApiVerification>(
      '/auth/register/customer/',
      {
        ...basePayload(request),
        gender: request.gender ?? '',
        hair_type: request.hairType,
        hair_length: request.hairLength,
      },
      { anonymous: true },
    );
    return toVerification(response);
  },

  async registerBarber(request: BarberRegistration): Promise<VerificationRequired> {
    const response = await api.post<ApiVerification>(
      '/auth/register/barber/',
      {
        ...basePayload(request),
        audience: request.audience,
        business_name: request.businessName ?? '',
        experience_years: request.experienceYears,
        service_ids: request.serviceIds,
      },
      { anonymous: true },
    );
    return toVerification(response);
  },

  async registerSalonOwner(request: SalonOwnerRegistration): Promise<VerificationRequired> {
    const response = await api.post<ApiVerification>(
      '/auth/register/salon-owner/',
      {
        ...basePayload(request),
        business_name: request.businessName,
        business_type: request.type,
        audience: request.audience,
        address: request.address,
        business_phone: request.businessPhone ?? '',
      },
      { anonymous: true },
    );
    return toVerification(response);
  },

  /** Dispatches to the endpoint for whichever account is being created. */
  registerProfessional(request: ProfessionalRegistration): Promise<VerificationRequired> {
    return request.accountType === 'barber'
      ? authService.registerBarber(request)
      : authService.registerSalonOwner(request);
  },

  /* One-time codes. The backend generates and checks them; the app never
     does either. */

  requestOtp(phone: string, purpose: 'registration' | 'password_reset' = 'registration') {
    return api.post<ApiOtpSent>('/auth/otp/request/', { phone, purpose }, { anonymous: true });
  },

  resendOtp(phone: string, purpose: 'registration' | 'password_reset' = 'registration') {
    return api.post<ApiOtpSent>('/auth/otp/resend/', { phone, purpose }, { anonymous: true });
  },

  /** Verifying a registration code is what activates the account, so this is
      where a new user's first session comes from. */
  async verifyOtp(phone: string, code: string): Promise<AuthSession> {
    const session = await api.post<ApiSession>(
      '/auth/otp/verify/',
      { phone, code, purpose: 'registration' },
      { anonymous: true },
    );
    return toSession(session);
  },

  /* Sessions. */

  async login(phone: string, password: string): Promise<AuthSession> {
    const session = await api.post<ApiSession>('/auth/login/', { phone, password }, { anonymous: true });
    return toSession(session);
  },

  /** Blacklists the refresh token server-side. Clearing the app's copy alone
      would leave a working token in whatever took it. */
  async logout(refresh: string): Promise<void> {
    await api.post<null>('/auth/logout/', { refresh });
  },

  async me(): Promise<User> {
    return mapUser(await api.get<ApiUser>('/auth/me/'));
  },

  /* Passwords. */

  forgotPassword(phone: string) {
    return api.post<ApiOtpSent>('/auth/password/forgot/', { phone }, { anonymous: true });
  },

  async verifyResetOtp(phone: string, code: string): Promise<{ resetToken: string }> {
    const response = await api.post<{ reset_token: string }>(
      '/auth/password/verify-otp/',
      { phone, code },
      { anonymous: true },
    );
    return { resetToken: response.reset_token };
  },

  resetPassword(input: { resetToken: string; password: string; confirmPassword?: string }) {
    return api.post<{ detail: string }>(
      '/auth/password/reset/',
      {
        reset_token: input.resetToken,
        password: input.password,
        confirm_password: input.confirmPassword,
      },
      { anonymous: true },
    );
  },

  /** Changing a password ends every other session, so the backend hands back
      a fresh pair to keep this one alive. */
  async changePassword(input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword?: string;
  }): Promise<AuthSession> {
    const session = await api.post<ApiSession>('/auth/password/change/', {
      current_password: input.currentPassword,
      new_password: input.newPassword,
      confirm_password: input.confirmPassword,
    });
    return toSession(session);
  },
};
