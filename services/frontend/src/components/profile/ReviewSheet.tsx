import { useState } from 'react';
import type { Booking, Review } from '../../types';
import { useT } from '../../hooks/useLanguage';
import type { TKey } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { messageOf } from '../../utils/errorMessage';
import { reviewService } from '../../utils/reviewService';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';
import { Chip, ChipRow } from '../common/Chip';
import { Textarea } from '../common/Input';
import { StarPicker } from '../common/Rating';
import { servicesLabel } from './bookingHelpers';

const QUICK_TAG_KEYS: TKey[] = [
  'bookings.tagOnTime',
  'bookings.tagGreatCut',
  'bookings.tagFriendly',
  'bookings.tagClean',
  'bookings.tagValue',
];

interface ReviewSheetProps {
  booking: Booking;
  open: boolean;
  onClose: () => void;
  /** Handed the saved review so the list behind the sheet can show it
      straight away, rather than waiting for the next fetch. */
  onSaved?: (review: Review) => void;
}

/** "Rate your visit" — stars, quick tags and a few words.

    The review is written to the server, which is also what decides whether
    this visit may be reviewed at all: finished, theirs, and not already
    rated. A second attempt comes back 409 and the sheet says so rather than
    silently making a duplicate. */
export function ReviewSheet({ booking, open, onClose, onSaved }: ReviewSheetProps) {
  const updateBooking = useAppStore((s) => s.updateBooking);
  const toast = useAppStore((s) => s.toast);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const t = useT();
  const quickTags = QUICK_TAG_KEYS.map((key) => t(key));

  const hasTag = (tag: string) => text.includes(tag);
  const toggleTag = (tag: string) => {
    if (hasTag(tag)) {
      const next = text
        .split(/\.\s*/)
        .map((part) => part.trim())
        .filter((part) => part && part !== tag)
        .join('. ');
      setText(next ? `${next}.` : '');
      return;
    }
    const base = text.trim().replace(/\.?$/, '');
    setText(base ? `${base}. ${tag}.` : `${tag}.`);
  };

  const submit = async () => {
    if (rating === 0 || saving) return;
    setSaving(true);
    setProblem(undefined);
    try {
      const review = await reviewService.create(booking.id, { rating, text: text.trim() });
      /* The row on screen carries the answer with it: `can.review` is the
         server's gate, and closing it here means the list behind the sheet
         stops offering a second review before the next fetch confirms it. */
      updateBooking(booking.id, { review, can: { ...booking.can, review: false } });
      onSaved?.(review);
      toast('success', t('bookings.reviewThanks'), t('bookings.reviewThanksBody', { pro: booking.professionalName }));
      setRating(0);
      setText('');
      onClose();
    } catch (failure) {
      setProblem(messageOf(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('bookings.rateVisit')}
      description={t('bookings.servicesAt', { services: servicesLabel(booking), pro: booking.professionalName })}
      footer={
        <Button block onClick={() => void submit()} disabled={rating === 0} loading={saving}>
          {t('bookings.submitReview')}
        </Button>
      }
    >
      <div className="stack pf-review-form">
        <StarPicker value={rating} onChange={setRating} />
        <ChipRow label={t('bookings.quickTags')}>
          {quickTags.map((tag) => (
            <Chip key={tag} active={hasTag(tag)} onClick={() => toggleTag(tag)} small>
              {tag}
            </Chip>
          ))}
        </ChipRow>
        <Textarea
          label={t('bookings.reviewLabel')}
          optional
          placeholder={t('bookings.reviewPlaceholder')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          maxLength={400}
        />
        {problem ? <p className="field-error" role="alert">{problem}</p> : null}
      </div>
    </BottomSheet>
  );
}
