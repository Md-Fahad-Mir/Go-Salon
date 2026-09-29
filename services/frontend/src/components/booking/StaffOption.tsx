import { Users } from 'lucide-react';
import type { StaffMember } from '../../types';
import { useT } from '../../hooks/useLanguage';
import { formatNumber } from '../../utils/format';
import { Avatar } from '../common/Avatar';

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
        <Avatar name={member.name} src={member.avatar} accent={!member.avatar} size="lg" />
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
              <span className="dim">{t('booking.years', { count: formatNumber(member.experienceYears) })}</span>
            </span>
            <span className="option-sub truncate">{member.specialties.join(' · ')}</span>
          </>
        ) : null}
      </span>
      <span className="radio-mark" aria-hidden="true" />
    </button>
  );
}
