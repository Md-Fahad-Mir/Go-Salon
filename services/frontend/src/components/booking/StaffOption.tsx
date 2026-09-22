import { Users } from 'lucide-react';
import type { StaffMember } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { formatNumber } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { Rating } from '../common/Rating';

interface StaffOptionProps {
  /** Omit for the "Anyone available" choice. */
  member?: StaffMember;
  selected: boolean;
  onSelect: () => void;
}

export function StaffOption({ member, selected, onSelect }: StaffOptionProps) {
  const t = useT();
  return (
    <button type="button" role="radio" aria-checked={selected} className="option bk-staff" onClick={onSelect}>
      {member ? (
        <Avatar name={member.name} accent size="lg" />
      ) : (
        <span className="icon-circle bk-staff-any" aria-hidden="true">
          <Users size={22} />
        </span>
      )}
      <span className="option-body">
        <span className="option-title">{member ? member.name : t('booking.anyone')}</span>
        <span className="option-sub">{member ? member.title : t('booking.anyoneHint')}</span>
        {member ? (
          <>
            <span className="bk-staff-meta">
              {/* Nobody has rated this chair yet, so it says so rather than
                  showing a 0.0 that reads as a bad score. */}
              {member.reviewCount > 0 && member.rating !== null ? (
                <>
                  <Rating value={member.rating} count={member.reviewCount} size={12} />
                  <span className="dim">· {t('booking.years', { count: formatNumber(member.experienceYears) })}</span>
                </>
              ) : (
                <span className="dim">{t('booking.years', { count: formatNumber(member.experienceYears) })}</span>
              )}
            </span>
            <span className="option-sub truncate">{member.specialties.join(' · ')}</span>
          </>
        ) : null}
      </span>
      <span className="radio-mark" aria-hidden="true" />
    </button>
  );
}
