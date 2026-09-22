import { useT } from '../../../hooks/useLanguage';
import type { AppointmentStage } from '../../../types';
import { STAGE_KEYS, stagePillClass } from './queueUtils';

/** Where an appointment has got to. The dot is decorative — the word carries
    the meaning, so the state never rests on colour alone. */
export function StagePill({ stage }: { stage: AppointmentStage }) {
  const t = useT();
  return <span className={stagePillClass(stage)}>{t(STAGE_KEYS[stage])}</span>;
}
