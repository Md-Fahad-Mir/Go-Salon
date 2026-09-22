import { useMemo } from 'react';
import { isProviderRole } from '../constants';
import { useAppStore } from '../store/useAppStore';
import { useProviderStore } from '../store/useProviderStore';
import type { ProviderRole, UserRole } from '../types';

/** Who is signed in and which app they see.

    `servesWomen` is the one variation that changes a professional's screens:
    a barber whose clients are women works from colour, treatments and repeat
    clients rather than a walk-in queue. It is a field on the account, not a
    role — there is no separate women's-stylist account type. */
export function useRole(): {
  role: UserRole;
  isProvider: boolean;
  isOwner: boolean;
  isEmployee: boolean;
  isBarber: boolean;
  isSolo: boolean;
  isAdmin: boolean;
  servesWomen: boolean;
  providerRole: ProviderRole | null;
} {
  const role = useAppStore((state) => state.user?.role) ?? 'customer';
  const audience = useAppStore((state) => state.user?.audience);
  return useMemo(
    () => ({
      role,
      isProvider: isProviderRole(role),
      isOwner: role === 'salon_owner',
      isEmployee: role === 'salon_employee',
      isBarber: role === 'barber',
      // Works alone: nobody else's chair to manage.
      isSolo: role === 'barber',
      isAdmin: role === 'admin',
      servesWomen: role === 'barber' && audience === 'women',
      providerRole: isProviderRole(role) ? role : null,
    }),
    [role, audience],
  );
}

/** The signed-in provider's business, or null for a customer. */
export function useProviderProfile() {
  return useProviderStore((state) => state.profile);
}
