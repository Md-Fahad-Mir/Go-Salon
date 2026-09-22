import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { BottomSheet } from './BottomSheet';

export interface SheetAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  actions: SheetAction[];
}

export function ActionSheet({ open, onClose, title, actions }: ActionSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title} closeButton={false}>
      <div className="action-list">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={cn('action-item', action.danger && 'action-item-danger')}
            disabled={action.disabled}
            onClick={() => {
              onClose();
              action.onSelect();
            }}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
