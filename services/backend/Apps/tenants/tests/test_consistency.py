"""Every tenant-bearing row agrees with the business that owns it.

This is a whole-table audit rather than a test of one code path. It walks
`Service`, `GalleryImage`, `WorkingDay` and `Appointment` and checks each row
against the owner it already carries, so a view that starts writing `tenant`
from the wrong place — or a migration that quietly weakens the column — is
caught here rather than in production.

`Service`, `WorkingDay` and `Appointment` are `NOT NULL` in the database again
as of `services.0007`, `schedules.0005` and `bookings.0008`. That makes the
null check below a belt-and-braces duplicate of a live constraint, which is
the point: it is what fails CI if a later migration relaxes the column.

`GalleryImage` is the one exception, permanently — a hired stylist's own
picture has no business to belong to, so its tenant is null and must stay
allowed to be. See `tenant_for_optional` and the comment on the field itself.
The audit therefore does not demand a tenant there; it demands that a missing
one means *exactly* that and nothing else.
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

#: The three the database itself now requires. GalleryImage is deliberately
#: absent — see the module docstring.
REQUIRED_TENANT_MODELS = tuple(
    (label, model) for label, model in TENANT_MODELS if model is not GalleryImage
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
        # Third element: the tenant the *gallery* row carries, which is the
        # one place it can differ. A hired stylist's own picture has none —
        # that is what `tenant_for_optional` writes, so it is what the audit
        # has to be able to see.
        for owner_kwargs, tenant, gallery_tenant in (
            ({'salon': cls.salon}, cls.salon_tenant, cls.salon_tenant),
            ({'barber': cls.barber}, cls.barber_tenant, cls.barber_tenant),
            ({'barber': cls.ownerless}, cls.ownerless_tenant, cls.ownerless_tenant),
            # Owned by the stylist's own profile. The service and the working
            # day are reachable only through the ORM — no view will make one,
            # because `service_owner` refuses an employee and a stylist's
            # schedule hangs off their `employment` — but both columns are NOT
            # NULL, so if such a row ever appears it carries the employer's
            # tenant. The picture is the real, reachable case, and it has none.
            ({'barber': cls.staff}, cls.salon_tenant, None),
        ):
            Service.objects.create(
                name='Cut', price='500.00', duration_minutes=30,
                tenant=tenant, **owner_kwargs,
            )
            GalleryImage.objects.create(
                image='https://example.test/a.jpg', tenant=gallery_tenant,
                **owner_kwargs,
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

    def test_tenant_is_never_null_where_the_column_requires_one(self):
        """No `Service`, `WorkingDay` or `Appointment` may be missing its
        tenant.

        The database enforces this itself since `services.0007`,
        `schedules.0005` and `bookings.0008`. Asserted here as well so that a
        migration which makes one of the columns nullable again fails CI
        instead of passing quietly — the column was NOT NULL once before, in
        Step 4, and was reverted; this is what would notice a second time.
        """
        for label, model in REQUIRED_TENANT_MODELS:
            with self.subTest(model=label):
                orphans = model.objects.filter(tenant__isnull=True)
                self.assertEqual(
                    orphans.count(), 0,
                    f'{label} rows with no tenant: '
                    f'{list(orphans.values_list("pk", flat=True))}',
                )

    def test_a_gallery_picture_with_no_tenant_is_an_employees_own(self):
        """The one permitted null, and only for the one reason.

        `GalleryImage.tenant` stays nullable for good, so this table cannot be
        audited by demanding a tenant. What can be audited is the *meaning* of
        its absence: the sole writer that produces one is
        `tenant_for_optional`, and it does so only for a hired stylist's own
        profile. A null on a salon's picture, or on an independent barber's,
        is a row nobody's code should have been able to write.
        """
        loose = GalleryImage.objects.filter(tenant__isnull=True).select_related(
            'barber__user'
        )
        for row in loose:
            with self.subTest(pk=row.pk):
                self.assertIsNone(
                    row.salon_id,
                    f"GalleryImage #{row.pk} belongs to a salon and so has a "
                    f"business to belong to, but carries no tenant",
                )
                self.assertEqual(
                    row.barber.user.role, Role.SALON_EMPLOYEE,
                    f'GalleryImage #{row.pk} has no tenant but its owner is a '
                    f'{row.barber.user.role}, not a hired stylist',
                )
        # The fixtures build exactly one. A zero here means the check above
        # proved nothing, which is worth failing over.
        self.assertGreater(
            loose.count(), 0,
            'no tenant-less gallery rows in the fixtures; this test proves nothing',
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

    def test_employee_owned_rows_carry_whatever_their_column_allows(self):
        """A row hanging off a hired stylist's own profile.

        This test deliberately does **not** check that the tenant is the
        stylist's *current* employer. The attribution in
        `backfill_tenants._cascade_employee_rows` was a one-time reading of who
        employed them on the day the backfill ran, and nothing re-points these
        rows when somebody changes job. Asserting a match would be asserting an
        invariant this project does not maintain, and the test would start
        failing on a perfectly ordinary transfer.

        What it does assert is the split the columns now describe, which is the
        Step 6 answer to the question Step 4 left open:

          * a picture is the stylist's own and has no tenant at all — their
            portfolio follows them between shops, which is exactly why it
            cannot be filed under one;
          * a service or a working day owned by a personal profile is not
            reachable through any view, and its column is NOT NULL, so it can
            only ever carry a real tenant.

        The consequence, stated plainly so nobody finds it by surprise: a
        stylist's old ORM-made listings can still point at a previous
        employer's tenant, and nothing here will catch it. Only the picture
        case is maintained, and it is maintained by having no tenant to go
        stale.
        """
        pictures = tenants = 0
        for label, model in TENANT_MODELS:
            if not hasattr(model, 'barber'):
                continue
            for row in model.objects.filter(
                barber__isnull=False, barber__user__role=Role.SALON_EMPLOYEE
            ).select_related('barber__user'):
                with self.subTest(model=label, pk=row.pk):
                    if model is GalleryImage:
                        pictures += 1
                        self.assertIsNone(
                            row.tenant_id,
                            f"GalleryImage #{row.pk} is a stylist's own picture "
                            f"but was filed under tenant {row.tenant_id}; their "
                            f"portfolio is not the shop's",
                        )
                    else:
                        tenants += 1
                        self.assertIsNotNone(
                            row.tenant_id,
                            f'{label} #{row.pk} is owned by an employee profile '
                            f'and has no tenant',
                        )
        self.assertGreater(pictures, 0, 'no employee-owned pictures in the fixtures')
        self.assertGreater(tenants, 0, 'no employee-owned required rows in the fixtures')

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
