import { Scissors, Store, UserRound, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TKey } from '../../i18n';
import type { AccountType, RegistrableAccountType } from '../../types';

/* The four account types, as the auth screens name them. The ids are the
   domain's; the words are the dictionary's. Nothing here adds a fifth: a
   women's hairstylist is a `barber`, a parlour is a `salon_owner`.

   The labels cover all four — an employee is still an account, and the
   sign-in screens name it. Only the sign-up blurbs are narrower, because an
   employee has nothing to sign up for. */

export const ACCOUNT_TYPE_KEYS: Record<AccountType, TKey> = {
  customer: 'auth.typeCustomer',
  barber: 'auth.typeBarber',
  salon_owner: 'auth.typeOwner',
  salon_employee: 'auth.typeEmployee',
};

/** The one line under each option on the chooser. */
export const ACCOUNT_TYPE_BLURB_KEYS: Record<RegistrableAccountType, TKey> = {
  customer: 'auth.typeCustomerBlurb',
  barber: 'auth.typeBarberBlurb',
  salon_owner: 'auth.typeOwnerBlurb',
};

export const ACCOUNT_TYPE_ICONS: Record<AccountType, LucideIcon> = {
  customer: UserRound,
  barber: Scissors,
  salon_owner: Store,
  salon_employee: Users,
};
