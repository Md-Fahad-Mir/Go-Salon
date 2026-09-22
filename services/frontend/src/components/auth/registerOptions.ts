import type { Audience, BusinessType } from '../../types';

/* Fixed choices the sign-up forms offer. They sit beside the steps rather
   than inside them so the screens stay component-only, the same way
   `areas.ts` and `labels.ts` hold what the other auth screens pick from. */

/** Service names are shop content and stay in English, the same way salon and
    staff names do everywhere else in the app. Prices are set later, in the
    provider app's own Services screen — a sign-up form is the wrong place to
    settle a price list. */
export const BARBER_SERVICES: Array<{ id: string; name: string }> = [
  { id: 'cut', name: 'Haircut & style' },
  { id: 'fade', name: 'Skin fade' },
  { id: 'beard', name: 'Beard trim & shape' },
  { id: 'shave', name: 'Hot towel shave' },
  { id: 'colour', name: 'Colouring' },
  { id: 'blowdry', name: 'Blow-dry & styling' },
  { id: 'treatment', name: 'Hair treatment' },
  { id: 'bridal', name: 'Bridal / holud' },
];

/** What kind of place a salon is, in the words Dhaka uses. Each answer is the
    pair of fields the catalogue already stores — a parlour is a salon whose
    customers are women, not a separate kind of account. */
export const PLACE_KINDS = {
  gents: { type: 'barber', audience: 'men' },
  parlour: { type: 'salon', audience: 'women' },
  unisex: { type: 'salon', audience: 'unisex' },
} as const satisfies Record<string, { type: BusinessType; audience: Audience }>;

export type PlaceKind = keyof typeof PLACE_KINDS;
