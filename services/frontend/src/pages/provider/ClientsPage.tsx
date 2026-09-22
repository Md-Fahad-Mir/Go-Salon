import { CalendarClock, Lock, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { Input } from '../../components/common/Input';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { hairLengthKey, hairTypeKey } from '../../components/provider/team/teamHelpers';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { mockClientProfiles } from '../../mockData';
import { useProviderStore } from '../../store/useProviderStore';
import { formatNumber, formatRelative, formatTime, toDateKey } from '../../utils/format';

/* The stylist's client book. Today comes first — she wants to know what is
   walking through the door and what her hair is like before it does — and the
   whole book sits underneath it. */

export default function ClientsPage() {
  const t = useT();
  const appointments = useProviderStore((state) => state.appointments);
  const [query, setQuery] = useState('');

  /* The queue and the hair book are separate fixtures, so a booking is tied to
     a record by name rather than by id — a client with no record yet is simply
     someone the stylist has not written up. */
  const byName = useMemo(
    () => new Map(mockClientProfiles.map((client) => [client.customerName, client])),
    [],
  );

  const needle = query.trim().toLowerCase();
  const matches = (name: string) => !needle || name.toLowerCase().includes(needle);

  const todayKey = toDateKey(new Date());
  const todays = useMemo(
    () =>
      appointments
        .filter((entry) => entry.date === todayKey && entry.stage !== 'cancelled')
        .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, todayKey],
  );

  const todaysShown = todays.filter((entry) => matches(entry.customerName));
  const allShown = mockClientProfiles.filter((client) => matches(client.customerName));
  const nothingMatches = Boolean(needle) && !todaysShown.length && !allShown.length;

  return (
    <Screen nav>
      <Header title={t('pt.clientsTitle')} />
      <ScreenBody>
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('pt.searchClients')}
          aria-label={t('pt.searchClients')}
          icon={<Search size={18} aria-hidden="true" />}
        />

        {nothingMatches ? (
          <EmptyState
            className="pt-empty"
            icon={<Search size={26} aria-hidden="true" />}
            title={t('pt.noMatches')}
            description={t('pt.noMatchesBody')}
            action={<Button variant="outline" onClick={() => setQuery('')}>{t('pt.clearSearch')}</Button>}
          />
        ) : (
          <>
            {/* --- Today --- */}
            <section className="section" aria-labelledby="pt-today-head">
              <div className="pro-section-head">
                <h3 id="pt-today-head">{t('pt.todaysClients')}</h3>
                <span>{t('pro.appointments', { count: formatNumber(todaysShown.length) })}</span>
              </div>
              {todaysShown.length ? (
                <ul className="stack-sm">
                  {todaysShown.map((entry) => {
                    const client = byName.get(entry.customerName);
                    const inner = (
                      <>
                        <span className="pro-appt-time">
                          <strong>{formatTime(entry.time)}</strong>
                        </span>
                        <span className="pro-appt-body">
                          <span className="pro-appt-name">{entry.customerName}</span>
                          <span className="pro-appt-services">
                            {entry.services.map((service) => service.name).join(' · ')}
                          </span>
                          <span className="pro-appt-meta">
                            {client ? (
                              <>
                                <Badge tone="sage">{t(hairTypeKey(client.hairType))}</Badge>
                                <Badge tone="info">{t(hairLengthKey(client.hairLength))}</Badge>
                              </>
                            ) : (
                              <Badge tone="neutral">{t('pro.newClient')}</Badge>
                            )}
                            {client?.privateContact ? (
                              <span className="pro-pill pro-pill-warning">
                                <Lock size={11} aria-hidden="true" />
                                {t('pt.privateBadge')}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </>
                    );
                    return (
                      <li key={entry.id}>
                        {client ? (
                          <Link className="pro-appt" to={ROUTES.proClient(client.customerId)}>
                            {inner}
                          </Link>
                        ) : (
                          <div className="pro-appt">{inner}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  className="pt-empty"
                  icon={<CalendarClock size={26} aria-hidden="true" />}
                  title={t('pt.noClientsToday')}
                  description={t('pt.noClientsTodayBody')}
                />
              )}
            </section>

            {/* --- The whole book --- */}
            <section className="section" aria-labelledby="pt-all-head">
              <div className="pro-section-head">
                <h3 id="pt-all-head">{t('pt.allClients')}</h3>
                <span>{t('pt.clientsCount', { count: formatNumber(allShown.length) })}</span>
              </div>
              {allShown.length ? (
                <ul className="pt-clients">
                  {allShown.map((client) => (
                    <li key={client.customerId}>
                      <Link className="pt-client-row" to={ROUTES.proClient(client.customerId)}>
                        <span className="pt-client-body">
                          <span className="pt-client-name">{client.customerName}</span>
                          <span className="caption">
                            {client.lastVisit
                              ? t('pt.lastVisit', { when: formatRelative(client.lastVisit) })
                              : t('pt.firstVisit')}
                          </span>
                        </span>
                        <span className="pt-client-end">
                          <span className="pro-pill pro-pill-neutral">
                            {t('pt.visits', { count: formatNumber(client.visitCount) })}
                          </span>
                          {client.privateContact ? (
                            <Lock size={14} role="img" aria-label={t('pt.privateBadge')} />
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  className="pt-empty"
                  icon={<Users size={26} aria-hidden="true" />}
                  title={t('pt.noClients')}
                  description={t('pt.noClientsBody')}
                />
              )}
            </section>
          </>
        )}
      </ScreenBody>
    </Screen>
  );
}
