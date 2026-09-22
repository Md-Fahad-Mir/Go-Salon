/* Lookups the business screens share. Everything here maps a domain value to a
   dictionary key rather than to English, so the label follows the language. */

import { addDays, startOfWeek } from 'date-fns';
import { PAYOUT_METHODS, TAKINGS_METHODS, WEEKDAYS, type Tone } from '../../../constants';
import type { TranslationKey } from '../../../i18n';
import type { PayoutMethod, ProviderRole, TakingsMethod, VerificationStage, Weekday } from '../../../types';
import { formatPattern } from '../../../utils/format';

export const ROLE_KEYS: Record<ProviderRole, TranslationKey> = {
  barber: 'role.barber',
  salon_owner: 'role.salonOwner',
  salon_employee: 'role.salonEmployee',
};

/** Who each role suits, for the onboarding tiles. */
export const ROLE_WHO_KEYS: Record<ProviderRole, TranslationKey> = {
  barber: 'pb.roleBarberWho',
  salon_owner: 'pb.roleOwnerWho',
  salon_employee: 'pb.roleEmployeeWho',
};

/** Whether the business has been checked over, as a badge. `rejected` reads as
    unverified but in the danger tone, because it is not a neutral fact. A
    reviewer sets this from the admin site — the app asks for nothing towards
    it, and a business cannot put itself in the queue. */
export const VERIFICATION: Record<VerificationStage, { key: TranslationKey; tone: Tone }> = {
  verified: { key: 'pro.verified', tone: 'success' },
  pending: { key: 'pro.verificationPending', tone: 'warning' },
  unverified: { key: 'pro.unverified', tone: 'neutral' },
  rejected: { key: 'pro.unverified', tone: 'danger' },
};

const TAKINGS_BY_ID = new Map(TAKINGS_METHODS.map((method) => [method.id, method]));
const PAYOUT_BY_ID = new Map(PAYOUT_METHODS.map((method) => [method.id, method]));

/** How a completed booking was settled — or that nobody recorded it.

    `undefined` is the server's "nobody said", and it is not cash. Naming it
    cash invents a fact about the till, and drawing it in cash's colour makes
    the invention look counted. */
export const takingsLabelKey = (id?: TakingsMethod): TranslationKey =>
  (id ? TAKINGS_BY_ID.get(id)?.labelKey : undefined) as TranslationKey
  ?? 'pro.takingsUnrecorded';

export const takingsColor = (id?: TakingsMethod): string =>
  `var(${(id ? TAKINGS_BY_ID.get(id)?.colorVar : undefined) ?? '--text-tertiary'})`;

export const payoutLabelKey = (id: PayoutMethod): TranslationKey =>
  (PAYOUT_BY_ID.get(id)?.labelKey ?? 'pro.payoutBank') as TranslationKey;

export const payoutColor = (id: PayoutMethod): string =>
  `var(${PAYOUT_BY_ID.get(id)?.colorVar ?? '--pay-card'})`;

/** Sunday-first weekday names in the active language. date-fns carries the
    translations, so this never hand-writes a day name. */
export const weekdayNames = (): Record<Weekday, string> => {
  const sunday = startOfWeek(new Date(), { weekStartsOn: 0 });
  return WEEKDAYS.reduce<Record<Weekday, string>>((names, day, index) => {
    names[day] = formatPattern(addDays(sunday, index), 'EEEE');
    return names;
  }, {} as Record<Weekday, string>);
};
