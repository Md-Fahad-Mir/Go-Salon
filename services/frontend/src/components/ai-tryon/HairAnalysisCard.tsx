import { Sparkles } from 'lucide-react';
import type { HairProfile } from '../../types';
import type { TKey } from '../../i18n';
import { useT } from '../../hooks/useLanguage';
import { formatNumber, titleCase } from '../../utils/format';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';

interface HairAnalysisCardProps {
  profile: HairProfile;
  summary?: string;
  /** How many views it was read from. Shown only when it is more than one. */
  angleCount?: number;
}

/* What a barber would actually say back, in the order they would say it. The
   fields a single photo cannot answer — crown, back, nape — are simply absent
   from the card rather than shown empty, which is how a 360 read visibly earns
   its extra minute. */
const FACTS: Array<{ key: keyof HairProfile; label: TKey }> = [
  { key: 'faceShape', label: 'tryon.factFaceShape' },
  { key: 'headShape', label: 'tryon.factHeadShape' },
  { key: 'hairLengthObserved', label: 'tryon.factLength' },
  { key: 'hairTexture', label: 'tryon.factTexture' },
  { key: 'hairDensity', label: 'tryon.factDensity' },
  { key: 'hairline', label: 'tryon.factHairline' },
  { key: 'currentHairstyle', label: 'tryon.factCurrent' },
  { key: 'crownArea', label: 'tryon.factCrown' },
  { key: 'backOfHead', label: 'tryon.factBack' },
  { key: 'sides', label: 'tryon.factSides' },
  { key: 'nape', label: 'tryon.factNape' },
  { key: 'thinning', label: 'tryon.factThinning' },
];

/** Short values read better title-cased ("Oval", "Wavy"); a sentence does not. */
const present = (value: string): string =>
  value.length <= 24 && !value.includes(' ') ? titleCase(value) : value;

/** The AI's read of the customer, as a consultation rather than a payload. */
export function HairAnalysisCard({ profile, summary, angleCount = 1 }: HairAnalysisCardProps) {
  const t = useT();
  const facts = FACTS.map((fact) => ({ ...fact, value: String(profile[fact.key] ?? '').trim() })).filter(
    (fact) => fact.value && fact.value.toLowerCase() !== 'unknown',
  );

  if (!facts.length && !summary) return null;

  return (
    <Card className="tryon-analysis">
      <div className="between tryon-analysis-head">
        <h3>{t('tryon.analysisTitle')}</h3>
        <Badge tone="accent" plain pill>
          <Sparkles size={12} aria-hidden="true" />
          {angleCount > 1
            ? t('tryon.analysisFromAngles', { count: formatNumber(angleCount) })
            : t('tryon.analysisFromPhoto')}
        </Badge>
      </div>

      {facts.length ? (
        <dl className="tryon-analysis-grid">
          {facts.map((fact) => (
            <div key={fact.key} className="tryon-analysis-fact">
              <dt>{t(fact.label)}</dt>
              <dd>{present(fact.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {summary ? <p className="caption tryon-analysis-summary">{summary}</p> : null}
    </Card>
  );
}
