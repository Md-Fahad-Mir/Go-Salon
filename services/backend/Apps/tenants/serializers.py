"""What a tenant looks like to the customer who joined it.

Deliberately four fields, and deliberately not the directory's shape. The old
`/api/directory/` payload carried business phone numbers, staff names, price
lists and opening hours to anybody signed in — audit finding C2 — and the
temptation when writing a "tenant profile" is to reach for it because it
already exists. This is not that.

  id      what every later request names in `X-Tenant-Id`. Without it the
          client cannot act on the membership it just made.
  listing_id
          `salon-3` / `barber-9` — the same handle bookings, reviews and
          availability already use for this business. Here for the same reason
          `id` is: without it a client holding a membership cannot open the
          one screen the membership is for. The salon list is what a customer
          taps to start booking, and the booking wizard is addressed by
          listing id, so a list that omitted it would be a list of things that
          cannot be opened.

          It discloses nothing: a customer learns this exact string from every
          booking they hold at the salon, every availability call they make
          there, and every review they write. What it removes is the need to
          have made a booking *first* in order to make one.
  slug    the readable handle, for a URL or a log line. Not a secret and not
          a credential: nothing routes or authorises on it.
  name    what the customer sees in their salon list. They scanned this shop's
          code standing in it; withholding its name would be theatre.
  avatar  the logo, for the same reason.

What is *not* here, and why each one stays out:

  join_token       the capability itself. Handing a customer the thing that
                   mints memberships would let them pass it on.
  phone, email     a customer does not need them to book; the app rings the
                   shop through the booking, and a list of numbers is the
                   scraping target the directory already is.
  staff, services, hours, address
                   all reachable through the endpoints that already scope
                   them. Copying them here would be a second, unscoped route
                   to the same data, which is how the directory became a
                   finding.
  is_active        an internal lifecycle flag. A suspended tenant is a 404 at
                   the door, so nothing downstream should be reading it.
"""

from __future__ import annotations

from rest_framework import serializers


class TenantProfileSerializer(serializers.Serializer):
    """One shape, used by both the join response and the salon list.

    The same four fields either way on purpose: two payloads that differ only
    slightly are two payloads to keep in step, and there is nothing the
    switcher needs that somebody who has just joined should not see.
    """

    id = serializers.IntegerField(read_only=True)
    slug = serializers.CharField(read_only=True)
    listing_id = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()

    def get_listing_id(self, tenant) -> str:
        # The same two-line rule `Apps/bookings/serializers.py::listing_id`
        # applies, and deliberately not an import of it: that one reads an
        # appointment's owner columns and this one a tenant's, so sharing a
        # function would mean one of them taking an argument it does not have.
        if tenant.salon_id:
            return f'salon-{tenant.salon_id}'
        return f'barber-{tenant.barber_profile_id}' if tenant.barber_profile_id else ''

    def get_name(self, tenant) -> str:
        if tenant.salon_id:
            return tenant.salon.name
        return tenant.barber_profile.display_name if tenant.barber_profile_id else ''

    def get_avatar(self, tenant) -> str:
        business = tenant.salon or tenant.barber_profile
        return getattr(business, 'avatar', '') or ''


class JoinSerializer(serializers.Serializer):
    """The one thing a join request carries.

    `max_length` is the token's own width rather than something generous:
    `secrets.token_urlsafe(32)` is always 43 characters, so anything longer
    was never a token this system issued.
    """

    join_token = serializers.CharField(max_length=43, min_length=43)
