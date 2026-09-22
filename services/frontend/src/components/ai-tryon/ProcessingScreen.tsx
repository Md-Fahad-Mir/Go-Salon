import { Check } from 'lucide-react';
import { TRY_ON_STAGES, type TryOnStage } from '../../store/useTryOnStore';
import type { TKey } from '../../i18n';
import { useT } from '../../hooks/useLanguage';
import { formatNumber } from '../../utils/format';
import { Art } from '../common/Art';
import { Spinner } from '../common/Spinner';

interface ProcessingScreenProps {
  /** Object URL of the source photo (dimmed behind the shimmer). */
  photoUrl: string | null;
  /** The style being rendered. Absent while the photo is still being read. */
  styleName?: string;
  stage: TryOnStage;
  /** A 360 render is several calls, not one. When it is, the screen counts
      them: four angles is a minute of waiting, and a bar that does not move
      for a minute reads as a hung app. */
  ring?: { done: number; total: number };
}

/* TRY_ON_STAGES carries English labels for the store; the screen shows the
   translated line for each stage id. */
const STAGE_KEYS: Record<(typeof TRY_ON_STAGES)[number]['id'], TKey> = {
  analyzing: 'tryon.stageAnalyzing',
  generating: 'tryon.stageGenerating',
};

/** Full-screen "Working on it" while the AI service answers.

    Both steps are real network calls, so a tick means that request came back —
    the screen never runs ahead of the work. */
export function ProcessingScreen({ photoUrl, styleName, stage, ring }: ProcessingScreenProps) {
  const t = useT();
  const total = TRY_ON_STAGES.length;
  const found = TRY_ON_STAGES.findIndex((s) => s.id === stage);
  const index = stage === 'done' ? total : Math.max(0, found);
  const analysing = stage === 'analyzing';
  const currentKey = STAGE_KEYS[TRY_ON_STAGES[index]?.id];
  const counting = Boolean(ring && ring.total > 1);
  const current = counting
    ? t('tryon.stageAngle', {
        done: formatNumber(Math.min(ring!.done + 1, ring!.total)),
        total: formatNumber(ring!.total),
      })
    : stage === 'done'
      ? t('tryon.stageAlmostThere')
      : t(currentKey ?? 'tryon.stageGettingReady');
  /* While a ring is rendering, the bar tracks the angles rather than the two
     coarse stages — it is the only number on screen that is actually moving. */
  const percent = counting
    ? Math.round((ring!.done / ring!.total) * 100)
    : Math.round(((stage === 'done' ? total : index + 0.5) / total) * 100);

  return (
    <div className="tryon-processing" aria-busy="true">
      <div className="tryon-processing-art">
        <Art ratio="square" src={photoUrl} tone={3} alt="" className="tryon-processing-photo">
          <span className="tryon-shimmer" aria-hidden="true" />
        </Art>
      </div>
      <div className="stack-xs">
        <h2>{analysing ? t('tryon.analyzingTitle') : t('tryon.processingTitle')}</h2>
        <p className="caption">
          {analysing || !styleName ? t('tryon.analyzingBody') : t('tryon.processingBody', { style: styleName })}
        </p>
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
    </div>
  );
}
