"""Give every existing business a tenant, and every existing row its tenant.

This is the backfill half of step 2 of the multi-tenancy migration: the columns
were added nullable in step 1 and nothing has been written to them. Here they
are filled in from the ownership the rows already carry — `salon` or `barber`
on a `Service`, a `GalleryImage` or an `Appointment`, and the three-way
`salon` / `barber` / `employment` on a `WorkingDay`.

Three things this command refuses to guess at, because guessing wrong is
silent and permanent:

  * **A `BarberProfile` is not by itself a business.** Every salon employee
    gets one when they are hired (`SalonEmployeeCreateSerializer` makes it so
    their photograph and bio have a home, and so leaving the salon hands them
    back a working barber account). Only a profile whose account's role is
    still `barber` is an independent trade, and only those become tenants.
    Anything else is counted and skipped.
  * **A profile whose role is neither `barber` nor `salon_employee`** — an
    owner who also holds one, say — goes to a manual-review bucket. There is
    no rule here that is right often enough to apply without a person looking.
  * **A `salon_owner` with no salon** is reported, never invented. A tenant
    with no business would fail the check constraint the model carries.

Nothing is written unless `--apply` is passed. A dry run does the whole job
inside a transaction and rolls it back, so the counts it prints are measured
rather than estimated — the same queries, against the same rows, with the same
tenants really created and really cascaded, and then undone.

    manage.py backfill_tenants                # dry run, full report
    manage.py backfill_tenants --report-only  # classification only, no writes
    manage.py backfill_tenants --apply        # actually write

Idempotent. A business that already has a tenant keeps it and is reported as
`already`; a row whose tenant is already set is left alone. Running twice
changes nothing the first run did not.

Deliberately out of scope, for a later step: `SalonEmployee`,
`ServiceCategory` and `CustomerTenantMembership`. No column is made
`NOT NULL` here, and no index is added.
"""

from __future__ import annotations

from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F, Q

from Apps.bookings.models import Appointment
from Apps.portfolio.models import GalleryImage
from Apps.schedules.models import WorkingDay
from Apps.services.models import Service
from Apps.tenants.models import Tenant
from Apps.tenants.slugs import unique_slug
from Apps.users.models import BarberProfile, Role, Salon, User

#: The four tables this command fills in, and how each one reaches the business
#: that owns it. `WorkingDay` has three routes because a chair's own hours hang
#: off the employment rather than off the salon — the same three-way ownership
#: its `working_day_has_exactly_one_owner` constraint describes.
CHILD_MODELS = (
    ('services', Service, ('salon', 'barber')),
    ('gallery_images', GalleryImage, ('salon', 'barber')),
    ('working_days', WorkingDay, ('salon', 'barber', 'employment__salon')),
    ('appointments', Appointment, ('salon', 'barber')),
)

#: What a slug note means, in words worth printing.
NOTE_LABELS = {
    'fallback': 'name produced no usable slug, used the pk fallback',
    'reserved': 'name landed on a reserved label, suffixed',
    'collision': 'slug already taken, suffixed',
}


class _Rollback(Exception):
    """Ends a dry run by undoing it. Never escapes `handle`."""


class Command(BaseCommand):
    help = (
        'Create one Tenant per salon and per independent barber, then set the '
        'tenant column on services, gallery images, working days and '
        'appointments. Dry run unless --apply is given.'
    )

    # -- arguments ---------------------------------------------------------

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually write. Without this the command changes nothing.',
        )
        parser.add_argument(
            # default=None rather than True so an explicit --dry-run is
            # distinguishable from the default one. Passing both flags then
            # means the dry run wins, which is the safe way round.
            '--dry-run', action='store_true', default=None,
            help='Report without writing. This is the default; pass it to be sure.',
        )
        parser.add_argument(
            '--report-only', action='store_true',
            help='Print the classification counts and stop. No tenants are '
                 'created, even in a rolled-back transaction, and nothing is '
                 'cascaded or verified.',
        )

    # -- entry point -------------------------------------------------------

    def handle(self, *args, **options):
        write = bool(options['apply']) and not options['dry_run']
        report_only = bool(options['report_only'])

        if options['apply'] and options['dry_run']:
            self._warn('--apply and --dry-run were both given; treating this '
                       'as a dry run.')

        self._banner(
            'REPORT ONLY - nothing will be created' if report_only
            else 'APPLYING - changes will be committed' if write
            else 'DRY RUN - every change is rolled back at the end'
        )

        taken = set(Tenant.objects.values_list('slug', flat=True))
        salon_plan = self._classify_salons(taken)
        barber_plan, excluded, manual_profiles = self._classify_barbers(taken)
        ownerless = self._ownerless_owners()

        self._report_classification(
            salon_plan, barber_plan, excluded, manual_profiles, ownerless
        )

        if report_only:
            self._banner('Report only - stopping before any write.')
            return

        # Everything below happens inside one transaction so that a dry run
        # can measure the real thing and then take it back.
        snapshot = self._snapshot()
        try:
            with transaction.atomic():
                tenants = self._create_tenants(salon_plan, barber_plan)
                self._report_creation(tenants)

                cascaded = self._cascade(tenants)
                self._report_cascade(cascaded)

                self._verify(tenants, snapshot)

                if not write:
                    raise _Rollback
        except _Rollback:
            self._banner('DRY RUN COMPLETE - transaction rolled back, '
                         'nothing was written.')
            return

        self._banner('APPLIED - changes committed.')

    # -- step 1: salons ----------------------------------------------------

    def _classify_salons(self, taken: set[str]) -> list[dict]:
        """One planned tenant per salon. Nothing is written here."""
        plan = []
        for salon in Salon.objects.order_by('pk'):
            existing = Tenant.objects.filter(salon=salon).first()
            if existing is not None:
                plan.append({'kind': 'salon', 'obj': salon, 'slug': existing.slug,
                             'note': 'already', 'existing': existing})
                taken.add(existing.slug)
                continue
            slug, note = unique_slug(
                salon.name, fallback=f'salon-{salon.pk}', taken=taken
            )
            plan.append({'kind': 'salon', 'obj': salon, 'slug': slug,
                         'note': note, 'existing': None})
        return plan

    # -- step 2: independent barbers --------------------------------------

    def _classify_barbers(self, taken: set[str]) -> tuple[list[dict], int, list]:
        """Independent barbers only.

        Returns the plan, how many profiles were skipped because they belong
        to hired staff, and the profiles whose role is something else again.
        """
        plan: list[dict] = []
        excluded = 0
        manual: list[BarberProfile] = []

        for profile in BarberProfile.objects.select_related('user').order_by('pk'):
            role = profile.user.role

            if role == Role.SALON_EMPLOYEE:
                # A hired stylist's trade record. Not a business; never a tenant.
                excluded += 1
                continue
            if role != Role.BARBER:
                manual.append(profile)
                continue

            existing = Tenant.objects.filter(barber_profile=profile).first()
            if existing is not None:
                plan.append({'kind': 'barber', 'obj': profile, 'slug': existing.slug,
                             'note': 'already', 'existing': existing})
                taken.add(existing.slug)
                continue
            slug, note = unique_slug(
                profile.display_name, fallback=f'barber-{profile.pk}', taken=taken
            )
            plan.append({'kind': 'barber', 'obj': profile, 'slug': slug,
                         'note': note, 'existing': None})
        return plan, excluded, manual

    # -- step 3: owners with no salon --------------------------------------

    def _ownerless_owners(self) -> list[User]:
        return list(
            User.objects.filter(role=Role.SALON_OWNER, salons__isnull=True)
            .order_by('pk')
        )

    # -- creation ----------------------------------------------------------

    def _create_tenants(self, salon_plan, barber_plan) -> dict:
        """`{('salon', pk): Tenant}`, creating what does not exist yet."""
        tenants: dict[tuple[str, int], Tenant] = {}
        for entry in (*salon_plan, *barber_plan):
            obj, kind = entry['obj'], entry['kind']
            if entry['existing'] is not None:
                tenants[(kind, obj.pk)] = entry['existing']
                continue
            field = 'salon' if kind == 'salon' else 'barber_profile'
            tenants[(kind, obj.pk)] = Tenant.objects.create(
                **{field: obj}, slug=entry['slug']
            )
        return tenants

    # -- step 4: cascade ---------------------------------------------------

    def _owner_filter(self, kind: str, pk: int, paths: tuple[str, ...]) -> Q:
        """Rows belonging to one business, by every route that reaches it."""
        column = 'salon' if kind == 'salon' else 'barber'
        query = Q()
        for path in paths:
            # 'employment__salon' only ever reaches a salon.
            if path == 'employment__salon':
                if kind == 'salon':
                    query |= Q(employment__salon_id=pk)
            elif path == column:
                query |= Q(**{f'{path}_id': pk})
        return query

    def _cascade(self, tenants: dict) -> dict:
        """Set `tenant` on every child row of every tenant we know about.

        Only rows whose tenant is still null are touched, so a second run
        reports zeros rather than rewriting what the first run did.
        """
        counts: dict[str, int] = defaultdict(int)
        for (kind, pk), tenant in tenants.items():
            for label, model, paths in CHILD_MODELS:
                owner = self._owner_filter(kind, pk, paths)
                if not owner:
                    continue
                # Materialised rather than left as a subquery: `update()` over
                # a filter that spans a join is not portable, and a one-shot
                # backfill can afford the round trip.
                ids = list(
                    model.objects.filter(owner, tenant__isnull=True)
                    .values_list('pk', flat=True)
                )
                if ids:
                    counts[label] += model.objects.filter(pk__in=ids).update(tenant=tenant)
        return counts

    # -- step 5: verification ----------------------------------------------

    def _snapshot(self) -> dict:
        """Child-row counts per business, taken before anything is written.

        This is what the per-tenant totals are checked against afterwards: a
        tenant that ends up with a different number of appointments than its
        salon started with means the cascade reached too far or not far enough.
        """
        snap: dict[tuple[str, int], dict[str, int]] = {}
        for salon in Salon.objects.order_by('pk'):
            snap[('salon', salon.pk)] = {
                label: model.objects.filter(
                    self._owner_filter('salon', salon.pk, paths)
                ).count()
                for label, model, paths in CHILD_MODELS
            }
        for profile in BarberProfile.objects.order_by('pk'):
            snap[('barber', profile.pk)] = {
                label: model.objects.filter(
                    self._owner_filter('barber', profile.pk, paths)
                ).count()
                for label, model, paths in CHILD_MODELS
            }
        return snap

    def _verify(self, tenants: dict, snapshot: dict) -> None:
        self._heading('5. VERIFICATION')

        # (a) What is still null, and whether that is expected.
        self.stdout.write('  Rows with tenant IS NULL:')
        self.stdout.write(f'    {"table":<16}{"null":>8}{"expected":>10}{"MISSED":>9}')
        total_missed = 0
        for label, model, paths in CHILD_MODELS:
            nulls = model.objects.filter(tenant__isnull=True)
            owner_has_tenant = Q()
            for path in paths:
                owner_has_tenant |= Q(**{f'{path}__tenant__isnull': False})
            missed = nulls.filter(owner_has_tenant).count()
            null_total = nulls.count()
            total_missed += missed
            marker = '' if missed == 0 else '   <-- BUG'
            self.stdout.write(
                f'    {label:<16}{null_total:>8}{null_total - missed:>10}{missed:>9}{marker}'
            )
        self.stdout.write(
            '    "expected" = the row\'s own business has no tenant '
            '(hired staff, manual review).'
        )
        self.stdout.write('    "MISSED"   = the business HAS a tenant but the row '
                          'was not updated. Must be 0.')

        # (b) Appointments whose tenant disagrees with their business.
        disagree = (
            Appointment.objects.filter(tenant__isnull=False)
            .exclude(
                Q(salon__tenant__id=F('tenant_id'))
                | Q(barber__tenant__id=F('tenant_id'))
            )
            .count()
        )
        self.stdout.write('')
        line = f'  Appointments whose tenant != salon.tenant / barber.tenant: {disagree}'
        self.stdout.write(line if disagree == 0 else self.style.ERROR(line + '   <-- BUG'))

        # (c) Per-tenant totals against the pre-backfill counts.
        self.stdout.write('')
        self.stdout.write('  Per-tenant row counts vs pre-backfill counts:')
        header = f'    {"tenant":<32} '
        for label, _, _ in CHILD_MODELS:
            header += f'{label[:9]:>11}'
        self.stdout.write(header)

        mismatches = 0
        for (kind, pk), tenant in sorted(tenants.items(), key=lambda kv: kv[1].slug):
            before = snapshot.get((kind, pk), {})
            row = f'    {tenant.slug:<32} '
            for label, model, _ in CHILD_MODELS:
                after = model.objects.filter(tenant=tenant).count()
                expected = before.get(label, 0)
                if after == expected:
                    row += f'{after:>11}'
                else:
                    mismatches += 1
                    row += f'{after}!={expected}'.rjust(11)
            self.stdout.write(row)

        self.stdout.write('')
        if total_missed == 0 and disagree == 0 and mismatches == 0:
            self.stdout.write(self.style.SUCCESS(
                '  All three verification checks passed.'
            ))
        else:
            # Reported, never raised: a dry run exists precisely to show this.
            self.stdout.write(self.style.ERROR(
                f'  VERIFICATION PROBLEMS: {total_missed} missed row(s), '
                f'{disagree} disagreeing appointment(s), '
                f'{mismatches} count mismatch(es). Do not --apply until these '
                f'are understood.'
            ))

    # -- reporting ---------------------------------------------------------

    def _report_classification(self, salon_plan, barber_plan, excluded,
                               manual_profiles, ownerless) -> None:
        self._heading('1. SALONS -> TENANTS')
        fresh = [e for e in salon_plan if e['note'] != 'already']
        already = len(salon_plan) - len(fresh)
        self.stdout.write(f'  salons found:        {len(salon_plan)}')
        self.stdout.write(f'  already had tenant:  {already}')
        self.stdout.write(f'  to create:           {len(fresh)}')
        self._slug_table(salon_plan, 'name')

        self._heading('2. INDEPENDENT BARBERS -> TENANTS')
        fresh_b = [e for e in barber_plan if e['note'] != 'already']
        already_b = len(barber_plan) - len(fresh_b)
        total_profiles = BarberProfile.objects.count()
        self.stdout.write(f'  barber profiles total:            {total_profiles}')
        self.stdout.write(f'  independent (role=barber):        {len(barber_plan)}')
        self.stdout.write(f'  EXCLUDED (role=salon_employee):   {excluded}   '
                          f'<- hired staff, never a tenant')
        self.stdout.write(f'  manual review (other roles):      {len(manual_profiles)}')
        self.stdout.write(f'  already had tenant:               {already_b}')
        self.stdout.write(f'  to create:                        {len(fresh_b)}')
        self._slug_table(barber_plan, 'display_name')

        if manual_profiles:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING(
                '  MANUAL REVIEW - barber profile whose account is neither a '
                'barber nor a salon employee:'
            ))
            for profile in manual_profiles:
                self.stdout.write(
                    f'    BarberProfile #{profile.pk}  user #{profile.user_id}  '
                    f'{profile.user.phone}  role={profile.user.role}  '
                    f'name={profile.display_name!r}'
                )
            self.stdout.write('    -> skipped. Decide by hand whether each is a '
                              'business or a personal record.')

        self._heading('3. MANUAL REVIEW: OWNERLESS OWNERS')
        self.stdout.write(f'  salon_owner accounts with no salon: {len(ownerless)}')
        for user in ownerless:
            self.stdout.write(
                f'    User #{user.pk}  {user.phone}  name={user.name!r}  '
                f'joined={user.date_joined:%Y-%m-%d}'
            )
        if ownerless:
            self.stdout.write('    -> reported only. No tenant is invented for '
                              'an owner with no business.')

    def _slug_table(self, plan, name_attr: str) -> None:
        if not plan:
            return
        self.stdout.write('')
        # A slug can be 63 characters, so every column is followed by an
        # explicit space: padding alone lets a long one run into the next.
        self.stdout.write(f'    {"pk":>4}  {"slug":<32} {"source name":<30} note')
        for entry in plan:
            obj = entry['obj']
            source = getattr(obj, name_attr, '') or ''
            note = entry['note']
            printed = '' if note in ('', 'already') else NOTE_LABELS.get(note, note)
            if note == 'already':
                printed = 'already had a tenant'
            self.stdout.write(
                f'    {obj.pk:>4}  {entry["slug"]:<32} {source[:30]:<30} {printed}'
            )

    def _report_creation(self, tenants: dict) -> None:
        self._heading('TENANTS NOW PRESENT')
        salons = sum(1 for kind, _ in tenants if kind == 'salon')
        barbers = sum(1 for kind, _ in tenants if kind == 'barber')
        self.stdout.write(f'  from salons:            {salons}')
        self.stdout.write(f'  from independent barbers: {barbers}')
        self.stdout.write(f'  total:                  {len(tenants)}')

    def _report_cascade(self, counts: dict) -> None:
        self._heading('4. CASCADE ONTO CHILD ROWS')
        self.stdout.write('  rows newly given a tenant (rows already set are '
                          'left alone):')
        for label, model, _ in CHILD_MODELS:
            total = model.objects.count()
            self.stdout.write(f'    {label:<16}{counts.get(label, 0):>6} of {total}')

    # -- output helpers ----------------------------------------------------

    def _banner(self, text: str) -> None:
        self.stdout.write('')
        self.stdout.write('=' * 74)
        self.stdout.write(f'  {text}')
        self.stdout.write('=' * 74)

    def _heading(self, text: str) -> None:
        self.stdout.write('')
        self.stdout.write(f'-- {text} ' + '-' * max(0, 70 - len(text)))

    def _warn(self, text: str) -> None:
        self.stdout.write(self.style.WARNING(f'  ! {text}'))
