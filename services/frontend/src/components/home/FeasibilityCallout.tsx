import { AlertTriangle, Check, Clock } from 'lucide-react';
import type { Hairstyle, User } from '../../types';
import { useT } from '../../hooks/useLanguage';
import type { TFunction } from '../../i18n';
import { feasibilityFor } from '../../utils/recommend';
import { Callout } from '../common/Callout';
import { HAIR_LENGTH_KEYS, HAIR_TYPE_KEYS } from '../auth/labels';
import { FEASIBILITY_KEYS } from './labels';

const LENGTH_ORDER = { short: 0, medium: 1, long: 2 } as const;

const listOf = (t: TFunction, items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : t('home.listOr', { a: items.slice(0, -1).join(', '), b: items[items.length - 1] });

/** One or two plain sentences on why a style is easy or hard from here. */
const explainFeasibility = (t: TFunction, user: User | null, style: Hairstyle): string => {
  if (!user?.hairType || !user.hairLength) return t('home.feasNoProfile');

  const gap = LENGTH_ORDER[style.length] - LENGTH_ORDER[user.hairLength];
  const textureOk = style.hairTypes.includes(user.hairType);
  /* Lower-cased for English mid-sentence use; Bangla has no case to lose. */
  const styleLength = t(HAIR_LENGTH_KEYS[style.length]).toLowerCase();
  const yourLength = t(HAIR_LENGTH_KEYS[user.hairLength]).toLowerCase();
  const yourType = t(HAIR_TYPE_KEYS[user.hairType]).toLowerCase();

  const length =
    gap > 1
      ? t('home.feasLengthMuchLonger', { style: styleLength, yours: yourLength })
      : gap === 1
        ? t('home.feasLengthLonger', { style: styleLength, yours: yourLength })
        : gap < 0
          ? t('home.feasLengthShorter', { style: styleLength, yours: yourLength })
          : t('home.feasLengthSame', { yours: yourLength });

  const texture = textureOk
    ? t('home.feasTextureOk', { type: yourType })
    : t('home.feasTextureNo', {
        types: listOf(t, style.hairTypes.map((type) => t(HAIR_TYPE_KEYS[type]).toLowerCase())),
        type: yourType,
      });

  return `${length} ${texture}`;
};

export function FeasibilityCallout({ user, style }: { user: User | null; style: Hairstyle }) {
  const t = useT();
  const feasibility = feasibilityFor(user, style);
  const tone = feasibility === 'easy' ? 'success' : 'warning';
  const Icon = feasibility === 'easy' ? Check : feasibility === 'moderate' ? Clock : AlertTriangle;
  return (
    <Callout tone={tone} className="hs-feas" icon={<Icon size={18} aria-hidden="true" />} title={t(FEASIBILITY_KEYS[feasibility])}>
      {explainFeasibility(t, user, style)}
    </Callout>
  );
}
