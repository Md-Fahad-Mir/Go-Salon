import type {
  Feasibility,
  Hairstyle,
  HairstyleRecommendation,
  StylingDifficulty,
  TryOnStyle,
} from '../types';

/** How hard a style is to get to, for an AI recommendation, which has no
    length or texture fields of its own — the model states how hard the style
    is to wear instead, having already weighed it against the hair it can see
    in the photo. */
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

/* ── Anything the customer can render, in one shape ─────────────────────────
   The try-on takes either an AI recommendation or a catalogue entry, and the
   generation call needs the same three things from both: a stable id, a name
   and words describing the cut. */

/** An admin-curated catalogue entry. Its prompt is what the admin wrote for
    the image model, and it goes to the render as the style's description —
    the same slot an AI pick's description fills, so the generation call does
    not know or care which kind it was handed.

    The catalogue says nothing about the length or texture a style needs, so
    there is nothing to weigh the customer's hair against: feasibility is the
    "cannot tell" middle, and no `length` is sent. The service's up-front
    length refusal therefore stands aside, as it does for an AI pick, and the
    observed length in the render context is what keeps the cut honest. */
export const styleFromHairstyle = (style: Hairstyle): TryOnStyle => ({
  id: style.id,
  name: style.name,
  description: style.prompt,
  origin: 'catalogue',
  feasibility: 'moderate',
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
