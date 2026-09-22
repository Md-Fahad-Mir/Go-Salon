import { differenceInCalendarDays, isToday, isYesterday, parseISO } from 'date-fns';
import { BellOff } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState';
import { NotificationRow } from '../components/home/NotificationRow';
import { Header } from '../components/layout/Header';
import { Screen, ScreenBody } from '../components/layout/Screen';
import { useT } from '../hooks/useLanguage';
import { useAppStore } from '../store/useAppStore';
import type { AppNotification } from '../types';
import { formatDate } from '../utils/format';

interface Group {
  label: string;
  items: AppNotification[];
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const t = useT();
  const notifications = useAppStore((s) => s.notifications);
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAllRead = useAppStore((s) => s.markAllNotificationsRead);
  const unread = notifications.filter((n) => !n.read).length;

  /* `formatDayGroup` in utils/format hardcodes its English headings, so the
     grouping is repeated here on the same rules with translated labels. */
  const groups = useMemo<Group[]>(() => {
    const sorted = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const out: Group[] = [];
    for (const item of sorted) {
      const date = parseISO(item.createdAt);
      const label = isToday(date)
        ? t('time.today')
        : isYesterday(date)
          ? t('time.yesterday')
          : differenceInCalendarDays(new Date(), date) < 7
            ? t('time.earlierThisWeek')
            : formatDate(date);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [notifications, t]);

  const open = (notification: AppNotification) => {
    if (!notification.read) markRead(notification.id);
    if (notification.link) navigate(notification.link);
  };

  return (
    <Screen nav>
      <Header
        back
        title={t('home.notifications')}
        actions={
          unread > 0 ? (
            <button type="button" className="link-btn ntf-mark-all" onClick={markAllRead}>
              {t('home.markAllRead')}
            </button>
          ) : undefined
        }
      />
      <ScreenBody>
        {groups.length === 0 ? (
          <EmptyState
            icon={<BellOff size={26} />}
            title={t('home.ntfEmptyTitle')}
            description={t('home.ntfEmptyBody')}
            className="ntf-empty"
          />
        ) : (
          groups.map((group) => (
            <section key={group.label} className="ntf-group" aria-label={group.label}>
              <h2 className="label ntf-group-label">{group.label}</h2>
              <div className="list-card stagger ntf-card">
                {group.items.map((item) => (
                  <NotificationRow key={item.id} notification={item} onOpen={open} />
                ))}
              </div>
            </section>
          ))
        )}
      </ScreenBody>
    </Screen>
  );
}
