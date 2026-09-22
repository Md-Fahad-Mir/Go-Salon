import { useT } from '../../hooks/useLanguage';

interface ProgressStepsProps {
  step: number; // 1-based
  total: number;
  label?: string;
}

export function ProgressSteps({ step, total, label }: ProgressStepsProps) {
  const t = useT();
  const fallback = t('steps.stepOfTotal', { step, total });
  return (
    <div className="stack-xs" aria-label={fallback}>
      <div className="steps" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <span key={i} data-done={i < step ? 'true' : undefined} />)}
      </div>
      <span className="steps-label">{label ?? fallback}</span>
    </div>
  );
}
