import { Glasses, ScanFace, Smile, Sun } from 'lucide-react';
import type { TKey } from '../../i18n';
import { useT } from '../../hooks/useLanguage';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';

const TIPS: Array<{ icon: typeof Sun; title: TKey; body: TKey }> = [
  { icon: Sun, title: 'tryon.tipLightTitle', body: 'tryon.tipLightBody' },
  { icon: Glasses, title: 'tryon.tipHatsTitle', body: 'tryon.tipHatsBody' },
  { icon: ScanFace, title: 'tryon.tipFrameTitle', body: 'tryon.tipFrameBody' },
  { icon: Smile, title: 'tryon.tipRelaxTitle', body: 'tryon.tipRelaxBody' },
];

interface PhotoTipsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function PhotoTipsSheet({ open, onClose }: PhotoTipsSheetProps) {
  const t = useT();
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('tryon.tipsTitle')}
      description={t('tryon.tipsBody')}
      footer={<Button block onClick={onClose}>{t('tryon.gotIt')}</Button>}
    >
      <ul className="checklist tryon-tips">
        {TIPS.map((tip) => {
          const Icon = tip.icon;
          return (
            <li key={tip.title}>
              <Icon size={20} aria-hidden="true" />
              <div>
                <strong>{t(tip.title)}</strong>
                <span>{t(tip.body)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
