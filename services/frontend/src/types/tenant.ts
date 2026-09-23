/* A tenant: one salon or one independent barber, as the backend names it.

   The backend's multi-tenancy is shared-schema — every scoped row carries a
   `tenant_id`, and a request says which tenant it is acting in by sending
   `X-Tenant-Id`. There are no subdomains anywhere in this system; the header
   is the only channel, and the server verifies it against a membership record
   before anything downstream trusts it.

   A customer belongs to a tenant by having scanned its QR code once. Which
   salons that is comes from `GET /api/tenants/mine/`, which answers with
   exactly these four fields. */

export interface Tenant {
  id: number;
  slug: string;
  name: string;
  /** May be an empty string — the backend sends `''`, not null, for a salon
      that has no picture yet. */
  avatar: string;
}
