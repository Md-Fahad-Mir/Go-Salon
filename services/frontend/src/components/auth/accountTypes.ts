import type { TKey } from '../../i18n';
import type { AccountType } from '../../types';

/* The four account types, as the auth screens name them. The ids are the
   domain's; the words are the dictionary's. Nothing here adds a fifth: a
   women's hairstylist is a `barber`, a parlour is a `salon_owner`.

   The labels cover all four — an employee is still an account, and the
   sign-in screens name it. */

export const ACCOUNT_TYPE_KEYS: Record<AccountType, TKey> = {
  customer: 'auth.typeCustomer',
  barber: 'auth.typeBarber',
  salon_owner: 'auth.typeOwner',
  salon_employee: 'auth.typeEmployee',
};
