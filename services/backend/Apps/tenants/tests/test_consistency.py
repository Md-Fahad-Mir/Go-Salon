"""Every tenant-bearing row agrees with the business that owns it.

This is a whole-table audit rather than a test of one code path. It walks
`Service`, `GalleryImage`, `WorkingDay` and `Appointment` and checks each row
against the owner it already carries, so a future change that starts writing
`tenant` from a view — or a migration that quietly weakens the column — is
caught here rather than in production.

The null check carries the weight on its own for now. `tenant` was briefly
`NOT NULL` and was reverted in Step 5, because nothing wrote the column yet and
the constraint failed most of the suite; the database will enforce it again
once every write path sets it. Until then this is the only thing asserting it,
and when the constraint does come back this test is what stops a later
migration from quietly weakening it.

`GalleryImage` is the one exception, permanently: a hired stylist's own
picture has no business to belong to. See `tenant_for_optional`.
"""

from __future__ import annotations

from datetime import time, timedelta

from django.test import TestCase
from django.utils import timezone

from Apps.bookings.models import Appointment
from Apps.portfolio.models import GalleryImage
from Apps.schedules.models import WorkingDay
from Apps.services.models import Service
from Apps.tenants.models import Tenant
from Apps.users.models import BarberProfile, Role, Salon, SalonEmployee, User

#: The tables this audit covers, and how each one reaches its business. The
#: same shape `backfill_tenants.CHILD_MODELS` uses, kept here rather than
#: imported so a change to the command cannot quietly change what is asserted.
TENANT_MODELS = (
    ('Service', Service),
    ('GalleryImage', GalleryImage),
    ('WorkingDay', WorkingDay),
    ('Appointment', Appointment),
)


class TenantConsistencyTests(TestCase):
    """One of every shape of row, then an audit over all of them."""

    @classmethod
    def setUpTestData(cls):
        # --- a salon, its owner, its tenant -------------------------------
        cls.owner = User.objects.create_user(
            phone='01711000001', name='Salon Owner', role=Role.SALON_OWNER,
            is_phone_verified=True,
        )
        cls.salon = Salon.objects.create(owner=cls.owner, name='Audit Salon')
        # Already provisioned by the post_save receiver in
        # `Apps/tenants/signals.py` — creating one here would be a second
        # tenant for one salon, which the one-to-one column refuses.
        cls.salon_tenant = Tenant.objects.get(salon=cls.salon)

        # --- an independent barber, role still `barber` --------------------
        cls.barber_user = User.objects.create_user(
            phone='01711000002', name='Lone Barber', role=Role.BARBER,
            is_phone_verified=True,
        )
        cls.barber = BarberProfile.objects.create(user=cls.barber_user)
        cls.barber_tenant = Tenant.objects.get(barber_profile=cls.barber)

        # --- an owner who never registered a salon -------------------------
        # The "Faiza" case from the backfill: role says salon_owner, but with
        # no Salon row the barber profile is the only business there is, so it
        # is a tenant in its own right and must be audited like one.
        cls.ownerless_user = User.objects.create_user(
            phone='01711000003', name='Ownerless Owner', role=Role.SALON_OWNER,
            is_phone_verified=True,
        )
        cls.ownerless = BarberProfile.objects.create(user=cls.ownerless_user)
        # role=salon_owner with no salon: still an independent business, so
        # the receiver provisions it too.
        cls.ownerless_tenant = Tenant.objects.get(barber_profile=cls.ownerless)

        # --- a hired stylist, with a profile of their own -------------------
        cls.staff_user = User.objects.create_user(
            phone='01711000004', name='Hired Stylist', role=Role.SALON_EMPLOYEE,
            is_phone_verified=True,
        )
        cls.staff = BarberProfile.objects.create(user=cls.staff_user)
        cls.employment = SalonEmployee.objects.create(
            salon=cls.salon, user=cls.staff_user, title='Stylist',
        )
        # No tenant of their own — a hired stylist is not a business.

        # --- rows of every ownership shape ---------------------------------
        for owner_kwargs, tenant in (
            ({'salon': cls.salon}, cls.salon_tenant),
            ({'barber': cls.barber}, cls.barber_tenant),
            ({'barber': cls.ownerless}, cls.ownerless_tenant),
            # The employer-cascade case: owned by the stylist's own profile,
            # attributed to the salon that employs them.
            ({'barber': cls.staff}, cls.salon_tenant),
        ):
            Service.objects.create(
                name='Cut', price='500.00', duration_minutes=30,
                tenant=tenant, **owner_kwargs,
            )
            GalleryImage.objects.create(
                image='https://example.test/a.jpg', tenant=tenant, **owner_kwargs,
            )
            WorkingDay.objects.create(weekday=1, tenant=tenant, **owner_kwargs)

        # An appointment for each real business. Appointments are never owned
        # by a stylist's personal profile — they name their own business — so
        # there is no employer-cascade case to build here.
        start = timezone.now() + timedelta(days=3)
        for owner_kwargs, tenant in (
            ({'salon': cls.salon}, cls.salon_tenant),
            ({'barber': cls.barber}, cls.barber_tenant),
        ):
            Appointment.objects.create(
                guest_name='Walk In', date=start.date(), start_time=time(11, 0),
                end_time=time(11, 30), duration_minutes=30, tenant=tenant,
                **owner_kwargs,
            )

    # -- helpers -----------------------------------------------------------

    @staticmethod
    def _expected_tenant_id(row):
        """The tenant a row must carry, or None when no rule applies.

        None means "this row is the employer-cascade case" — see
        `test_employee_owned_rows_only_have_to_be_populated`.
        """
        if getattr(row, 'salon_id', None):
            return row.salon.tenant.pk
        if getattr(row, 'employment_id', None):
            return row.employment.salon.tenant.pk
        if getattr(row, 'barber_id', None):
            if row.barber.user.role == Role.SALON_EMPLOYEE:
                return None
            return row.barber.tenant.pk
        return None

    # -- the audit ---------------------------------------------------------

    def test_tenant_is_never_null(self):
        """No row anywhere may be missing its tenant.

        Also enforced by the database since `0005_alter_*_tenant`. Asserted
        here as well so that a migration which makes the column nullable again
        fails CI instead of passing quietly.
        """
        for label, model in TENANT_MODELS:
            with self.subTest(model=label):
                orphans = model.objects.filter(tenant__isnull=True)
                self.assertEqual(
                    orphans.count(), 0,
                    f'{label} rows with no tenant: '
                    f'{list(orphans.values_list("pk", flat=True))}',
                )

    def test_business_owned_rows_match_their_owners_tenant(self):
        """A row owned by a salon, or by a barber who is a business in their
        own right, must carry exactly that business's tenant.

        "A business in their own right" covers both an account whose role is
        still `barber` and an account registered as a `salon_owner` that never
        created a salon — the backfill treats the second as an independent
        trade, because the barber profile is the only business it has.
        """
        for label, model in TENANT_MODELS:
            rows = model.objects.select_related(
                *[f for f in ('salon', 'barber__user', 'employment__salon')
                  if hasattr(model, f.split('__')[0])]
            )
            for row in rows:
                expected = self._expected_tenant_id(row)
                if expected is None:
                    continue  # employee-owned; see the next test
                with self.subTest(model=label, pk=row.pk):
                    self.assertEqual(
                        row.tenant_id, expected,
                        f'{label} #{row.pk} carries tenant {row.tenant_id} but its '
                        f'owner belongs to tenant {expected}',
                    )

    def test_employee_owned_rows_only_have_to_be_populated(self):
        """A row hanging off a hired stylist's own profile: tenant set, and
        that is all this test asserts.

        It deliberately does **not** check that the tenant is the stylist's
        current employer. The employer attribution in
        `backfill_tenants._cascade_employee_rows` was a one-time reading of
        who employed them on the day the backfill ran. Nothing keeps it true
        afterwards: no view, serializer or signal writes `tenant` at all yet,
        so there is no code path that would re-point these rows when somebody
        changes job. Asserting a match here would be asserting an invariant
        this project does not maintain, and the test would start failing on a
        perfectly ordinary transfer.

        TODO(Step 5): decide what these rows mean when a stylist moves salons,
        at the point where views and serializers begin writing `tenant`
        directly. As it stands this test will not catch a stylist's old
        personal listings still pointing at a previous employer's tenant. The
        options are at least:

          * move them with the stylist, so a portfolio follows its owner;
          * freeze them at the tenant they were created under, and treat the
            attribution as history rather than as ownership;
          * stop attributing them to an employer at all, and give every
            stylist a tenant of their own.

        Whichever is chosen, this test should be tightened to assert it.
        """
        employee_rows = 0
        for label, model in TENANT_MODELS:
            if not hasattr(model, 'barber'):
                continue
            for row in model.objects.filter(
                barber__isnull=False, barber__user__role=Role.SALON_EMPLOYEE
            ).select_related('barber__user'):
                employee_rows += 1
                with self.subTest(model=label, pk=row.pk):
                    self.assertIsNotNone(
                        row.tenant_id,
                        f'{label} #{row.pk} is owned by an employee profile and '
                        f'has no tenant',
                    )
        # The fixtures build three such rows. If that ever becomes zero the
        # test above is passing vacuously, which is worth failing over.
        self.assertGreater(
            employee_rows, 0,
            'no employee-owned rows in the fixtures; this test proves nothing',
        )

    def test_every_tenant_has_exactly_one_business(self):
        """The model's own check constraint, asserted through the ORM.

        Cheap, and it fails loudly if a future migration drops the constraint.
        """
        both = Tenant.objects.filter(
            salon__isnull=False, barber_profile__isnull=False
        ).count()
        neither = Tenant.objects.filter(
            salon__isnull=True, barber_profile__isnull=True
        ).count()
        self.assertEqual(both, 0, 'tenants pointing at two businesses')
        self.assertEqual(neither, 0, 'tenants pointing at no business')
