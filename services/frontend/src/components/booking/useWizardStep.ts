import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useBooking } from '../../hooks/useBooking';
import { useDirectoryStore } from '../../store/useDirectoryStore';
import { ApiError, api } from '../../utils/api';

interface WizardStepOptions {
  /** Pause draft management while a submission is in flight, so the reset
      that follows a successful confirm() does not bounce the user around. */
  hold?: boolean;
}

/** Glue for every wizard step: makes sure a draft exists for the professional
    in the URL (without wiping one that is already theirs), and says whether
    the screen can render from it yet. Starting a draft is a store action, so
    it is safe to do from an effect. */
export function useWizardStep(professionalId: string | undefined, options: WizardStepOptions = {}) {
  const booking = useBooking();
  const { draft, start } = booking;
  const location = useLocation();
  const stateHairstyleId = (location.state as { hairstyleId?: string } | null)?.hairstyleId;

  /* The listing is fetched every time the wizard is entered, and the cache is
     only what gets painted while that is in flight — the same
     stale-while-revalidate the detail page uses.

     Fetching *only* when the cache was empty is what made a salon unbookable
     after its owner fixed its opening hours: the device had seen the salon
     once, so it kept the week it saw then, forever. A cache with no expiry
     and no revalidation is not a cache, it is a copy that silently stops
     being true — and opening hours are exactly the field that changes.

     What gets painted meanwhile is the *detail*, not a search row: a row from
     search or the home screen carries neither the menu nor the chairs, and
     treating one as loaded opens a price list with nothing on it. The menu
     having been fetched is the honest test — an empty menu is a real answer
     and `undefined` is the absence of one. */
  const cached = useDirectoryStore((state) =>
    professionalId ? state.byId[professionalId] : undefined,
  );
  const detailed = useDirectoryStore((state) =>
    professionalId ? state.servicesById[professionalId] !== undefined : false,
  );
  /** The id whose lookup has come back empty. Keyed rather than a flag, so a
      second id in the same session is fetched rather than assumed missing. */
  const [missing, setMissing] = useState<string | null>(null);

  useEffect(() => {
    if (!professionalId) return;
    let live = true;
    api.professionals.get(professionalId).catch((error: unknown) => {
      if (!live) return;
      /* A listing that is genuinely gone answers 404. Anything else — a
         dropped connection, a server being restarted — says nothing about
         whether the salon exists, so a copy already in hand beats telling
         somebody their salon has disappeared. */
      const gone = error instanceof ApiError && error.status === 404;
      if (gone || !useDirectoryStore.getState().servicesById[professionalId]) {
        setMissing(professionalId);
      }
    });
    return () => {
      live = false;
    };
  }, [professionalId]);

  // Unknown only once the fetch has actually come back empty.
  const exists = missing !== professionalId && (detailed || Boolean(cached));
  const resolving = Boolean(professionalId) && !detailed && missing !== professionalId;
  const ready = exists && draft?.professionalId === professionalId;
  const rescheduleOf = ready ? draft?.rescheduleOf : undefined;
  const hold = options.hold ?? false;

  useEffect(() => {
    if (!professionalId || !exists || hold) return;
    start(professionalId, { hairstyleId: stateHairstyleId, rescheduleOf });
  }, [exists, hold, professionalId, rescheduleOf, start, stateHairstyleId]);

  return {
    ...booking,
    ready,
    exists,
    /** True while the listing is still being fetched: the screen holds its
        loading shell rather than claiming the salon is gone. */
    resolving,
    rescheduleOf,
    hairstyleId: ready ? draft?.hairstyleId : undefined,
  };
}
