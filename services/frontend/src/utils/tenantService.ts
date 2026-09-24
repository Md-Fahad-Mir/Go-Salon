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
import { api, requestBlob } from './apiClient';

/** The wire shape. `listing_id` is snake_case on the wire and camel in the
    app, which is the only field here that needs translating at all. */
interface ApiTenant {
  id: number;
  slug: string;
  listing_id: string;
  name: string;
  avatar: string;
}

const toTenant = (row: ApiTenant): Tenant => ({
  id: row.id,
  slug: row.slug,
  listingId: row.listing_id,
  name: row.name,
  avatar: row.avatar,
});

const toTenants = (rows: ApiTenant[]): Tenant[] =>
  Array.isArray(rows) ? rows.map(toTenant) : rows;

export const tenantService = {
  /** `GET /api/tenants/mine/` — a customer's active memberships. */
  mine: () => api.get<ApiTenant[]>('/tenants/mine/').then(toTenants),

  /** `GET /api/tenants/owned/` — an owner's salons, by shopfront name.

      Read-only, and permanently: nobody joins or leaves a shop they own. */
  owned: () => api.get<ApiTenant[]>('/tenants/owned/').then(toTenants),

  /** `DELETE /api/tenants/mine/<id>/` — take a salon off the list.

      Soft on the server: the membership row is deactivated rather than
      deleted, so the bookings and reviews hanging off it stay attached to
      something. Scanning the shop's code again reactivates that same row —
      which is why nothing here records that a salon was removed. A local
      "never show this one again" list would be a second opinion about
      membership, and it would be wrong the moment somebody re-scanned. */
  leave: (tenantId: number) => api.delete<null>(`/tenants/mine/${tenantId}/`),

  /** `GET /api/salon/qr/` — the shop's own code, as a PNG.

      Owner-only, and about whichever salon `X-Tenant-Id` names, so an owner
      of two shops gets the code for the one the switcher has active. Made on
      the way out and stored nowhere: the image is a pure function of the
      token, and the server sends `Cache-Control: no-store` because the token
      can rotate at any moment. Nothing here caches it either. */
  qr: () => requestBlob('/salon/qr/'),

  /** `POST /api/salon/qr/regenerate/` — a new token, and the new code.

      Every printed copy of the old one stops working. Answers with the fresh
      PNG, so the screen never has to re-ask for what it just changed. */
  regenerateQr: () => requestBlob('/salon/qr/regenerate/', { method: 'POST' }),

  /** `POST /api/tenants/join/` — the token printed in a shop's QR code.

      Answers 201 the first time and 200 on a re-scan, and the app treats them
      the same: somebody who scans a code they have already used should be told
      they are in, not that something went wrong. The client does not see the
      difference anyway — both come back as the tenant itself. */
  join: (joinToken: string) =>
    api.post<ApiTenant>('/tenants/join/', { join_token: joinToken }).then(toTenant),
};
