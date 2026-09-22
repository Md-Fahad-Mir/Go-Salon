import { Check, ChevronDown } from 'lucide-react';
import { useId } from 'react';
import type { Service } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { formatDuration } from '../../utils/format';
import { Badge } from '../common/Badge';
import { Price } from '../common/Price';

interface ServiceOptionProps {
  service: Service;
  selected: boolean;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
  matchesTryOn?: boolean;
}

/** Multi-select service row. The card holds two separate buttons so opening
    the details never toggles the selection (and no button nests in another). */
export function ServiceOption({ service, selected, expanded, onToggle, onExpand, matchesTryOn }: ServiceOptionProps) {
  const t = useT();
  const detailsId = useId();
  return (
    <div className="option bk-service" data-selected={selected ? 'true' : undefined}>
      <button type="button" className="bk-service-main" aria-pressed={selected} onClick={onToggle}>
        <span className="bk-check" data-on={selected ? 'true' : undefined} aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
        <span className="option-body">
          <span className="bk-service-title">
            <span className="option-title">{service.name}</span>
            {matchesTryOn ? <Badge tone="solid" plain pill>{t('booking.matchesTryOn')}</Badge> : null}
            {service.popular ? <Badge tone="accent" plain pill>{t('booking.popular')}</Badge> : null}
          </span>
          <span className="option-sub clamp-2">
            {formatDuration(service.duration)} · {service.description}
          </span>
        </span>
        <Price value={service.price} className="option-end" />
      </button>
      <button
        type="button"
        className="bk-service-more"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onExpand}
      >
        {expanded ? t('booking.hideDetails') : t('booking.details')}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <ul id={detailsId} className="bk-service-details" hidden={!expanded}>
        <li className="label">{t('booking.includes')}</li>
        {service.includes.map((item) => (
          <li key={item}>
            <Check size={14} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
