import { useT } from '../../hooks/useLanguage';
import { formatNumber } from '../../utils/format';
import { Header } from '../layout/Header';
import { ProgressSteps } from '../common/ProgressSteps';

interface BookingStepHeaderProps {
  title: string;
  /** 1-based step; omit to hide the progress bar (reschedule mode). */
  step?: number;
  total?: number;
  label?: string;
  onBack?: () => void;
}

/** Header + progress strip shared by the four wizard steps. */
export function BookingStepHeader({ title, step, total = 4, label, onBack }: BookingStepHeaderProps) {
  const t = useT();
  return (
    <>
      <Header title={title} back onBack={onBack} />
      {step ? (
        <div className="bk-steps">
          <ProgressSteps step={step} total={total} label={label ? t('booking.stepOf', { step: formatNumber(step), total: formatNumber(total), label }) : undefined} />
        </div>
      ) : null}
    </>
  );
}
