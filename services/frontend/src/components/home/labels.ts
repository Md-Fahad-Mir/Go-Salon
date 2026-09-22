import type { TKey } from '../../i18n';
import type { FaceShape, Feasibility, Hairstyle, Occasion } from '../../types';


/* Translation keys for the option lists in `src/constants`, keyed by the same
   `id` the constants use, so the data layer stays language-free. */

export const OCCASION_KEYS: Record<Occasion, TKey> = {
  casual: 'home.occasionCasual',
  formal: 'home.occasionFormal',
  wedding: 'home.occasionWedding',
  party: 'home.occasionParty',
  business: 'home.occasionBusiness',
  date: 'home.occasionDate',
};

export const FACE_SHAPE_KEYS: Record<FaceShape, TKey> = {
  oval: 'home.faceOval',
  round: 'home.faceRound',
  square: 'home.faceSquare',
  heart: 'home.faceHeart',
  oblong: 'home.faceOblong',
};

export const UPKEEP_KEYS: Record<Hairstyle['maintenance'], TKey> = {
  low: 'home.upkeepLow',
  medium: 'home.upkeepMedium',
  high: 'home.upkeepHigh',
};

export const FEASIBILITY_KEYS: Record<Feasibility, TKey> = {
  easy: 'home.feasEasy',
  moderate: 'home.feasModerate',
  challenging: 'home.feasChallenging',
};
