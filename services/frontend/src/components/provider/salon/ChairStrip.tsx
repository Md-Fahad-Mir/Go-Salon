import { useT } from '../../../hooks/useLanguage';
import type { ProviderAppointment, StaffRecord } from '../../../types';
import { firstNameOf, formatTime } from '../../../utils/format';
import { Avatar } from '../../common/Avatar';

interface ChairStripProps {
  staff: StaffRecord[];
  /** Today's appointments across every chair. */
  appointments: ProviderAppointment[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** Every chair on the floor as one swipeable row. Each card says where that
    stylist is and who is sitting with them, and doubles as the filter for the
    feed underneath — which is why it is a toggle button, not a link. */
export function ChairStrip({ staff, appointments, selectedId, onSelect }: ChairStripProps) {
  const t = useT();

  return (
    <div className="hscroll bleed ps-chairs" role="group" aria-label={t('salon.chairStrip')}>
      {staff.map((member) => {
        const mine = appointments.filter((a) => a.staffId === member.id);
        const live = mine.find((a) => a.stage === 'in_chair');
        const next = mine.filter((a) => a.stage === 'upcoming').sort((a, b) => a.time.localeCompare(b.time))[0];
        const selected = selectedId === member.id;
        const now = live
          ? t('salon.withStylist', { name: live.customerName })
          : next
            ? t('salon.nextAt', { time: formatTime(next.time) })
            : t('salon.chairFree');

        return (
          <button
            key={member.id}
            type="button"
            className="ps-chair"
            aria-pressed={selected}
            aria-label={selected ? t('salon.clearFilter') : t('salon.filterChair', { name: member.name })}
            onClick={() => onSelect(selected ? null : member.id)}
          >
            <span className="ps-chair-head">
              <Avatar name={member.name} size="sm" />
              <span className="ps-chair-name">{firstNameOf(member.name)}</span>
            </span>
            <span className="ps-chair-now">{now}</span>
          </button>
        );
      })}
    </div>
  );
}
