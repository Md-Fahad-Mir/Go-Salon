"""Scanning a salon's code, and everything that follows from it.

The join endpoint is where a `CustomerTenantMembership` comes from, which is
the row every customer-side request in this project is now gated on. So these
tests care about two things above all: that holding the token is what grants
the membership, and that *losing* the token — because the owner regenerated it
— takes nothing away from the people who already joined.
"""

from __future__ import annotations

import struct
import zlib

from Apps.bookings.models import Appointment
from Apps.bookings.tests.base import BookingTestCase
from Apps.tenants.models import CustomerTenantMembership, Tenant
from Apps.users.models import User

JOIN = '/api/tenants/join/'
MINE = '/api/tenants/mine/'
QR = '/api/salon/qr/'
QR_REGENERATE = '/api/salon/qr/regenerate/'


def png_size(data: bytes) -> tuple[int, int]:
    """Width and height straight out of the IHDR chunk.

    Parsed by hand rather than with an image library, because the point is to
    prove the bytes really are a PNG — and decoding them with the same library
    that wrote them would prove considerably less.
    """
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    assert data[12:16] == b'IHDR', 'no IHDR chunk'
    width, height = struct.unpack('>II', data[16:24])
    return width, height


def png_is_intact(data: bytes) -> bool:
    """The IHDR chunk's stored CRC matches the one we compute over it."""
    length = struct.unpack('>I', data[8:12])[0]
    chunk = data[12:16 + length]
    stored = struct.unpack('>I', data[16 + length:20 + length])[0]
    return zlib.crc32(chunk) & 0xFFFFFFFF == stored


class JoinTests(BookingTestCase):
    """A fresh customer, and the salon whose code they scan."""

    def setUp(self):
        super().setUp()
        # Somebody who has joined nothing, unlike the fixture's own customer.
        self.newcomer = self.make_customer(
            phone='01712349999', email='newcomer@example.com')
        self.newcomer_user = User.objects.get(pk=self.newcomer['user']['id'])
        CustomerTenantMembership.objects.filter(
            customer=self.newcomer_user).delete()
        self.as_user(self.newcomer)

    def test_scanning_the_code_joins_the_salon(self):
        response = self.client.post(
            JOIN, {'join_token': self.tenant.join_token}, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        membership = CustomerTenantMembership.objects.get(
            customer=self.newcomer_user, tenant=self.tenant)
        self.assertTrue(membership.is_active)

    def test_the_profile_it_returns_carries_nothing_sensitive(self):
        """Four fields, and a list of what is deliberately absent.

        The temptation is to answer with the directory's payload because it
        exists — and that payload is audit finding C2, carrying business phone
        numbers and staff names to anybody signed in.
        """
        response = self.client.post(
            JOIN, {'join_token': self.tenant.join_token}, format='json')
        self.assertEqual(set(response.data), {'id', 'slug', 'listing_id', 'name', 'avatar'})
        self.assertEqual(response.data['id'], self.tenant.pk)
        self.assertEqual(response.data['name'], self.salon.name)

        body = str(response.data)
        for leaked in (self.tenant.join_token, self.owner.phone, self.salon.business_phone):
            if leaked:
                self.assertNotIn(leaked, body)

    def test_joining_twice_is_not_an_error_and_makes_one_row(self):
        first = self.client.post(
            JOIN, {'join_token': self.tenant.join_token}, format='json')
        second = self.client.post(
            JOIN, {'join_token': self.tenant.join_token}, format='json')

        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data, second.data)
        self.assertEqual(
            CustomerTenantMembership.objects.filter(
                customer=self.newcomer_user, tenant=self.tenant).count(), 1)

    def test_an_unknown_token_is_not_found(self):
        response = self.client.post(JOIN, {'join_token': 'x' * 43}, format='json')
        self.assertEqual(response.status_code, 404, response.data)

    def test_a_token_for_a_switched_off_salon_is_not_found(self):
        """Same answer as a token that never existed, deliberately."""
        self.tenant.is_active = False
        self.tenant.save(update_fields=['is_active'])
        response = self.client.post(
            JOIN, {'join_token': self.tenant.join_token}, format='json')
        self.assertEqual(response.status_code, 404, response.data)
        self.assertFalse(CustomerTenantMembership.objects.filter(
            customer=self.newcomer_user, tenant=self.tenant).exists())

    def test_a_non_customer_cannot_join(self):
        for session in (self.owner_session, self.make_barber()):
            with self.subTest(role=session['user']['role']):
                self.as_user(session)
                response = self.client.post(
                    JOIN, {'join_token': self.tenant.join_token}, format='json')
                self.assertEqual(response.status_code, 403, response.data)
                self.assertEqual(response.data['code'], 'not_a_customer')

    def test_joining_is_what_makes_the_salon_reachable(self):
        """The membership is not decoration — it is the gate.

        Before joining, naming this tenant is a 403 from `TenantContext`;
        after, the same request is answered.
        """
        self.as_user(self.newcomer, tenant=self.tenant)
        self.assertEqual(self.client.get('/api/bookings/').status_code, 403)

        self.as_user(self.newcomer)
        self.client.post(JOIN, {'join_token': self.tenant.join_token}, format='json')

        self.as_user(self.newcomer, tenant=self.tenant)
        self.assertEqual(self.client.get('/api/bookings/').status_code, 200)


class MyTenantsTests(BookingTestCase):
    """The switcher's list, and removing something from it."""

    def test_a_brand_new_customer_has_joined_nothing(self):
        session = self.make_customer(phone='01712348888', email='n@example.com')
        CustomerTenantMembership.objects.filter(
            customer_id=session['user']['id']).delete()
        self.as_user(session)
        response = self.client.get(MINE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data, [])

    def test_the_list_reflects_what_has_actually_been_joined(self):
        other = self.make_owner(phone='01913335555', business_name='Second Shop',
                                email='second@example.com')
        other_tenant = Tenant.objects.get(
            salon__owner_id=other['user']['id'])

        self.as_user(self.customer_session)
        for tenant in (self.tenant, other_tenant):
            self.client.post(JOIN, {'join_token': tenant.join_token}, format='json')

        listed = self.client.get(MINE)
        self.assertEqual(listed.status_code, 200, listed.data)
        self.assertEqual({row['id'] for row in listed.data},
                         {self.tenant.pk, other_tenant.pk})
        self.assertEqual(set(listed.data[0]), {'id', 'slug', 'listing_id', 'name', 'avatar'})

    def test_removing_a_salon_is_soft_and_keeps_what_happened_there(self):
        self.as_user(self.customer_session, tenant=self.tenant)
        times = self.free_times(services=[self.cut])
        booking_id = self.book(time=times[0]).data['id']

        self.as_user(self.customer_session)
        removed = self.client.delete(f'{MINE}{self.tenant.pk}/')
        self.assertEqual(removed.status_code, 204)

        membership = CustomerTenantMembership.objects.get(
            customer=self.customer, tenant=self.tenant)
        self.assertFalse(membership.is_active)          # soft, not deleted
        self.assertTrue(Appointment.objects.filter(pk=booking_id).exists())
        self.assertEqual(self.client.get(MINE).data, [])

        # And the salon is closed to them until they scan again.
        self.as_user(self.customer_session, tenant=self.tenant)
        self.assertEqual(self.client.get('/api/bookings/').status_code, 403)

    def test_re_scanning_reactivates_the_membership_they_had(self):
        """The row comes back rather than a second one being made."""
        self.as_user(self.customer_session)
        self.client.delete(f'{MINE}{self.tenant.pk}/')

        rejoined = self.client.post(
            JOIN, {'join_token': self.tenant.join_token}, format='json')
        self.assertEqual(rejoined.status_code, 200, rejoined.data)
        self.assertEqual(
            CustomerTenantMembership.objects.filter(
                customer=self.customer, tenant=self.tenant).count(), 1)
        self.assertTrue(CustomerTenantMembership.objects.get(
            customer=self.customer, tenant=self.tenant).is_active)

    def test_removing_one_you_never_joined_is_not_found(self):
        other = self.make_owner(phone='01913336666', business_name='Never Been',
                                email='never@example.com')
        other_tenant = Tenant.objects.get(salon__owner_id=other['user']['id'])

        self.as_user(self.customer_session)
        response = self.client.delete(f'{MINE}{other_tenant.pk}/')
        self.assertEqual(response.status_code, 404, response.data)

    def test_removing_twice_is_not_found_the_second_time(self):
        self.as_user(self.customer_session)
        self.assertEqual(self.client.delete(f'{MINE}{self.tenant.pk}/').status_code, 204)
        self.assertEqual(self.client.delete(f'{MINE}{self.tenant.pk}/').status_code, 404)


class SalonQRTests(BookingTestCase):
    """The code on the counter, and what rotating it does and does not do."""

    def test_the_owner_gets_a_real_png_encoding_the_join_link(self):
        self.as_user(self.owner_session, tenant=self.tenant)
        response = self.client.get(QR)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertEqual(response['Cache-Control'], 'no-store')
        body = response.content
        self.assertTrue(png_is_intact(body), 'IHDR checksum does not match')
        width, height = png_size(body)
        self.assertGreater(width, 20)
        self.assertEqual(width, height)          # a QR code is square

    def test_the_link_it_encodes_is_the_join_url(self):
        from Apps.tenants.views import join_url

        self.assertEqual(
            join_url(self.tenant),
            f'https://app.gosalon.com/join/{self.tenant.join_token}')

    def test_a_stylist_cannot_read_the_shops_code(self):
        """`IsProvider` would let them through; `OwnsTenant` is the narrow one."""
        staff = self.verify('+8801755000004')
        self.as_user(self.sign_in(staff.phone).data, tenant=self.tenant)
        self.assertEqual(self.client.get(QR).status_code, 403)

    def test_a_customer_cannot_read_it_either(self):
        self.as_user(self.customer_session, tenant=self.tenant)
        self.assertEqual(self.client.get(QR).status_code, 403)

    def test_regenerating_invalidates_the_old_code_and_keeps_everyone_joined(self):
        """The one that matters.

        A membership is keyed on the tenant, not on the token that introduced
        it, so changing the locks must not put anybody outside. This joins,
        books, regenerates, and then checks both halves: the old token is dead
        and the customer is entirely unaffected.
        """
        old_token = self.tenant.join_token

        self.as_user(self.customer_session, tenant=self.tenant)
        times = self.free_times(services=[self.cut])
        booking_id = self.book(time=times[0]).data['id']

        self.as_user(self.owner_session, tenant=self.tenant)
        regenerated = self.client.post(QR_REGENERATE)
        self.assertEqual(regenerated.status_code, 200)
        self.assertEqual(regenerated['Content-Type'], 'image/png')
        self.assertTrue(png_is_intact(regenerated.content))

        self.tenant.refresh_from_db()
        self.assertNotEqual(self.tenant.join_token, old_token)
        self.assertEqual(len(self.tenant.join_token), 43)

        # The people already inside are still inside.
        membership = CustomerTenantMembership.objects.get(
            customer=self.customer, tenant=self.tenant)
        self.assertTrue(membership.is_active)
        self.assertEqual(
            CustomerTenantMembership.objects.filter(tenant=self.tenant).count(), 1)

        # …with their history intact and the salon still reachable.
        self.as_user(self.customer_session, tenant=self.tenant)
        listed = self.client.get('/api/bookings/')
        self.assertEqual(listed.status_code, 200, listed.data)
        self.assertIn(booking_id, [row['id'] for row in listed.data['results']])
        self.assertEqual(self.client.get(MINE).status_code, 200)

        # And the printed code in somebody's pocket no longer works.
        newcomer = self.make_customer(phone='01712347777', email='late@example.com')
        CustomerTenantMembership.objects.filter(
            customer_id=newcomer['user']['id']).delete()
        self.as_user(newcomer)
        self.assertEqual(
            self.client.post(JOIN, {'join_token': old_token},
                             format='json').status_code, 404)
        self.assertEqual(
            self.client.post(JOIN, {'join_token': self.tenant.join_token},
                             format='json').status_code, 201)


class FixtureMatchesTheEndpointTests(BookingTestCase):
    """`BookingTestCase.join()` writes the row the ORM way, for speed.

    That is only safe while it writes the *same* row the endpoint does, so
    this compares the two rather than assuming. If the endpoint ever starts
    doing more — a timestamp, a source, a welcome notification — this fails
    and the fixture gets updated instead of quietly testing a fiction.
    """

    def test_the_fixture_shortcut_and_the_real_endpoint_agree(self):
        by_orm = self.make_customer(phone='01712346666', email='orm@example.com')
        orm_user = User.objects.get(pk=by_orm['user']['id'])
        # `make_customer` already joined them; that is the fixture's row.
        fixture_row = CustomerTenantMembership.objects.get(
            customer=orm_user, tenant=self.tenant)

        by_api = self.make_customer(phone='01712345555', email='api@example.com')
        api_user = User.objects.get(pk=by_api['user']['id'])
        CustomerTenantMembership.objects.filter(customer=api_user).delete()
        self.as_user(by_api)
        self.client.post(JOIN, {'join_token': self.tenant.join_token}, format='json')
        api_row = CustomerTenantMembership.objects.get(
            customer=api_user, tenant=self.tenant)

        fields = ('tenant_id', 'is_active')
        self.assertEqual(
            {f: getattr(fixture_row, f) for f in fields},
            {f: getattr(api_row, f) for f in fields},
        )
