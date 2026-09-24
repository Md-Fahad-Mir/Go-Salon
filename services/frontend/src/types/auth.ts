/* ==========================================================================
   Authentication — the four kinds of account a person can create.

   The app's internal `UserRole` is what a signed-in session carries and what
   every guard and dashboard reads. This file models the other half: what the
   *sign-up* screens ask for. There are four account types; "female barber",
   "salon" and "parlour" are variations captured as fields inside one of
   these, never as separate account types of their own.

   Three of the four can be registered. A salon employee cannot: their
   account is made by the owner who adds their chair, and they only ever sign
   in with what the owner gives them. That is why `RegistrableAccountType`
   exists and why there is no employee registration payload below — the
   frontend has nowhere to put one.
   ========================================================================== */

import type {
  Audience,
  BusinessType,
  Gender,
  HairLength,
  HairType,
  Location,
  User,
} from './index';

/** The four kinds of account the app knows. Admin is not one of them: those
    accounts are made by the platform, never registered. */
export type AccountType = 'customer' | 'barber' | 'salon_owner' | 'salon_employee';

/** The types someone can create for themselves. An employee is missing on
    purpose: the owner creates that account, so there is no sign-up for it.
    Every route, chooser entry and pending screen is typed against this, which
    is what makes an employee sign-up impossible to add by accident. */
export type RegistrableAccountType = Exclude<AccountType, 'salon_employee'>;

/** What every account gives us, whichever type it is. */
export interface RegistrationBase {
  /** E.164, already verified by the OTP step. */
  phone: string;
  name: string;
  email?: string;
  /** Required. Signing in is a phone and a password; the code is only how a
      phone is proved, once, at sign-up. */
  password: string;
  location: Location;
  acceptedTerms: boolean;
}

/** Someone booking a chair.

    The account and nothing else. The sign-up used to ask for an area and a
    hair profile as well, over three screens; a customer now reaches this
    from a salon's QR code, standing at its counter, and the only thing worth
    asking before the code is texted is who they are. Every field the backend
    treats as optional — location, gender, hair type, hair length — is
    optional here too, and simply not sent. The profile screen still takes
    them later. */
export interface CustomerRegistration extends Omit<RegistrationBase, 'location'> {
  accountType: 'customer';
  location?: Location;
  gender?: Gender;
  hairType?: HairType;
  hairLength?: HairLength;
}

/** A barber or hairstylist working for themselves. `audience` is where a
    women's hairstylist differs from a gents barber — same account type. */
export interface BarberRegistration extends RegistrationBase {
  accountType: 'barber';
  /** Trading name customers see. A solo barber often uses their own name. */
  businessName?: string;
  audience: Audience;
  experienceYears: number;
  tagline?: string;
  /** Ids from `SUGGESTED_SERVICES`. Prices are set later, in the provider
      app's own Services screen. */
  serviceIds: string[];
}

/** Whoever runs the place — a gents salon, a women's parlour, a unisex
    salon. One account type; the kind of place is `type` + `audience`. */
export interface SalonOwnerRegistration extends RegistrationBase {
  accountType: 'salon_owner';
  businessName: string;
  type: BusinessType;
  audience: Audience;
  address: string;
  /** The shop's own line, when it differs from the owner's mobile. */
  businessPhone?: string;
}

export type RegistrationRequest =
  | CustomerRegistration
  | BarberRegistration
  | SalonOwnerRegistration;

/** The registrations that are a business and so need approving. There is no
    employee among them: an owner adds that chair from inside their own app. */
export type ProfessionalRegistration = Exclude<RegistrationRequest, CustomerRegistration>;

/** What registering ends in.

    Never a session: the account exists but its phone is unproved, so the
    backend asks for a code and the caller goes to the verification screen.
    Verifying that code is what issues the first pair of tokens. */
export interface VerificationRequired {
  phone: string;
  purpose: 'registration';
  /** Seconds before another code may be asked for. */
  resendIn: number;
  expiresInMinutes: number;
  user: User;
}

/** A signed-in session, exactly as the backend returns it. */
export interface AuthSession {
  access: string;
  refresh: string;
  user: User;
}

/** How someone asks for a password reset. Phone is the norm here; email is
    accepted because a salon's desktop login is usually an email address. */
export type ResetChannel = 'phone' | 'email';
