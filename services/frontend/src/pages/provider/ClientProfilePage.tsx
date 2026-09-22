import { MessageSquare, NotebookPen, Phone, ShieldCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Art } from '../../components/common/Art';
import { Avatar } from '../../components/common/Avatar';
import { Badge } from '../../components/common/Badge';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Button, LinkButton } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Textarea } from '../../components/common/Input';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { hairLengthKey, hairTypeKey } from '../../components/provider/team/teamHelpers';
import { APPOINTMENT_STAGE_TONES, ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { getClientProfile } from '../../mockData';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { AppointmentStage } from '../../types';
import type { TranslationKey } from '../../i18n';
import {
  formatBdt,
  formatDayLabel,
  formatNumber,
  formatPhone,
  formatRelative,
  formatTime,
  toDateKey,
} from '../../utils/format';

/* The consultation view: everything the stylist needs in front of her before
   she picks up a brush — hair type, colour history, the photos the client
   brought, and her own notes from last time. */

const STAGE_KEYS: Record<AppointmentStage, TranslationKey> = {
  pending: 'pro.stagePending',
  upcoming: 'pro.stageUpcoming',
  in_chair: 'pro.stageInChair',
  completed: 'pro.stageCompleted',
  no_show: 'pro.stageNoShow',
  cancelled: 'pro.stageCancelled',
};

export default function ClientProfilePage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const appointments = useProviderStore((state) => state.appointments);
  const toast = useAppStore((state) => state.toast);

  const client = id ? getClientProfile(id) : undefined;

  /* There is no store field for client notes, so an edit lives in this screen
     for the session. Seeded from the fixture rather than set in an effect. */
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [notesOpen, setNotesOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const todayKey = toDateKey(new Date());
  /* Bookings carry the name the client gave at the desk; the hair book is keyed
     on the same name, so that — not the customer id — is what ties the two. */
  const theirs = client
    ? appointments.filter((entry) => entry.customerName === client.customerName)
    : [];
  const upcoming = theirs
    .filter((entry) => entry.date >= todayKey && entry.stage !== 'completed')
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const past = theirs
    .filter((entry) => !upcoming.includes(entry))
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));

  if (!client) {
    return (
      <Screen nav>
        <Header title={t('pt.clientTitle')} back backTo={ROUTES.proClients} />
        <ScreenBody>
          <EmptyState
            className="pt-empty"
            icon={<UserX size={26} aria-hidden="true" />}
            title={t('pt.clientMissing')}
            description={t('pt.clientMissingBody')}
            action={
              <LinkButton to={ROUTES.proClients} variant="outline">
                {t('pt.backToClients')}
              </LinkButton>
            }
          />
        </ScreenBody>
      </Screen>
    );
  }

  const phone = theirs.find((entry) => entry.customerPhone)?.customerPhone ?? '';

  return (
    <Screen nav>
      <Header title={t('pt.clientTitle')} back backTo={ROUTES.proClients} />
      <ScreenBody>
        {/* --- Who she is --- */}
        <div className="pt-client-head">
          <Avatar name={client.customerName} size="xl" accent />
          <div className="stack-xs">
            <h2 className="title">{client.customerName}</h2>
            <span className="caption">{t('pt.visits', { count: formatNumber(client.visitCount) })}</span>
            <span className="caption">
              {client.lastVisit ? t('pt.lastVisit', { when: formatRelative(client.lastVisit) }) : t('pt.firstVisit')}
            </span>
          </div>
        </div>

        {/* --- Hair profile --- */}
        <section className="section" aria-labelledby="pt-hair-head">
          <h3 className="label" id="pt-hair-head">{t('pt.hairProfile')}</h3>
          <Card className="pt-hair">
            <div className="grid-2">
              <div className="stack-xs">
                <span className="caption">{t('pt.hairTypeLabel')}</span>
                <span><Badge tone="sage">{t(hairTypeKey(client.hairType))}</Badge></span>
              </div>
              <div className="stack-xs">
                <span className="caption">{t('pt.hairLengthLabel')}</span>
                <span><Badge tone="info">{t(hairLengthKey(client.hairLength))}</Badge></span>
              </div>
            </div>
          </Card>
        </section>

        {/* --- How to reach her --- */}
        {client.privateContact ? (
          <Callout tone="warning" icon={<ShieldCheck size={18} aria-hidden="true" />} title={t('pt.privateTitle')}>
            {t('pt.privateBody')}
          </Callout>
        ) : phone ? (
          <Card>
            <div className="stack-xs">
              <span className="caption">{formatPhone(phone)}</span>
              <div className="row-sm">
                <a className="btn btn-secondary btn-sm grow" href={`tel:${phone}`}>
                  <Phone size={16} aria-hidden="true" />
                  {t('action.call')}
                </a>
                <a className="btn btn-outline btn-sm grow" href={`sms:${phone}`}>
                  <MessageSquare size={16} aria-hidden="true" />
                  {t('pt.sendSms')}
                </a>
              </div>
            </div>
          </Card>
        ) : null}

        {/* --- History --- */}
        <section className="section" aria-labelledby="pt-hist-head">
          <div className="pt-head">
            <h3 id="pt-hist-head">{t('pt.hairHistory')}</h3>
            <p>{t('pt.hairHistoryHint')}</p>
          </div>
          <Card>
            {client.history.length ? (
              <ol className="pt-timeline stagger">
                {client.history.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ol>
            ) : (
              <p className="muted pt-blank">{t('pt.noHistory')}</p>
            )}
          </Card>
        </section>

        {/* --- Her notes --- */}
        <section className="section" aria-labelledby="pt-notes-head">
          <div className="pro-section-head">
            <h3 id="pt-notes-head">{t('pt.myNotes')}</h3>
            <Button size="xs" variant="ghost" icon={<NotebookPen size={15} />} onClick={() => setNotesOpen(true)}>
              {t('pt.editNotes')}
            </Button>
          </div>
          <Card className="pt-note">
            {notes.trim() ? <p className="body">{notes}</p> : <p className="muted pt-blank">{t('pt.notesEmpty')}</p>}
            <p className="caption mt-2">{t('pt.notesLocalNote')}</p>
          </Card>
        </section>

        {/* --- What she brought in --- */}
        {client.inspirationTones.length ? (
          <section className="section" aria-labelledby="pt-insp-head">
            <div className="pt-head">
              <h3 id="pt-insp-head">{t('pt.inspiration')}</h3>
              <p>{t('pt.inspirationHint')}</p>
            </div>
            <div className="photo-grid pt-photos">
              {client.inspirationTones.map((tone, index) => (
                <button
                  key={`${tone}-${index}`}
                  type="button"
                  className="pt-photo"
                  onClick={() => setLightbox(index)}
                  aria-label={t('pt.inspirationPhoto', { index: formatNumber(index + 1) })}
                >
                  <Art tone={tone} ratio="square" />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* --- Her appointments --- */}
        <section className="section" aria-labelledby="pt-appts-head">
          <h3 className="label" id="pt-appts-head">{t('pt.theirAppointments')}</h3>
          {upcoming.length || past.length ? (
            <div className="stack">
              {upcoming.length ? (
                <div className="stack-sm">
                  <span className="caption">{t('pt.upcomingVisits')}</span>
                  {upcoming.slice(0, 4).map((entry) => (
                    <div key={entry.id} className="pro-appt">
                      <span className="pro-appt-time">
                        <strong>{formatTime(entry.time)}</strong>
                        <small>{formatDayLabel(entry.date)}</small>
                      </span>
                      <span className="pro-appt-body">
                        <span className="pro-appt-services">
                          {entry.services.map((service) => service.name).join(' · ')}
                        </span>
                        <span className="pro-appt-meta">
                          <Badge tone={APPOINTMENT_STAGE_TONES[entry.stage]}>{t(STAGE_KEYS[entry.stage])}</Badge>
                          {formatBdt(entry.total)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {past.length ? (
                <div className="stack-sm">
                  <span className="caption">{t('pt.pastVisits')}</span>
                  {past.slice(0, 6).map((entry) => (
                    <div key={entry.id} className="pro-appt" data-done="true">
                      <span className="pro-appt-time">
                        <strong>{formatTime(entry.time)}</strong>
                        <small>{formatDayLabel(entry.date)}</small>
                      </span>
                      <span className="pro-appt-body">
                        <span className="pro-appt-services">
                          {entry.services.map((service) => service.name).join(' · ')}
                        </span>
                        <span className="pro-appt-meta">
                          <Badge tone={APPOINTMENT_STAGE_TONES[entry.stage]}>{t(STAGE_KEYS[entry.stage])}</Badge>
                          {formatBdt(entry.total)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <Card>
              <p className="muted pt-blank">{t('pt.noAppointments')}</p>
            </Card>
          )}
        </section>
      </ScreenBody>

      {/* --- Notes editor --- */}
      <BottomSheet
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        title={t('pt.myNotes')}
        description={t('pt.notesLocalNote')}
      >
        {notesOpen ? (
          <NotesForm
            initial={notes}
            onSubmit={(value) => {
              setNotes(value);
              setNotesOpen(false);
              toast('success', t('pt.notesSaved'));
            }}
          />
        ) : null}
      </BottomSheet>

      {/* --- Inspiration lightbox --- */}
      <BottomSheet
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        title={t('pt.inspiration')}
        description={
          lightbox !== null
            ? t('pt.photoOf', {
                index: formatNumber(lightbox + 1),
                total: formatNumber(client.inspirationTones.length),
              })
            : undefined
        }
      >
        {lightbox !== null ? (
          <Art tone={client.inspirationTones[lightbox]} ratio="portrait" className="pt-photo-full" />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

function NotesForm({ initial, onSubmit }: { initial: string; onSubmit: (value: string) => void }) {
  const t = useT();
  const [value, setValue] = useState(initial);
  return (
    <div className="stack">
      <Textarea
        label={t('pt.myNotes')}
        rows={6}
        value={value}
        placeholder={t('pt.notesPlaceholder')}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button block onClick={() => onSubmit(value)}>{t('action.save')}</Button>
    </div>
  );
}
