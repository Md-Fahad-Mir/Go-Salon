"""What a professional sells.

One `Service` model covers both sides of the trade. A barber's service hangs
off their own profile and says who it suits; a salon's hangs off the salon and
says which chairs are cleared to perform it. They are the same thing — a name,
a price and a length of time — so they are one table with one owner column
filled in, not two tables that drift apart.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from Apps.common.images import ImageRefField


class ServiceAudience(models.TextChoices):
    """Who a service is for. `ALL` is the default: most cuts suit anyone."""

    ALL = 'all', 'Anyone'
    MALE = 'male', 'Men'
    FEMALE = 'female', 'Women'


class ServiceCategory(models.Model):
    """A heading in the price list — "Haircuts", "Colour", "Bridal".

    A category with no owner is part of the catalogue everyone starts from.
    One with an owner was invented by that professional and is theirs alone,
    which is how the app lets someone add a heading nobody thought of.
    """

    name = models.CharField(max_length=40)
    #: An icon name from the app's set, or a picture of their own.
    icon = ImageRefField()
    description = models.CharField(max_length=160, blank=True)
    owner = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, null=True, blank=True,
        related_name='service_categories',
    )
    sort_order = models.PositiveSmallIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('sort_order', 'name')
        verbose_name_plural = 'service categories'
        constraints = [
            models.UniqueConstraint(
                fields=('owner', 'name'), name='unique_category_name_per_owner'
            ),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def is_shared(self) -> bool:
        return self.owner_id is None


class ServiceQuerySet(models.QuerySet):
    def for_barber(self, profile):
        return self.filter(barber=profile)

    def for_salon(self, salon):
        return self.filter(salon=salon)

    def active(self):
        return self.filter(is_active=True)


class Service(models.Model):
    """One line of a price list.

    Exactly one of `barber` and `salon` is set — the check constraint is what
    guarantees a service always has somewhere to belong and never two places
    at once.
    """

    barber = models.ForeignKey(
        'users.BarberProfile', on_delete=models.CASCADE, null=True, blank=True,
        related_name='services',
    )
    salon = models.ForeignKey(
        'users.Salon', on_delete=models.CASCADE, null=True, blank=True,
        related_name='services',
    )
    #: The business this row belongs to. Backfilled from the salon/barber
    #: columns above and complete for every row in the database today — but
    #: still nullable, because nothing *writes* it yet. The views, the
    #: serializers and `bookings/services.py` all create rows without a
    #: tenant, so a NOT NULL column here fails most of the test suite. The
    #: constraint goes on in the same change that teaches those paths to set
    #: it; until then the column is filled by the backfill command alone.
    #:
    #: CASCADE rather than SET_NULL even while the column is nullable. A
    #: tenant is only ever deleted along with the salon or barber profile it
    #: belongs to (`Tenant.salon` and `Tenant.barber_profile` are both
    #: CASCADE), and that deletion already reaches these rows through their
    #: own owner column, so the outcome is the same either way. Keeping
    #: CASCADE now also means making the column non-null later is a one-line
    #: change: SET_NULL is illegal on a non-null column and would have to be
    #: swapped out again anyway.
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE, null=True, blank=True,
        db_index=True, related_name='services',
    )
    category = models.ForeignKey(
        ServiceCategory, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='services',
    )

    name = models.CharField(max_length=60)
    description = models.TextField(blank=True)
    price = models.DecimalField(
        max_digits=8, decimal_places=2, validators=[MinValueValidator(0)]
    )
    duration_minutes = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(5), MaxValueValidator(600)]
    )
    #: Minutes reserved before the chair is taken — mixing colour, prepping a
    #: bridal set. Blocks the diary without appearing on the bill.
    buffer_minutes = models.PositiveSmallIntegerField(
        default=0, validators=[MaxValueValidator(240)]
    )
    #: Whose hair this is for. A barber says it per service; a salon inherits
    #: the answer from the room and normally leaves this alone.
    audience = models.CharField(
        max_length=10, choices=ServiceAudience.choices, default=ServiceAudience.ALL
    )
    includes = models.JSONField(default=list, blank=True)
    #: A multi-step treatment the stylist works through with the client —
    #: colour, keratin, bridal. Same shape as `includes`: what the client is
    #: told, versus what the stylist does.
    steps = models.JSONField(default=list, blank=True)

    #: Which chairs may perform it. **Empty means every active employee** —
    #: that is the "available to all active staff" case, and it keeps working
    #: as staff join and leave without anyone editing the service.
    eligible_employees = models.ManyToManyField(
        'users.SalonEmployee', blank=True, related_name='eligible_services'
    )

    is_active = models.BooleanField(default=True)
    is_popular = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ServiceQuerySet.as_manager()

    class Meta:
        ordering = ('category__sort_order', 'name')
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(barber__isnull=False, salon__isnull=True)
                    | models.Q(barber__isnull=True, salon__isnull=False)
                ),
                name='service_belongs_to_exactly_one_owner',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.name} ({self.owner_label})'

    @property
    def owner_label(self) -> str:
        if self.salon_id:
            return self.salon.name
        return self.barber.display_name if self.barber_id else 'unassigned'

    def clean(self):
        super().clean()
        if bool(self.barber_id) == bool(self.salon_id):
            raise ValidationError(
                'A service belongs to a barber or to a salon, not both and not neither.'
            )

    def performable_by(self, employee) -> bool:
        """Whether a given chair may take this service on."""
        if self.salon_id is None:
            return False
        if not self.eligible_employees.exists():
            return employee.is_active and employee.salon_id == self.salon_id
        return self.eligible_employees.filter(pk=employee.pk, is_active=True).exists()
