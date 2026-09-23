"""The request layer that decides which tenant a call is about.

Four outcomes, and the difference between them is the point:

  400  you belong to several and named none
  404  no such salon — or one that has been switched off, deliberately not
       distinguishable from the first
  403  a real salon you are not part of
  200  a salon you are, with `request.tenant` set to exactly it

Each is exercised for each role that can reach it, because the membership rule
is four different questions wearing one name.
"""

from __future__ import annotations

from Apps.bookings.tests.base import BookingTestCase
from Apps.tenants.models import CustomerTenantMembership, Tenant
from Apps.tenants.permissions import TENANT_HEADER
from Apps.users.models import Salon, User

BOOKINGS = '/api/bookings/'
SERVICES = '/api/services/'


class TenantHeaderTests(BookingTestCase):
    """One salon, plus a second business nobody in the fixture belongs to."""

    def setUp(self):
        super().setUp()
        # A wholly separate business, to be somebody else's tenant.
        outsider = self.make_owner(
            phone='01913334444', business_name='Somewhere Else',
            email='elsewhere@example.com',
        )
        self.other_owner = User.objects.get(pk=outsider['user']['id'])
        self.other_tenant = Tenant.objects.get(
            salon=Salon.objects.get(owner=self.other_owner))

    def test_the_header_name_is_the_one_clients_are_told_to_send(self):
        """Pins the spelling, so the constant and the wire cannot drift."""
        self.assertEqual(TENANT_HEADER, 'X-Tenant-Id')

    # -- 404: unknown, or switched off ------------------------------------

    def test_an_unknown_tenant_id_is_not_found(self):
        self.as_user(self.owner_session)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.owner_session["access"]}',
            HTTP_X_TENANT_ID='99999',
        )
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 404, response.data)
        self.assertEqual(response.data['code'], 'tenant_not_found')

    def test_a_malformed_tenant_id_is_not_found_rather_than_a_bad_request(self):
        """A non-numeric id is an id for a salon that does not exist.

        Answering 400 here would tell a caller they had at least got the shape
        of the key space right, which is a small thing to give away for free.
        """
        self.as_user(self.owner_session)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.owner_session["access"]}',
            HTTP_X_TENANT_ID='not-a-number',
        )
        self.assertEqual(self.client.get(BOOKINGS).status_code, 404)

    def test_a_deactivated_tenant_is_indistinguishable_from_a_missing_one(self):
        """Both 404, and with the same code.

        A suspended salon that answered differently from a nonexistent one
        would be a way to confirm which salons are real.
        """
        self.tenant.is_active = False
        self.tenant.save(update_fields=['is_active'])

        self.as_user(self.owner_session, tenant=self.tenant)
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 404, response.data)
        self.assertEqual(response.data['code'], 'tenant_not_found')

    # -- 403: a real tenant, not yours ------------------------------------

    def test_an_owner_is_refused_another_salons_tenant(self):
        self.as_user(self.owner_session, tenant=self.other_tenant)
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(response.data['code'], 'not_a_member')

    def test_a_customer_is_refused_a_salon_they_have_not_joined(self):
        self.as_user(self.customer_session, tenant=self.other_tenant)
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(response.data['code'], 'not_a_member')

    def test_an_employee_is_refused_a_salon_they_do_not_work_at(self):
        staff = self.verify('+8801755000004')
        self.as_user(self.sign_in(staff.phone).data, tenant=self.other_tenant)
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 403, response.data)

    def test_a_barber_is_refused_a_salons_tenant(self):
        self.as_user(self.make_barber(), tenant=self.other_tenant)
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 403, response.data)

    def test_being_refused_does_not_quietly_serve_the_tenant_they_do_belong_to(self):
        """No silent redirect. That is how a cross-tenant link becomes a read."""
        self.as_user(self.customer_session)
        times = self.free_times(services=[self.cut])
        mine = self.book(time=times[0]).data['id']

        self.as_user(self.customer_session, tenant=self.other_tenant)
        refused = self.client.get(BOOKINGS)
        self.assertEqual(refused.status_code, 403)
        # Emphatically not "here are your own bookings instead".
        self.assertNotIn('results', refused.data)
        self.assertNotIn(str(mine), str(refused.data))

    # -- 200: a real membership -------------------------------------------

    def test_an_owner_reaches_their_own_tenant(self):
        self.as_user(self.owner_session, tenant=self.tenant)
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['viewpoint'], 'owner')

    def test_a_customer_reaches_a_salon_they_have_joined(self):
        self.as_user(self.customer_session, tenant=self.tenant)
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['viewpoint'], 'customer')

    def test_an_employee_reaches_the_salon_they_work_at(self):
        staff = self.verify('+8801755000004')
        self.as_user(self.sign_in(staff.phone).data, tenant=self.tenant)
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['viewpoint'], 'employee')

    def test_a_barber_reaches_their_own_tenant(self):
        session = self.make_barber()
        profile = User.objects.get(pk=session['user']['id']).barber_profile
        self.as_user(session, tenant=Tenant.objects.get(barber_profile=profile))
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['viewpoint'], 'barber')

    def test_the_tenant_on_the_request_is_the_one_that_was_named(self):
        """Not merely accepted — actually used to answer.

        The customer belongs to two salons and asks about the second, so a
        request that silently fell back to the first would still be a 200 and
        would still be wrong.
        """
        self.as_user(self.customer_session, tenant=self.tenant)
        times = self.free_times(services=[self.cut])
        here = self.book(time=times[0]).data['id']

        # Joined elsewhere *after* booking here, so there are now two to
        # choose between and the choice has to be stated.
        CustomerTenantMembership.objects.create(
            customer=self.customer, tenant=self.other_tenant)

        self.as_user(self.customer_session, tenant=self.other_tenant)
        listed = self.client.get(BOOKINGS)
        self.assertEqual(listed.status_code, 200, listed.data)
        self.assertEqual(listed.data['results'], [])

        self.as_user(self.customer_session, tenant=self.tenant)
        listed = self.client.get(BOOKINGS)
        self.assertEqual([row['id'] for row in listed.data['results']], [here])

    # -- 400: belongs to several, named none ------------------------------

    def test_an_account_in_two_tenants_must_say_which(self):
        CustomerTenantMembership.objects.create(
            customer=self.customer, tenant=self.other_tenant)

        self.as_user(self.customer_session)          # no header
        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'tenant_required')

    def test_an_account_in_one_tenant_need_not_say_which(self):
        """The Step 6c convenience, kept deliberately.

        `sole_tenant_of` can only ever return a tenant the account already
        belongs to, so this is not a way round the check — it is the check
        answering the only question there was.
        """
        self.as_user(self.owner_session)             # no header
        self.assertEqual(self.client.get(BOOKINGS).status_code, 200)
        self.assertEqual(self.client.get(SERVICES).status_code, 200)

    def test_an_account_in_no_tenant_is_answered_empty_rather_than_asked(self):
        """A platform admin belongs to nowhere, so there is nothing to name.

        400 "say which salon" would be asking for a thing that does not exist.
        The request proceeds with no tenant and reads as empty, which is the
        honest answer and the same one `scoped` has always given a role it
        does not recognise.
        """
        admin = self.make_admin()
        admin.set_password('chairside2026')
        admin.save(update_fields=['password'])
        self.as_user(self.sign_in(admin.phone).data)

        response = self.client.get(BOOKINGS)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['results'], [])
        self.assertEqual(response.data['viewpoint'], 'none')

    # -- ordering: role and authentication answer first --------------------

    def test_a_customer_hears_that_they_are_not_a_provider(self):
        """Not "which salon?" — the role refusal is the more fundamental one.

        `TenantContext` is listed after the role classes for exactly this: a
        customer has no business at the price list whichever salon they name.
        """
        self.as_user(self.customer_session)
        self.assertEqual(self.client.get(SERVICES).status_code, 403)


    def test_no_credentials_is_still_unauthorised_rather_than_forbidden(self):
        """`IsAuthenticated` is listed before `TenantContext` on purpose.

        Reversed, an anonymous call would come back 403 and the client could
        no longer tell "sign in" from "not yours".
        """
        self.client.credentials()
        self.assertEqual(self.client.get(BOOKINGS).status_code, 401)
