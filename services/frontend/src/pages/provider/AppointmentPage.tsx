import { CheckCircle2, MessageSquare, Phone, Play, SearchX, ShieldCheck, Sparkles, UserX, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApprovalFooter } from '../../components/provider/queue/ApprovalFooter';
import { ContactButton } from '../../components/provider/queue/ContactButton';
import { PaymentSheet } from '../../components/provider/queue/PaymentSheet';
import { StagePill } from '../../components/provider/queue/StagePill';
import { TAKINGS_KEYS } from '../../components/provider/queue/queueUtils';
import { Avatar } from '../../components/common/Avatar';
import { Badge } from '../../components/common/Badge';
import { Button, LinkButton } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Card } from '../../components/common/Card';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { FooterRow, StickyFooter } from '../../components/layout/StickyFooter';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useRole } from '../../hooks/useRole';
import type { TranslationKey } from '../../i18n';
import { getClientProfile } from '../../mockData';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { HairLength, HairType, TakingsMethod } from '../../types';
import {
  formatBdt,
  formatDateLong,
  formatDuration,
  formatRelative,
  formatTime,
  formatTimeRange,
  maskPhone,
} from '../../utils/format';

/* Hair vocabulary already exists on the customer side — the stylist's summary
   reuses those keys rather than translating "wavy" a second time. */
const HAIR_TYPE_KEYS: Record<HairType, TranslationKey> = {
  straight: 'auth.hairTypeStraight',
  wavy: 'auth.hairTypeWavy',
  curly: 'auth.hairTypeCurly',
  coily: 'auth.hairTypeCoily',
};

const HAIR_LENGTH_KEYS: Record<HairLength, TranslationKey> = {
  short: 'auth.hairLengthShort',
  medium: 'auth.hairLengthMedium',
  long: 'auth.hairLengthLong',
};

export default function AppointmentPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const navigate = useNavigate();
  const { servesWomen } = useRole();
  const toast = useAppStore((s) => s.toast);

  const appointment = useProviderStore((s) => (id ? s.appointments.find((a) => a.id === id) : undefined));
  const startAppointment = useProviderStore((s) => s.startAppointment);
  const completeAppointment = useProviderStore((s) => s.completeAppointment);
  const setStage = useProviderStore((s) => s.setStage);

  const [payOpen, setPayOpen] = useState(false);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!appointment) {
    return (
      <Screen nav>
        <Header title={t('proQueue.apptTitle')} back backTo={ROUTES.proQueue} />
        <ScreenBody className="fullscreen-center">
          <EmptyState
            icon={<SearchX size={26} aria-hidden="true" />}
            title={t('proQueue.apptMissingTitle')}
            description={t('proQueue.apptMissingBody')}
            action={<LinkButton to={ROUTES.proQueue}>{t('proQueue.backToQueue')}</LinkButton>}
          />
        </ScreenBody>
      </Screen>
    );
  }

  const client = servesWomen ? getClientProfile(appointment.customerId) : undefined;
  const isPrivate = client?.privateContact === true;
  const showContact = Boolean(appointment.customerPhone) && !isPrivate;
  const stage = appointment.stage;

  const settle = (method: TakingsMethod, tip: number) => {
    completeAppointment(appointment.id, method, tip || undefined);
    toast(
      'success',
      t('proQueue.payDone', { name: appointment.customerName }),
      t('proQueue.payDoneBody', { amount: formatBdt(appointment.total + tip), method: t(TAKINGS_KEYS[method]) }),
    );
    setPayOpen(false);
    navigate(ROUTES.proQueue);
  };

  return (
    <Screen nav>
      <Header title={t('proQueue.apptTitle')} back backTo={ROUTES.proQueue} />

      <ScreenBody className="pq-detail">
        <section className="pq-detail-hero">
          <StagePill stage={stage} />
          <h2>{formatTimeRange(appointment.time, appointment.duration)}</h2>
          <p className="caption">{formatDateLong(appointment.date)}</p>
          <p className="small dim">{formatDuration(appointment.duration)}</p>
        </section>

        <Card className="stack">
          <div className="row">
            <Avatar name={appointment.customerName} size="lg" accent />
            <div className="stack-xs" style={{ minWidth: 0 }}>
              <strong className="pq-client-name">{appointment.customerName}</strong>
              <div className="row-xs" style={{ flexWrap: 'wrap' }}>
                <Badge tone={appointment.isNewCustomer ? 'accent' : 'neutral'}>
                  {t(appointment.isNewCustomer ? 'pro.newClient' : 'pro.regular')}
                </Badge>
                {appointment.walkIn ? <Badge tone="info">{t('pro.walkIn')}</Badge> : null}
              </div>
              {showContact ? <span className="small dim">{maskPhone(appointment.customerPhone)}</span> : null}
            </div>
          </div>

          {isPrivate ? (
            <Callout tone="info" icon={<ShieldCheck size={18} aria-hidden="true" />} title={t('proQueue.privateTitle')}>
              <p>{t('proQueue.privateBody')}</p>
            </Callout>
          ) : showContact ? (
            <div className="pq-contact-row">
              <ContactButton href={`tel:${appointment.customerPhone}`} icon={<Phone size={18} aria-hidden="true" />}>
                {t('action.call')}
              </ContactButton>
              <ContactButton
                href={`sms:${appointment.customerPhone}?body=${encodeURIComponent(
                  t('proQueue.smsBody', { name: appointment.customerName }),
                )}`}
                icon={<MessageSquare size={18} aria-hidden="true" />}
              >
                {t('proQueue.message')}
              </ContactButton>
            </div>
          ) : null}

          {client ? (
            <div className="pq-hair">
              <div className="pro-section-head">
                <h3>{t('proQueue.hairProfile')}</h3>
                <Sparkles size={16} aria-hidden="true" />
              </div>
              <dl className="kv">
                <div className="kv-row">
                  <dt>{t('profile.hairTypeLabel')}</dt>
                  <dd>{t(HAIR_TYPE_KEYS[client.hairType])}</dd>
                </div>
                <div className="kv-row">
                  <dt>{t('profile.hairLengthLabel')}</dt>
                  <dd>{t(HAIR_LENGTH_KEYS[client.hairLength])}</dd>
                </div>
                <div className="kv-row">
                  <dt>{t('proQueue.lastVisit')}</dt>
                  <dd>{client.lastVisit ? formatRelative(client.lastVisit) : t('proQueue.firstVisit')}</dd>
                </div>
              </dl>
              <LinkButton to={ROUTES.proClient(client.customerId)} variant="outline" size="sm" block>
                {t('proQueue.openClientCard')}
              </LinkButton>
            </div>
          ) : null}
        </Card>

        <section className="section">
          <div className="pro-section-head">
            <h3>{t('proQueue.servicesHead')}</h3>
            <span>{formatDuration(appointment.duration)}</span>
          </div>
          <Card>
            <dl className="kv">
              {appointment.services.map((service) => (
                <div className="kv-row" key={service.id}>
                  <dt>
                    {service.name}
                    <span className="dim"> · {formatDuration(service.duration)}</span>
                  </dt>
                  <dd>{formatBdt(service.price)}</dd>
                </div>
              ))}
              <div className="kv-row kv-total">
                <dt>{t('proQueue.totalHead')}</dt>
                <dd>{formatBdt(appointment.total)}</dd>
              </div>
            </dl>
          </Card>
        </section>

        {appointment.notes ? (
          <section className="section">
            <div className="pro-section-head">
              <h3>{t('proQueue.notesHead')}</h3>
            </div>
            <Callout>{appointment.notes}</Callout>
          </section>
        ) : null}

        {appointment.staffName ? <p className="small dim">{t('proQueue.chairOf', { name: appointment.staffName })}</p> : null}

        {stage === 'completed' ? (
          <Card className="stack-sm">
            <dl className="kv">
              <div className="kv-row">
                <dt>{t('proQueue.paidWith')}</dt>
                <dd>
                  {appointment.paidWith
                    ? t(TAKINGS_KEYS[appointment.paidWith])
                    : t('pro.takingsUnrecorded')}
                </dd>
              </div>
              <div className="kv-row">
                <dt>{t('pro.tips')}</dt>
                <dd>{appointment.tip ? formatBdt(appointment.tip) : t('proQueue.noTip')}</dd>
              </div>
            </dl>
            {appointment.completedAt ? (
              <p className="small dim">{t('proQueue.settledAt', { when: formatTime(appointment.time) })}</p>
            ) : null}
          </Card>
        ) : null}
      </ScreenBody>

      {stage === 'pending' ? (
        /* Waiting on the salon. Nothing else can happen to it until somebody
           says yes or no, so that is the only thing this footer offers. */
        <ApprovalFooter
          appointmentId={appointment.id}
          customerName={appointment.customerName}
          onDone={() => navigate(ROUTES.proQueue)}
        />
      ) : stage === 'upcoming' ? (
        <StickyFooter>
          <Button block size="lg" icon={<Play size={20} aria-hidden="true" />} onClick={() => {
            startAppointment(appointment.id);
            toast('success', t('proQueue.startedToast', { name: appointment.customerName }));
          }}>
            {t('pro.start')}
          </Button>
          <FooterRow>
            <Button variant="secondary" icon={<UserX size={18} aria-hidden="true" />} onClick={() => setNoShowOpen(true)}>
              {t('pro.markNoShow')}
            </Button>
            <Button variant="danger-soft" icon={<XCircle size={18} aria-hidden="true" />} onClick={() => setCancelOpen(true)}>
              {t('action.cancel')}
            </Button>
          </FooterRow>
        </StickyFooter>
      ) : stage === 'in_chair' ? (
        <StickyFooter>
          <Button block size="lg" icon={<CheckCircle2 size={20} aria-hidden="true" />} onClick={() => setPayOpen(true)}>
            {t('pro.complete')}
          </Button>
          <Button block variant="secondary" icon={<UserX size={18} aria-hidden="true" />} onClick={() => setNoShowOpen(true)}>
            {t('pro.markNoShow')}
          </Button>
        </StickyFooter>
      ) : null}

      <PaymentSheet
        appointment={payOpen ? appointment : null}
        onClose={() => setPayOpen(false)}
        onConfirm={settle}
      />

      <ConfirmDialog
        open={noShowOpen}
        onClose={() => setNoShowOpen(false)}
        onConfirm={() => {
          setStage(appointment.id, 'no_show');
          toast('warning', t('proQueue.noShowDone', { name: appointment.customerName }));
          setNoShowOpen(false);
        }}
        tone="danger"
        title={t('proQueue.noShowTitle', { name: appointment.customerName })}
        description={t('proQueue.noShowBody')}
        confirmLabel={t('pro.markNoShow')}
        cancelLabel={t('action.cancel')}
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          setStage(appointment.id, 'cancelled');
          toast('info', t('proQueue.cancelDone'));
          setCancelOpen(false);
          navigate(ROUTES.proQueue);
        }}
        tone="danger"
        title={t('proQueue.cancelTitle')}
        description={t('proQueue.cancelBody')}
        confirmLabel={t('proQueue.cancelConfirm')}
        cancelLabel={t('confirm.keepIt')}
      />
    </Screen>
  );
}
