import { Check } from 'lucide-react';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderAppointment, StaffRecord } from '../../../types';
import { Avatar } from '../../common/Avatar';
import { BottomSheet } from '../../common/BottomSheet';

interface ReassignSheetProps {
  open: boolean;
  onClose: () => void;
  appointment: ProviderAppointment | null;
  /** Only chairs that can actually take the client. */
  staff: StaffRecord[];
  onPick: (staffId: string) => void;
}

/** Moving a client from one chair to another is the owner's power that nobody
    else has, so it is one tap from the row and one tap to finish. */
export function ReassignSheet({ open, onClose, appointment, staff, onPick }: ReassignSheetProps) {
  const t = useT();
  if (!appointment) return null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('salon.reassign')}
      description={t('salon.reassignHint', { name: appointment.customerName })}
    >
      {staff.length ? (
        <div className="stack-sm">
          {staff.map((member) => {
            const current = member.id === appointment.staffId;
            return (
              <button
                key={member.id}
                type="button"
                className="ps-pick"
                aria-disabled={current || undefined}
                disabled={current}
                onClick={() => {
                  onPick(member.id);
                  onClose();
                }}
              >
                <Avatar name={member.name} size="sm" />
                <span className="ps-pick-body">
                  <span className="ps-pick-name">{member.name}</span>
                  <span className="ps-pick-sub">{member.title}</span>
                </span>
                {current ? (
                  <span className="ps-pick-sub">{t('salon.alreadyHere')}</span>
                ) : null}
                {current ? <Check size={18} aria-hidden="true" style={{ color: 'var(--accent-ink)' }} /> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted">{t('salon.reassignEmpty')}</p>
      )}
    </BottomSheet>
  );
}
