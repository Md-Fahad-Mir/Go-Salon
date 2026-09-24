"""`GET /api/tenants/owned/` — the salons an owner owns.

The gap this closes: an owner of two salons belongs to two tenants, sends no
`X-Tenant-Id` because it has nothing to send, and is answered 400
`tenant_required` by `TenantContext` — with no endpoint anywhere that would
tell them either id. `/api/tenants/mine/` is a customer's list of memberships
and refuses them outright.
"""

from __future__ import annotations

from rest_framework import status

from Apps.tenants.models import Tenant
from Apps.users.models import Role, Salon, User
from Apps.users.tests.base import AuthTestCase

OWNED = '/api/tenants/owned/'

#: Exactly what a tenant looks like to a client. Pinned, so that widening it
#: has to be a decision somebody makes on purpose — the join token lives on
#: this model, and a field appearing here unnoticed is how it would get out.
#: Same discipline as the realtime envelope's key-set assertion.
#:
#: `listing_id` joined the set when the salon list became the way into the
#: booking wizard: the wizard is addressed by listing id, so a list without
#: one is a list of salons that cannot be opened.
FIELDS = {'id', 'slug', 'listing_id', 'name', 'avatar'}


class OwnedSalonsTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.owner_session = self.make_owner(
            phone='01966000001', email='owner@example.com', business_name='Aurora Salon')
        self.owner = User.objects.get(pk=self.owner_session['user']['id'])

    def owned(self, session):
        self.as_user(session)
        return self.client.get(OWNED)

    # --- what an owner sees ------------------------------------------------

    def test_an_owner_of_one_salon_sees_that_one(self):
        response = self.owned(self.owner_session)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual([row['name'] for row in response.data], ['Aurora Salon'])

    def test_an_owner_of_two_salons_sees_both(self):
        second = Salon.objects.create(owner=self.owner, name='Bluebell Parlour')
        response = self.owned(self.owner_session)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [row['name'] for row in response.data],
            ['Aurora Salon', 'Bluebell Parlour'],
        )
        # The ids are the whole point: they are what goes in `X-Tenant-Id`.
        self.assertEqual(
            {row['id'] for row in response.data},
            set(Tenant.objects.filter(salon__owner=self.owner).values_list('pk', flat=True)),
        )
        self.assertIn(Tenant.objects.get(salon=second).pk, {row['id'] for row in response.data})

    def test_the_list_is_in_shopfront_order(self):
        Salon.objects.create(owner=self.owner, name='Zenith Cuts')
        Salon.objects.create(owner=self.owner, name='Bluebell Parlour')
        response = self.owned(self.owner_session)
        self.assertEqual(
            [row['name'] for row in response.data],
            ['Aurora Salon', 'Bluebell Parlour', 'Zenith Cuts'],
        )

    def test_another_owners_salon_is_not_in_the_list(self):
        stranger = self.make_owner(
            phone='01966000002', email='other@example.com', business_name='Rival Salon')
        response = self.owned(self.owner_session)

        names = [row['name'] for row in response.data]
        self.assertEqual(names, ['Aurora Salon'])
        # And the other way round, so this is not passing by accident.
        self.assertEqual([row['name'] for row in self.owned(stranger).data], ['Rival Salon'])

    def test_a_suspended_salon_is_left_out(self):
        second = Salon.objects.create(owner=self.owner, name='Bluebell Parlour')
        tenant = Tenant.objects.get(salon=second)
        tenant.is_active = False
        tenant.save(update_fields=['is_active'])

        # Offering it would offer a choice that `TenantContext` answers 404.
        self.assertEqual([row['name'] for row in self.owned(self.owner_session).data],
                         ['Aurora Salon'])

    # --- the envelope ------------------------------------------------------

    def test_the_listing_id_is_the_one_the_booking_wizard_uses(self):
        """`salon-<pk>`, the same handle bookings and availability take."""
        salon = Salon.objects.get(owner=self.owner)
        rows = self.owned(self.owner_session).data
        self.assertEqual(rows[0]['listing_id'], f'salon-{salon.pk}')

    def test_every_row_carries_exactly_the_public_fields(self):
        Salon.objects.create(owner=self.owner, name='Bluebell Parlour')
        response = self.owned(self.owner_session)

        self.assertEqual(len(response.data), 2)
        for row in response.data:
            with self.subTest(salon=row.get('name')):
                self.assertEqual(set(row), FIELDS)
                # Named individually as well: a set comparison would still pass
                # if `join_token` replaced `avatar` rather than joining it.
                self.assertNotIn('join_token', row)

    def test_it_is_the_same_shape_the_customer_list_uses(self):
        """One serializer, so the switcher renders either list with one component."""
        customer = self.make_customer(phone='01966000003')
        tenant = Tenant.objects.get(salon__owner=self.owner)
        self.as_user(customer)
        joined = self.client.post(
            '/api/tenants/join/', {'join_token': tenant.join_token}, format='json')
        self.assertEqual(joined.status_code, status.HTTP_201_CREATED, joined.data)

        mine = self.client.get('/api/tenants/mine/')
        owned = self.owned(self.owner_session)
        self.assertEqual(set(mine.data[0]), set(owned.data[0]))

    # --- who may ask -------------------------------------------------------

    def test_a_customer_is_refused(self):
        response = self.owned(self.make_customer(phone='01966000004'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_an_independent_barber_is_refused(self):
        response = self.owned(self.make_barber(phone='01966000005'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_hired_stylist_is_refused(self):
        self.as_user(self.owner_session)
        hired = self.client.post(
            '/api/salon/employees/',
            {'phone': '01966000006', 'name': 'Stylist One', 'password': 'chairside2026'},
            format='json')
        self.assertEqual(hired.status_code, status.HTTP_201_CREATED, hired.data)

        staff = User.objects.get(phone='+8801966000006')
        staff.is_phone_verified = True
        staff.save(update_fields=['is_phone_verified'])
        self.assertEqual(staff.role, Role.SALON_EMPLOYEE)

        response = self.owned(self.sign_in(staff.phone).data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_signed_out_visitor_gets_401_not_403(self):
        self.client.credentials()
        response = self.client.get(OWNED)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- no write side -----------------------------------------------------

    def test_there_is_nothing_to_leave(self):
        """Ownership is not a membership; the verbs that fit one do not fit it."""
        self.as_user(self.owner_session)
        for method in (self.client.post, self.client.delete, self.client.patch):
            with self.subTest(method=method.__name__):
                self.assertEqual(
                    method(OWNED).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
