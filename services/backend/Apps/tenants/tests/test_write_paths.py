"""Every creation path files its row under the right tenant.

Four tables carry a `tenant`, and four code paths create them. These tests
follow each one through the API the way a client would and check the row that
comes out the other end, because the whole point of setting `tenant` at
construction is that no caller has to remember to.

The assertion is always the same shape: the row's tenant is *the owner's*
tenant. Never a tenant looked up some other way — that would only prove the
test and the code agree on a second derivation, which is the thing this design
is trying to avoid having.
"""

from __future__ import annotations

from django.test import TestCase

from Apps.bookings.models import Appointment
from Apps.bookings.tests.base import BookingTestCase
from Apps.portfolio.models import GalleryImage
from Apps.schedules.models import WorkingDay
from Apps.services.models import Service
from Apps.tenants.models import Tenant
from Apps.tenants.provisioning import (
    MissingTenant,
    provision_for_salon,
    tenant_for,
    tenant_for_optional,
)
from Apps.users.models import BarberProfile, Role, Salon, User
from Apps.users.tests.base import AuthTestCase

GALLERY = '/api/profile/me/gallery/'
TINY_PNG = (
    'data:image/png;base64,'
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
)


class ServiceTenantTests(BookingTestCase):
    """`ServiceListCreateView.post`."""

    def test_a_salons_service_carries_the_salons_tenant(self):
        # BookingTestCase's fixture already created two services as the owner.
        self.assertGreater(Service.objects.filter(salon=self.salon).count(), 0)
        tenant = Tenant.objects.get(salon=self.salon)
        for service in Service.objects.filter(salon=self.salon):
            self.assertEqual(service.tenant_id, tenant.pk)

    def test_a_new_service_is_filed_under_the_same_tenant(self):
        self.as_user(self.owner_session)
        response = self.client.post('/api/services/', {
            'name': 'Blow dry', 'price': '400.00', 'duration_minutes': 30,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        service = Service.objects.get(pk=response.data['id'])
        self.assertIsNotNone(service.tenant_id)
        self.assertEqual(service.tenant_id, service.salon.tenant.pk)

    def test_a_lone_barbers_service_carries_their_own_tenant(self):
        barber = self.make_barber()
        self.as_user(barber)
        response = self.client.post('/api/services/', {
            'name': 'Skin fade', 'price': '350.00', 'duration_minutes': 30,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        service = Service.objects.get(pk=response.data['id'])
        self.assertEqual(service.tenant_id, service.barber.tenant.pk)
        # And it is *their* tenant, not the salon's.
        self.assertNotEqual(service.tenant_id, Tenant.objects.get(salon=self.salon).pk)


class GalleryTenantTests(BookingTestCase):
    """`GalleryView.post`."""

    def test_a_salons_picture_carries_the_salons_tenant(self):
        self.as_user(self.owner_session)
        response = self.client.post(GALLERY, {'image': TINY_PNG}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        image = GalleryImage.objects.get(pk=response.data['id'])
        self.assertEqual(image.tenant_id, image.salon.tenant.pk)

    def test_a_lone_barbers_picture_carries_their_own_tenant(self):
        self.as_user(self.make_barber())
        response = self.client.post(GALLERY, {'image': TINY_PNG}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        image = GalleryImage.objects.get(pk=response.data['id'])
        self.assertEqual(image.tenant_id, image.barber.tenant.pk)

    def test_an_employees_own_picture_is_still_allowed_and_has_no_tenant(self):
        """The one row that may exist without a tenant, permanently.

        A hired stylist's portfolio is theirs and not the shop's — see
        `test_an_employees_gallery_is_theirs_and_not_the_salons`, which asserts
        the picture must not appear in the salon's gallery. Their profile is
        therefore not a business and has no tenant to file this under, and both
        alternatives (refuse the upload, or file it under their employer) break
        that contract.

        So `GalleryImage.tenant` stays nullable by design. This is not a gap
        awaiting a decision: it is the decision. `Service`, `WorkingDay` and
        `Appointment` have no equivalent case — each always belongs to a real
        business — which is why only this table keeps the exception.
        """
        employee = self.verify('+8801755000004')
        self.as_user(self.sign_in(employee.phone).data)
        response = self.client.post(GALLERY, {'image': TINY_PNG}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        image = GalleryImage.objects.get(pk=response.data['id'])
        self.assertIsNotNone(image.barber_id)
        self.assertIsNone(image.salon_id)
        self.assertIsNone(image.tenant_id)
        # The salon it hangs beside is untouched by it.
        self.assertFalse(
            GalleryImage.objects.filter(salon=self.salon, pk=image.pk).exists()
        )


class WorkingDayTenantTests(BookingTestCase):
    """`schedules.services.replace_days`, across its three-way owner."""

    def test_a_salons_week_carries_the_salons_tenant(self):
        # The fixture writes the salon's week through PUT /api/schedule/me/.
        days = WorkingDay.objects.filter(salon=self.salon)
        self.assertEqual(days.count(), 7)
        tenant = Tenant.objects.get(salon=self.salon)
        for day in days:
            self.assertEqual(day.tenant_id, tenant.pk)

    def test_a_lone_barbers_week_carries_their_own_tenant(self):
        self.as_user(self.make_barber())
        response = self.client.put('/api/schedule/me/', {'days': [
            {'day': 'mon', 'is_closed': False,
             'intervals': [{'start': '09:00', 'end': '17:00'}]},
        ]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        day = WorkingDay.objects.get(barber__isnull=False, weekday=1)
        self.assertEqual(day.tenant_id, day.barber.tenant.pk)

    def test_a_chairs_own_week_carries_the_salons_tenant(self):
        """The `employment` leg of the three-way owner.

        A chair's hours hang off the employment, but the business is the salon
        the chair is in — so this is the one owner kind whose tenant comes from
        a relation rather than from the column itself.
        """
        self.as_user(self.owner_session)
        response = self.client.put(
            f'/api/schedule/employees/{self.chair.id}/', {'days': [
                {'day': 'tue', 'is_closed': False,
                 'intervals': [{'start': '12:00', 'end': '18:00'}]},
            ]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        day = WorkingDay.objects.get(employment=self.chair, weekday=2)
        self.assertEqual(day.tenant_id, day.employment.salon.tenant.pk)
        self.assertEqual(day.tenant_id, Tenant.objects.get(salon=self.salon).pk)


class AppointmentTenantTests(BookingTestCase):
    """`create_appointment`, `create_walk_in` and the reschedule path."""

    def test_a_booking_carries_its_salons_tenant(self):
        self.as_user(self.customer_session)
        times = self.free_times(services=[self.cut])
        response = self.book(time=times[0], services=[self.cut])
        appointment = Appointment.objects.get(pk=response.data['id'])
        self.assertEqual(appointment.tenant_id, appointment.salon.tenant.pk)

    def test_a_walk_in_carries_its_salons_tenant(self):
        self.as_user(self.owner_session)
        response = self.client.post('/api/bookings/walk-in/', {
            'customer_name': 'Off the street',
            'service_ids': [self.cut.id],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        appointment = Appointment.objects.get(pk=response.data['id'])
        self.assertTrue(appointment.walk_in)
        self.assertEqual(appointment.tenant_id, appointment.salon.tenant.pk)

    def test_a_rescheduled_booking_keeps_the_original_tenant(self):
        """A move never changes business, so it never changes tenant.

        The new row copies the old row's tenant rather than resolving it
        again; `services.reschedule` asserts the two agree before returning,
        so this also exercises that assertion's happy path.
        """
        self.as_user(self.customer_session)
        times = self.free_times(services=[self.cut])
        original = Appointment.objects.get(pk=self.book(time=times[0]).data['id'])

        response = self.client.post(
            f'/api/bookings/{original.pk}/reschedule/',
            {'date': self.day.isoformat(), 'time': times[2]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        moved = Appointment.objects.get(pk=response.data['id'])
        original.refresh_from_db()
        self.assertNotEqual(moved.pk, original.pk)
        self.assertEqual(moved.tenant_id, original.tenant_id)
        self.assertEqual(moved.tenant_id, moved.salon.tenant.pk)


class TenantProvisioningTests(AuthTestCase):
    """A business has its tenant from the moment it is registered."""

    def test_a_salon_has_its_tenant_and_join_token_at_registration(self):
        """Before a single service exists.

        The join token is what the shop's QR code carries, so an owner has to
        be able to print it on the day they sign up — which is the whole
        reason this is not done on first write.
        """
        session = self.make_owner()
        owner = User.objects.get(pk=session['user']['id'])
        salon = owner.salons.first()

        tenant = Tenant.objects.get(salon=salon)
        self.assertTrue(tenant.slug)
        self.assertEqual(len(tenant.join_token), 43)
        self.assertTrue(tenant.is_active)
        # Nothing has been filed under it yet; it exists anyway.
        self.assertFalse(Service.objects.filter(salon=salon).exists())

    def test_an_independent_barber_has_one_too(self):
        session = self.make_barber()
        barber = User.objects.get(pk=session['user']['id']).barber_profile
        tenant = Tenant.objects.get(barber_profile=barber)
        self.assertTrue(tenant.slug)
        self.assertEqual(len(tenant.join_token), 43)

    def test_a_hired_stylist_gets_no_tenant(self):
        """Their salon is the business; their profile is a personal record."""
        self.as_user(self.make_owner())
        self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan', 'password': 'chairside2026',
        }, format='json')
        staff = User.objects.get(phone='+8801755000004')
        self.assertIsNotNone(getattr(staff, 'barber_profile', None))
        self.assertFalse(Tenant.objects.filter(barber_profile=staff.barber_profile).exists())

    def test_rows_filed_later_reuse_the_registration_tenant(self):
        """One business, one tenant, however many rows are filed under it."""
        session = self.make_owner()
        self.as_user(session)
        salon = User.objects.get(pk=session['user']['id']).salons.first()
        tenant = Tenant.objects.get(salon=salon)

        for name, price in (('Cut', '500.00'), ('Colour', '2500.00')):
            made = self.client.post('/api/services/', {
                'name': name, 'price': price, 'duration_minutes': 30,
            }, format='json')
            self.assertEqual(made.status_code, 201, made.data)
            self.assertEqual(
                Service.objects.get(pk=made.data['id']).tenant_id, tenant.pk
            )

        self.assertEqual(Tenant.objects.filter(salon=salon).count(), 1)


class SignalProvisioningTests(TestCase):
    """The back door: a business made without going near a serializer.

    Django admin, a management shell, an import script. None of them call
    registration, and before the `post_save` receivers each was a way to put a
    business on the platform with nothing to file its rows under. These build
    rows the same way those do — straight through the ORM.
    """

    def test_a_salon_created_through_the_orm_is_provisioned(self):
        owner = User.objects.create_user(
            phone='01788000001', name='Admin Made', role=Role.SALON_OWNER,
        )
        salon = Salon.objects.create(owner=owner, name='Back Office Salon')

        tenant = Tenant.objects.get(salon=salon)
        self.assertTrue(tenant.slug)
        self.assertEqual(len(tenant.join_token), 43)
        # And the write paths can find it without creating anything.
        self.assertEqual(tenant_for({'salon': salon}).pk, tenant.pk)

    def test_an_independent_barber_created_through_the_orm_is_provisioned(self):
        user = User.objects.create_user(
            phone='01788000002', name='Shell Barber', role=Role.BARBER,
        )
        profile = BarberProfile.objects.create(user=user, business_name='Shell Cuts')

        tenant = Tenant.objects.get(barber_profile=profile)
        self.assertEqual(len(tenant.join_token), 43)
        self.assertEqual(tenant_for({'barber': profile}).pk, tenant.pk)

    def test_an_employees_profile_created_through_the_orm_gets_none(self):
        """The receiver must not hand a tenant to somebody's staff record."""
        user = User.objects.create_user(
            phone='01788000003', name='Hired Hand', role=Role.SALON_EMPLOYEE,
        )
        profile = BarberProfile.objects.create(user=user)

        self.assertFalse(Tenant.objects.filter(barber_profile=profile).exists())
        self.assertIsNone(tenant_for_optional({'barber': profile}))

    def test_an_ownerless_owners_profile_is_provisioned(self):
        """role=salon_owner with no salon — the historical "Faiza" shape.

        Still an independent business by `is_independent_business`, so the
        receiver treats it as one. Here mostly to pin that the receiver
        delegates the classification rather than testing `role == 'barber'`.
        """
        user = User.objects.create_user(
            phone='01788000004', name='No Salon', role=Role.SALON_OWNER,
        )
        profile = BarberProfile.objects.create(user=user)
        self.assertTrue(Tenant.objects.filter(barber_profile=profile).exists())

    def test_provisioning_twice_is_a_no_op(self):
        """Registration calls it explicitly *and* the receiver fires.

        One business, one tenant, whichever order those happen in.
        """
        owner = User.objects.create_user(
            phone='01788000005', name='Twice', role=Role.SALON_OWNER,
        )
        salon = Salon.objects.create(owner=owner, name='Twice Over')
        first = Tenant.objects.get(salon=salon)

        again = provision_for_salon(salon)
        self.assertEqual(again.pk, first.pk)
        self.assertEqual(Tenant.objects.filter(salon=salon).count(), 1)

    def test_saving_an_existing_business_does_not_make_a_second_tenant(self):
        """The receivers key on `created`, not on every save."""
        owner = User.objects.create_user(
            phone='01788000006', name='Renamer', role=Role.SALON_OWNER,
        )
        salon = Salon.objects.create(owner=owner, name='First Name')
        tenant = Tenant.objects.get(salon=salon)

        salon.name = 'Renamed Entirely'
        salon.save()

        self.assertEqual(Tenant.objects.filter(salon=salon).count(), 1)
        # The slug is not chased after the name, either.
        self.assertEqual(Tenant.objects.get(salon=salon).slug, tenant.slug)


class MissingTenantTests(AuthTestCase):
    """The hard-failure path, which no ordinary request can reach."""

    def test_a_salon_that_skipped_post_save_raises_rather_than_guessing(self):
        """`tenant_for` never creates. It says who failed to.

        Since the receivers in `Apps/tenants/signals.py` landed, an ordinary
        `Salon.objects.create` — admin, shell, fixture — is provisioned, so the
        only way left to produce an unprovisioned salon is `bulk_create`, which
        does not send `post_save`. That is the one remaining hole, and building
        the failure this way is what documents it.

        `MissingTenant` is deliberately not a DRF exception, so it surfaces as
        a 500 with a traceback rather than a tidy 409 nobody investigates.
        """
        owner = User.objects.create_user(
            phone='01799000001', name='Back Door', role=Role.SALON_OWNER,
        )
        Salon.objects.bulk_create([Salon(owner=owner, name='Unprovisioned')])
        salon = Salon.objects.get(owner=owner, name='Unprovisioned')
        self.assertIsNone(getattr(salon, 'tenant', None))

        with self.assertRaises(MissingTenant) as caught:
            tenant_for({'salon': salon})
        self.assertIn(str(salon.pk), str(caught.exception))

    def test_an_employees_profile_is_refused_by_the_strict_lookup(self):
        """…and answered with None by the optional one."""
        self.as_user(self.make_owner())
        self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan', 'password': 'chairside2026',
        }, format='json')
        profile = User.objects.get(phone='+8801755000004').barber_profile

        with self.assertRaises(MissingTenant):
            tenant_for({'barber': profile})
        self.assertIsNone(tenant_for_optional({'barber': profile}))
