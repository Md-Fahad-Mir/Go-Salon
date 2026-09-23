/* The salons an account can act in.

   Two endpoints, because there are two relationships and only one of them is
   revocable. A customer *joins* salons by scanning their codes, and can leave
   again. An owner *owns* them from the moment each is registered, and there is
   no leaving. Each endpoint refuses the other's role outright — 403
   `not_a_customer` from `MyTenantsView`, 403 from `IsSalonOrParlorOwner` on
   `MyOwnedSalonsView` — so picking the wrong one is a failed request, not a
   confusing empty list. `useAppStore.loadTenants` is what picks; see its
   comment.

   Barbers and hired stylists ask neither. Both have at most one tenant and the
   schema is what guarantees it — `BarberProfile.user` is a one-to-one, and a
   stylist's active employment is bounded by a partial unique index — so the
   backend resolves their tenant from the account whenever no `X-Tenant-Id` is
   sent, and there is nothing to enumerate.

   The four fields are the whole payload, deliberately: `TenantProfileSerializer`
   argues at length for keeping it to id, slug, name and avatar rather than
   reaching for the directory's shape. Anything a screen needs beyond them
   comes from the endpoint that already scopes it. */

import type { Tenant } from '../types';
import { api } from './apiClient';

export const tenantService = {
  /** `GET /api/tenants/mine/` — a customer's active memberships. */
  mine: () => api.get<Tenant[]>('/tenants/mine/'),

  /** `GET /api/tenants/owned/` — an owner's salons, by shopfront name.

      Read-only, and permanently: nobody joins or leaves a shop they own. */
  owned: () => api.get<Tenant[]>('/tenants/owned/'),

  /** `POST /api/tenants/join/` — the token printed in a shop's QR code.

      Answers 201 the first time and 200 on a re-scan, and the app treats them
      the same: somebody who scans a code they have already used should be told
      they are in, not that something went wrong. The client does not see the
      difference anyway — both come back as the tenant itself. */
  join: (joinToken: string) => api.post<Tenant>('/tenants/join/', { join_token: joinToken }),
};
