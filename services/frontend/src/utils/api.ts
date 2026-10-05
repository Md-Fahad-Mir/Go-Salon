/* The app's API surface for everything except authentication.

   Real, against the Django backend through `utils/apiClient`:
     * authentication — `utils/authService`
     * **the directory** — who a customer can book, `utils/directoryService`

   Not here at all: the 360° try-on video, `utils/tryOnVideoService`. It is a
   job — started, polled, then fetched — rather than one call, so its screen
   talks to that module directly. The backend relays it to the hair-AI
   service in `services/ai`; the app never calls that service itself.

   Real too:
     * **bookings** — availability, the lifecycle and the automated texts,
       `utils/bookingService`
     * **hairstyles** — the admin-curated try-on catalogue,
       `utils/hairstyleService`

   Still mock, because it has no backend yet: payments. It waits a realistic
   moment so loading states are honest, then answers from the stores. Swap the
   body for a fetch() call as the backend grows; the signature is already
   shaped like the endpoint. */

import type { GeoPoint, Hairstyle, PaymentMethod, Professional } from '../types';
import { useDirectoryStore } from '../store/useDirectoryStore';
import { bookingService } from './bookingService';
import { directoryService } from './directoryService';
import { hairstyleService } from './hairstyleService';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* Re-exported so call sites keep importing it from the API surface they use. */
export { ApiError } from './apiError';
export { isRetryable } from './apiError';


export const api = {
  professionals: {
    /** One salon, with its menu and its chairs — the booking wizard's only
        source for any of it. Everything it returns is cached, which is what
        lets a booking in the history render its salon's name without a
        request of its own. */
    async get(id: string, point?: GeoPoint): Promise<Professional> {
      const detail = await directoryService.get(id, point);
      useDirectoryStore.getState().rememberDetail(detail);
      return detail.professional;
    },
  },

  hairstyles: {
    /** The admin's active styles — the whole of what the try-on offers. */
    list: (): Promise<Hairstyle[]> => hairstyleService.list(),
    /** One active style; 404 once the admin has switched it off or deleted it. */
    get: (id: string): Promise<Hairstyle> => hairstyleService.get(id),
  },

  bookings: {
    /** Free slots for a day, from the business's own diary. */
    availability: (input: Parameters<typeof bookingService.availability>[0]) =>
      bookingService.availability(input),

    /** Books a slot. A 409 `slot_taken` is not a bug — it is somebody else
        having taken four o'clock while this customer was deciding. */
    create: (input: Parameters<typeof bookingService.create>[0]) => bookingService.create(input),

    list: (filters?: Parameters<typeof bookingService.list>[0]) => bookingService.list(filters),
    get: (id: string) => bookingService.get(id),
    approve: (id: string) => bookingService.approve(id),
    reject: (id: string, reason: string) => bookingService.reject(id, reason),
    complete: (id: string) => bookingService.complete(id),
    cancel: (id: string, reason?: string) => bookingService.cancel(id, reason),
    reschedule: (id: string, input: Parameters<typeof bookingService.reschedule>[1]) =>
      bookingService.reschedule(id, input),
  },

  payments: {
    /** Mock charge. */
    async charge(input: {
      method: PaymentMethod;
      amount: number;
      description: string;
    }): Promise<{ reference: string; method: PaymentMethod; amount: number }> {
      await delay(1600);
      const prefix = input.method === 'card' ? 'CH' : input.method.slice(0, 2).toUpperCase();
      return {
        reference: `${prefix}${Date.now().toString().slice(-8)}`,
        method: input.method,
        amount: input.amount,
      };
    },
  },
};
