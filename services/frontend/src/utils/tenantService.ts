/* The salons a customer has joined.

   One call, and only a customer may make it: `MyTenantsView` answers any
   other role 403 `not_a_customer`, because a list of joined salons is a
   customer-shaped idea. A provider belongs to exactly one business — their
   own — and the backend resolves that from the account when no `X-Tenant-Id`
   is sent, so there is nothing for them to enumerate and nothing here to ask
   for. `useAppStore.loadTenants` is what enforces that; see its comment.

   The four fields are the whole payload, deliberately: `TenantProfileSerializer`
   argues at length for keeping it to id, slug, name and avatar rather than
   reaching for the directory's shape. Anything a screen needs beyond them
   comes from the endpoint that already scopes it. */

import type { Tenant } from '../types';
import { api } from './apiClient';

export const tenantService = {
  /** `GET /api/tenants/mine/` — every active membership, salon-slug order. */
  mine: () => api.get<Tenant[]>('/tenants/mine/'),

  /** `POST /api/tenants/join/` — the token printed in a shop's QR code.

      Answers 201 the first time and 200 on a re-scan, and the app treats them
      the same: somebody who scans a code they have already used should be told
      they are in, not that something went wrong. The client does not see the
      difference anyway — both come back as the tenant itself. */
  join: (joinToken: string) => api.post<Tenant>('/tenants/join/', { join_token: joinToken }),
};
