import { AlertTriangle, Check, Clock } from 'lucide-react';
import type { ComponentType } from 'react';
import type { Feasibility } from '../../types';
import type { TKey } from '../../i18n';
import { useT } from '../../hooks/useLanguage';
import { Callout } from '../common/Callout';

/* FEASIBILITY_LABELS in src/constants is English, so the label and the
   explanation both come from the dictionary here. */
const META: Record<
  Feasibility,
  {
    tone: 'success' | 'warning';
    icon: ComponentType<{ size?: number; 'aria-hidden'?: 'true' }>;
    title: TKey;
    detail: TKey;
  }
> = {
  easy: {
    tone: 'success',
    icon: Check,
    title: 'tryon.feasibilityEasy',
    detail: 'tryon.feasibilityEasyBody',
  },
  moderate: {
    tone: 'warning',
    icon: Clock,
    title: 'tryon.feasibilityModerate',
    detail: 'tryon.feasibilityModerateBody',
  },
  challenging: {
    tone: 'warning',
    icon: AlertTriangle,
    title: 'tryon.feasibilityChallenging',
    detail: 'tryon.feasibilityChallengingBody',
  },
};

/** "Easy from your current hair" — how far the user's hair is from the style. */
export function FeasibilityCallout({ feasibility }: { feasibility: Feasibility }) {
  const t = useT();
  const meta = META[feasibility];
  const Icon = meta.icon;
  return (
    <Callout
      tone={meta.tone}
      icon={<Icon size={20} aria-hidden="true" />}
      title={t(meta.title)}
      className="tryon-feasibility"
    >
      {t(meta.detail)}
    </Callout>
  );
}
