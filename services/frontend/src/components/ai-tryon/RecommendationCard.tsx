import { Sparkles } from 'lucide-react';
import type { HairstyleRecommendation } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { cn } from '../../utils/cn';
import { formatNumber } from '../../utils/format';
import { Art } from '../common/Art';
import { Badge } from '../common/Badge';

interface RecommendationCardProps {
  recommendation: HairstyleRecommendation;
  /** Placeholder art tone — these styles have no photo of their own. */
  tone: number;
  size?: 'sm' | 'md';
  onSelect: (recommendation: HairstyleRecommendation) => void;
  disabled?: boolean;
}

/** An AI suggestion, drawn as a catalogue card so the two rows read as one
    shelf. The metrics differ on purpose: a catalogue style shows try-on counts
    and a star rating, which an AI pick does not have — it shows the model's own
    match score and why it chose the style. Nothing here is invented. */
export function RecommendationCard({ recommendation, tone, size = 'sm', onSelect, disabled }: RecommendationCardProps) {
  const t = useT();
  return (
    <button
      type="button"
      className={cn('hs-card', `hs-card-${size}`, 'tryon-rec')}
      onClick={() => onSelect(recommendation)}
      disabled={disabled}
    >
      <Art tone={tone} ratio="portrait" alt={recommendation.name}>
        <div className="art-corner">
          <Badge tone="solid" plain pill>
            <Sparkles size={12} aria-hidden="true" /> {t('tryon.aiPickBadge')}
          </Badge>
        </div>
        <div className="art-overlay">
          <span className="hs-name">{recommendation.name}</span>
          <span className="hs-meta">
            <span>{t('tryon.aiMatch', { value: formatNumber(recommendation.compatibilityScore) })}</span>
            {/* How much of this cut the hair in the photo can give today — the
                second question every pick was asked, shown beside the first. */}
            {typeof recommendation.currentHairFit === 'number' ? (
              <span>{t('tryon.aiFit', { value: formatNumber(recommendation.currentHairFit) })}</span>
            ) : null}
          </span>
        </div>
      </Art>
    </button>
  );
}
