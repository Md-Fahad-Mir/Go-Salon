import {
  differenceInCalendarDays,
  formatDistanceToNowStrict,
  isToday,
  isYesterday,
  parseISO,
} from 'date-fns';
import { Bell, CalendarCheck, Sparkles } from 'lucide-react';
import type { AppNotification } from '../../types';
import { useT } from '../../hooks/useLanguage';
import type { TFunction } from '../../i18n';
import { formatClock, formatDate } from '../../utils/format';
import { activeDateLocale } from '../../utils/locale';

const ICONS: Record<AppNotification['kind'], typeof Bell> = {
  booking: CalendarCheck,
  promo: Sparkles,
  system: Bell,
};

/* `formatRelative` in utils/format hardcodes its English "Today"/"Yesterday"
   and " ago", so the row builds the same label from translated keys. */
const relativeLabel = (t: TFunction, value: string): string => {
  const date = parseISO(value);
  if (isToday(date)) return t('home.relToday', { time: formatClock(date) });
  if (isYesterday(date)) return t('home.relYesterday', { time: formatClock(date) });
  if (Math.abs(differenceInCalendarDays(new Date(), date)) < 7) {
    return t('home.relAgo', { time: formatDistanceToNowStrict(date, { locale: activeDateLocale() }) });
  }
  return formatDate(date);
};

interface NotificationRowProps {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
}

export function NotificationRow({ notification, onOpen }: NotificationRowProps) {
  const t = useT();
  const Icon = ICONS[notification.kind];
  const unread = !notification.read;
  return (
    <button
      type="button"
      className="ntf-row"
      data-unread={unread ? 'true' : undefined}
      data-kind={notification.kind}
      onClick={() => onOpen(notification)}
      aria-label={t(unread ? 'home.ntfAriaUnread' : 'home.ntfAria', {
        title: notification.title,
        body: notification.body,
      })}
    >
      <span className="ntf-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="ntf-body">
        <span className="ntf-title">{notification.title}</span>
        <span className="ntf-text clamp-2">{notification.body}</span>
        <span className="ntf-time">{relativeLabel(t, notification.createdAt)}</span>
      </span>
      {unread ? <span className="ntf-dot" aria-hidden="true" /> : null}
    </button>
  );
}
