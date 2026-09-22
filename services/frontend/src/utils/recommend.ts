import type {
  Feasibility,
  Gender,
  HairLength,
  HairProfile,
  HairType,
  Hairstyle,
  HairstyleRecommendation,
  StylingDifficulty,
  TryOnStyle,
  User,
} from '../types';
import { hairstylesForGender } from './audience';

const LENGTH_ORDER = { short: 0, medium: 1, long: 2 } as const;

const HAIR_TYPES: HairType[] = ['straight', 'wavy', 'curly', 'coily'];

/** The analysis's five length buckets folded onto the catalogue's three. */
const OBSERVED_LENGTH: Record<string, HairLength | undefined> = {
  very_short: 'short',
  short: 'short',
  medium: 'medium',
  long: 'long',
  extra_long: 'long',
};

/** What the AI saw in the photo, where that is known. Preferred over the
    profile: the profile is what the customer typed at sign-up, the photo is
    what is on their head today. */
export type ObservedHair = Pick<HairProfile, 'hairLengthCategory' | 'hairTexture'>;

/** How hard is it to get from the user's hair to this style? Length can be
    cut but not grown on the day; texture mismatches take extra sessions. */
export const feasibilityFor = (user: User | null, style: Hairstyle, observed?: ObservedHair): Feasibility => {
  const seenTexture = observed?.hairTexture as HairType | undefined;
  const hairType = seenTexture && HAIR_TYPES.includes(seenTexture) ? seenTexture : user?.hairType;
  const hairLength = OBSERVED_LENGTH[observed?.hairLengthCategory ?? ''] ?? user?.hairLength;
  if (!hairType || !hairLength) return 'moderate';
  const textureOk = style.hairTypes.includes(hairType);
  const gap = LENGTH_ORDER[style.length] - LENGTH_ORDER[hairLength];
  if (gap > 1) return 'challenging';
  if (gap === 1) return textureOk ? 'moderate' : 'challenging';
  return textureOk ? 'easy' : 'moderate';
};

/** The same read for an AI recommendation, which has no length or texture
    fields of its own — the model states how hard the style is to wear instead,
    having already weighed it against the hair it can see in the photo. */
export const feasibilityFromDifficulty = (difficulty: StylingDifficulty): Feasibility =>
  difficulty === 'easy' ? 'easy' : difficulty === 'hard' ? 'challenging' : 'moderate';

/** An AI recommendation's feasibility, from the model's own read of how
    directly a barber can cut it from the hair in the photo.

    `stylingDifficulty` is how hard the style is to wear day to day, which is a
    different question — a crew cut is easy to style and also the only honest
    answer for very short hair. Only an analysis made before the model was
    asked about the current hair falls back to it. */
export const feasibilityFromFit = (recommendation: HairstyleRecommendation): Feasibility => {
  const fit = recommendation.currentHairFit;
  if (typeof fit !== 'number') return feasibilityFromDifficulty(recommendation.stylingDifficulty);
  if (recommendation.lengthChange === 'longer') return 'challenging';
  if (fit >= 75) return 'easy';
  if (fit >= 45) return 'moderate';
  return 'challenging';
};

/** Score a style for "Recommended for you". Higher is better. */
export const matchScore = (user: User | null, style: Hairstyle): number => {
  let score = style.rating * 10 + Math.log10(style.tryOns + 1) * 4;
  if (user?.hairType && style.hairTypes.includes(user.hairType)) score += 18;
  if (user?.hairLength) {
    const gap = LENGTH_ORDER[style.length] - LENGTH_ORDER[user.hairLength];
    score += gap <= 0 ? 10 : gap === 1 ? 2 : -12;
  }
  if (style.trending) score += 6;
  return score;
};

/** Recommendations respect the customer's side of the catalogue: suggesting a
    bridal updo to someone who books fades is worse than suggesting nothing. */
export const recommendedHairstyles = (user: User | null, styles: Hairstyle[], limit = 6): Hairstyle[] =>
  [...hairstylesForGender(styles, user?.gender)].sort((a, b) => matchScore(user, b) - matchScore(user, a)).slice(0, limit);

export const trendingHairstyles = (
  styles: Hairstyle[],
  limit = 8,
  gender?: Gender,
): Hairstyle[] =>
  hairstylesForGender(styles, gender).filter((s) => s.trending).sort((a, b) => b.tryOns - a.tryOns).slice(0, limit);

/* ── Anything the customer can render, in one shape ─────────────────────────
   The try-on takes either an AI recommendation or a catalogue entry, and the
   generation call needs the same three things from both: a stable id, a name
   and words describing the cut. */

/** A catalogue entry. Its description is our own copy, so it is safe to put in
    front of the image model. Weighed against the hair the AI saw when there is
    an analysis, and against the profile when there is not. */
export const styleFromHairstyle = (style: Hairstyle, user: User | null, observed?: ObservedHair): TryOnStyle => ({
  id: style.id,
  name: style.name,
  description: style.description,
  origin: 'catalogue',
  feasibility: feasibilityFor(user, style, observed),
  length: style.length,
  tone: style.tone,
});

/** An AI recommendation. `tone` only picks the placeholder art for its card. */
export const styleFromRecommendation = (
  recommendation: HairstyleRecommendation,
  tone: number,
): TryOnStyle => ({
  id: recommendation.id,
  name: recommendation.name,
  description: recommendation.description,
  origin: 'ai',
  feasibility: feasibilityFromFit(recommendation),
  tone,
  compatibilityScore: recommendation.compatibilityScore,
  whyItSuits: recommendation.whyItSuits,
});
