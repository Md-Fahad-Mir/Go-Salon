import { Check } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../../hooks/useLanguage';
import type { ProviderService, StaffRecord } from '../../../types';
import { formatBdt, formatDuration, formatNumber } from '../../../utils/format';
import { localDigits, toE164 } from '../../../utils/validators';
import { Avatar } from '../../common/Avatar';
import { BottomSheet } from '../../common/BottomSheet';
import { Button } from '../../common/Button';
import { Input, Textarea } from '../../common/Input';
import { PhoneInput } from '../../common/PhoneInput';

export interface WalkInDraft {
  customerName: string;
  customerPhone?: string;
  serviceIds: string[];
  staffId?: string;
  notes?: string;
}

interface WalkInSheetProps {
  open: boolean;
  onClose: () => void;
  services: ProviderService[];
  onAdd: (draft: WalkInDraft) => void;
  saving?: boolean;
  /** Chairs this caller may put the walk-in at. Empty for anyone who has only
      their own — an employee, or a barber working alone — in which case the
      question is not worth asking. */
  chairs?: StaffRecord[];
}

/** Somebody walked in off the street. Name, what they are having, done.
 *
 *  Written to be finishable one-handed at a counter with somebody waiting, so
 *  the required half comes first and everything optional is visibly optional.
 *  The running total sits in the footer because "what do I owe" is the next
 *  question after "what are you having", and it should be answerable without
 *  scrolling back. */
export function WalkInSheet({ open, onClose, services, onAdd, saving, chairs = [] }: WalkInSheetProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [chairId, setChairId] = useState<string | undefined>();
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);

  const chosen = services.filter((service) => picked.includes(service.id));
  const total = chosen.reduce((sum, service) => sum + service.price, 0);
  const minutes = chosen.reduce((sum, service) => sum + service.duration, 0);

  const nameError = touched && !name.trim() ? t('proQueue.walkInNameError') : undefined;
  const pickError = touched && !picked.length ? t('proQueue.walkInPickError') : undefined;
  /* A number is optional, but half of one is not a number. Sending it anyway
     would store something nobody can ring. */
  const digits = localDigits(phone);
  const phoneError =
    digits.length && digits.length < 10 ? t('proQueue.walkInPhoneError') : undefined;

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const submit = () => {
    setTouched(true);
    if (!name.trim() || !picked.length || phoneError) return;
    onAdd({
      customerName: name.trim(),
      customerPhone: digits.length === 10 ? toE164(phone) : undefined,
      serviceIds: picked,
      staffId: chairId,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('pro.addWalkIn')}
      description={t('proQueue.walkInBody')}
      footer={
        <>
          {picked.length ? (
            <div className="pq-running">
              <span>{formatDuration(minutes)}</span>
              <strong>{formatBdt(total)}</strong>
            </div>
          ) : null}
          <Button block size="lg" onClick={submit} loading={saving} disabled={!services.length}>
            {t('proQueue.walkInSubmit')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Input
          label={t('proQueue.walkInName')}
          placeholder={t('proQueue.walkInNamePlaceholder')}
          value={name}
          error={nameError}
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
        />

        <PhoneInput
          value={phone}
          onChange={setPhone}
          optional
          hint={t('proQueue.walkInPhoneHint')}
          error={touched ? phoneError : undefined}
        />

        <div className="stack-sm">
          <div className="pro-section-head">
            <h3>{t('proQueue.walkInPick')}</h3>
            <span>{t('proQueue.picked', { count: formatNumber(picked.length) })}</span>
          </div>

          {services.length ? (
            <div className="stack-sm" role="group" aria-label={t('proQueue.walkInPick')}>
              {services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  className="option"
                  aria-pressed={picked.includes(service.id)}
                  onClick={() => toggle(service.id)}
                >
                  <span className="option-body">
                    <span className="option-title">{service.name}</span>
                    <span className="option-sub">{formatDuration(service.duration)}</span>
                  </span>
                  <span className="option-end">{formatBdt(service.price)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="caption">{t('proQueue.walkInNoServices')}</p>
          )}

          {pickError ? <p className="field-error" role="alert">{pickError}</p> : null}
        </div>

        {/* Only an owner is ever asked this. Everyone else has one chair —
            their own — and the server assigns it whatever is sent. */}
        {chairs.length ? (
          <div className="stack-sm">
            <div className="pro-section-head">
              <h3>{t('proQueue.walkInChair')}</h3>
            </div>
            <p className="caption">{t('proQueue.walkInChairHint')}</p>
            <div className="stack-sm" role="group" aria-label={t('proQueue.walkInChair')}>
              {chairs.map((member) => {
                const active = chairId === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    className="ps-pick"
                    aria-pressed={active}
                    onClick={() => setChairId(active ? undefined : member.id)}
                  >
                    <Avatar name={member.name} src={member.avatar || undefined} size="sm" />
                    <span className="ps-pick-body">
                      <span className="ps-pick-name">{member.name}</span>
                      <span className="ps-pick-sub">{member.title}</span>
                    </span>
                    {active ? (
                      <Check size={18} aria-hidden="true" style={{ color: 'var(--accent-ink)' }} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <Textarea
          label={t('proQueue.walkInNote')}
          placeholder={t('proQueue.walkInNotePlaceholder')}
          optional
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </BottomSheet>
  );
}
