import { Check } from 'lucide-react';
import { TRY_ON_STAGES, type TryOnStage } from '../../store/useTryOnStore';
import type { TKey } from '../../i18n';
import { useT } from '../../hooks/useLanguage';
import { Art } from '../common/Art';
import { Spinner } from '../common/Spinner';

interface ProcessingScreenProps {
  /** Object URL of the photo shown behind the shimmer — the customer's own
      while the hair is styled, the styled still once it is filming. */
  photoUrl: string | null;
  /** The style being rendered. */
  styleName: string;
  stage: TryOnStage;
}

/* TRY_ON_STAGES carries English labels for the store; the screen shows the
   translated line for each stage id. */
const STAGE_KEYS: Record<(typeof TRY_ON_STAGES)[number]['id'], TKey> = {
  styling: 'tryon.stageStyling',
  filming: 'tryon.stageFilming',
};

/** Full-screen "Making your 360° video" while the backend and the AI service
    work.

    Both steps are real: a tick means that request came back — the screen
    never runs ahead of the work. The filming step is the long one and has no
    honest percentage, so the bar stays indeterminate through it. */
export function ProcessingScreen({ photoUrl, styleName, stage }: ProcessingScreenProps) {
  const t = useT();
  const total = TRY_ON_STAGES.length;
  const found = TRY_ON_STAGES.findIndex((s) => s.id === stage);
  const index = stage === 'done' ? total : Math.max(0, found);
  const percent = Math.round(((stage === 'done' ? total : index + 0.5) / total) * 100);
  const current = stage === 'done' ? t('tryon.stageAlmostThere') : t(STAGE_KEYS[TRY_ON_STAGES[index].id]);

  return (
    <div className="tryon-processing" aria-busy="true">
      <div className="tryon-processing-art">
        <Art ratio="square" src={photoUrl} tone={3} alt="" className="tryon-processing-photo">
          <span className="tryon-shimmer" aria-hidden="true" />
        </Art>
      </div>
      <div className="stack-xs">
        <h2>{t('tryon.processingTitle')}</h2>
        <p className="caption">{t('tryon.processingBody', { style: styleName })}</p>
      </div>
      <ol className="tryon-stages">
        {TRY_ON_STAGES.map((item, i) => {
          const state = i < index ? 'done' : i === index && stage !== 'done' ? 'active' : 'pending';
          return (
            <li
              key={item.id}
              className="tryon-stage"
              data-state={state}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span className="tryon-stage-mark" aria-hidden="true">
                {state === 'done' ? <Check size={14} strokeWidth={3} /> : state === 'active' ? <Spinner size="sm" /> : null}
              </span>
              <span>{t(STAGE_KEYS[item.id])}</span>
            </li>
          );
        })}
      </ol>
      <div
        className="tryon-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t('tryon.progressLabel')}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="small dim" role="status" aria-live="polite">
        {current}
      </p>
      <p className="small dim">{t('tryon.processingWait')}</p>
    </div>
  );
}
