import type { Audience, Gender, Hairstyle, Professional, User } from '../types';

/* One rule, used everywhere the catalogue is narrowed: nearby, search, the
   hairstyle lists, the try-on picker and the recommendations. Keeping it in a
   single place is what stops the home screen and the search screen quietly
   disagreeing about what a customer should see. */

/** The audience a customer belongs to, or null when they have not said. */
export const audienceFor = (gender: Gender | undefined): Audience | null =>
  gender === 'male' ? 'men' : gender === 'female' ? 'women' : null;

/** True when something aimed at `audience` should be shown to `gender`.
    A customer with no preference sees everything; unisex is for everyone. */
export const servesGender = (audience: Audience, gender: Gender | undefined): boolean => {
  const wanted = audienceFor(gender);
  return wanted === null || audience === 'unisex' || audience === wanted;
};

/** Narrow any audience-bearing list. `override` lets the search screen show
    the other side on request without losing the customer's own default. */
export const forAudience = <T extends { audience: Audience }>(
  items: T[],
  gender: Gender | undefined,
  override?: Audience | 'all',
): T[] => {
  if (override === 'all') return items;
  if (override) return items.filter((item) => item.audience === 'unisex' || item.audience === override);
  return items.filter((item) => servesGender(item.audience, gender));
};

export const professionalsForGender = (
  list: Professional[],
  gender: Gender | undefined,
  override?: Audience | 'all',
): Professional[] => forAudience(list, gender, override);

export const hairstylesForGender = (
  list: Hairstyle[],
  gender: Gender | undefined,
  override?: Audience | 'all',
): Hairstyle[] => forAudience(list, gender, override);

/** Convenience for call sites that already hold the user. */
export const genderOf = (user: User | null | undefined): Gender | undefined => user?.gender;
