"""When a chair is open.

A week is seven `WorkingDay` rows, each either closed or carrying one or more
`WorkingInterval`s — because a salon that shuts for lunch, or a stylist who
works a morning and an evening, cannot be described by a single open/close
pair. Intervals are real `TimeField`s rather than JSON so the database can
answer "who is working at four o'clock" when booking arrives.

Three kinds of owner keep a schedule, and exactly one column is filled in:

  * a salon          — the shop's opening hours
  * a solo barber    — their own hours
  * an employment    — one chair's hours, *overriding* the salon's

An employee with no rows of their own works the salon's hours. That is the
whole of "inherit by default": absence is the inheritance, so a salon that
changes its hours moves every chair that never set its own.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import models

#: Sunday first, matching the app's own week and Bangladesh's working one.
WEEKDAYS = ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')


class Weekday(models.IntegerChoices):
    SUNDAY = 0, 'Sunday'
    MONDAY = 1, 'Monday'
    TUESDAY = 2, 'Tuesday'
    WEDNESDAY = 3, 'Wednesday'
    THURSDAY = 4, 'Thursday'
    FRIDAY = 5, 'Friday'
    SATURDAY = 6, 'Saturday'

    @classmethod
    def from_key(cls, key: str) -> int:
        try:
            return WEEKDAYS.index(key)
        except ValueError as error:
            raise ValidationError(f'{key!r} is not a day of the week.') from error

    @staticmethod
    def to_key(value: int) -> str:
        return WEEKDAYS[value]


class WorkingDay(models.Model):
    salon = models.ForeignKey(
        'users.Salon', on_delete=models.CASCADE, null=True, blank=True,
        related_name='working_days',
    )
    barber = models.ForeignKey(
        'users.BarberProfile', on_delete=models.CASCADE, null=True, blank=True,
        related_name='working_days',
    )
    employment = models.ForeignKey(
        'users.SalonEmployee', on_delete=models.CASCADE, null=True, blank=True,
        related_name='working_days',
    )
    #: The business this row belongs to. Backfilled from the salon/barber
    #: columns above, set at creation by `tenant_for` on every write path,
    #: and required: every one of these rows has an owner, so every one has
    #: a tenant.
    #:
    #: CASCADE rather than SET_NULL, which a non-null column cannot use. A
    #: tenant is only ever deleted along with the salon or barber profile it
    #: belongs to (`Tenant.salon` and `Tenant.barber_profile` are both
    #: CASCADE), and that same deletion already takes these rows through
    #: their own owner column — so for every deletion this project performs
    #: the outcome is unchanged. PROTECT would not do: it raises even when
    #: the referencing rows are part of the same deletion, which would make
    #: deleting a salon impossible.
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE,
        db_index=True, related_name='working_days',
    )

    weekday = models.PositiveSmallIntegerField(choices=Weekday.choices)
    #: A closed day keeps its row so "we are shut on Fridays" is a stored fact
    #: rather than the absence of one.
    is_closed = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('weekday',)
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(salon__isnull=False, barber__isnull=True, employment__isnull=True)
                    | models.Q(salon__isnull=True, barber__isnull=False, employment__isnull=True)
                    | models.Q(salon__isnull=True, barber__isnull=True, employment__isnull=False)
                ),
                name='working_day_has_exactly_one_owner',
            ),
            models.UniqueConstraint(
                fields=('salon', 'weekday'), condition=models.Q(salon__isnull=False),
                name='unique_salon_weekday',
            ),
            models.UniqueConstraint(
                fields=('barber', 'weekday'), condition=models.Q(barber__isnull=False),
                name='unique_barber_weekday',
            ),
            models.UniqueConstraint(
                fields=('employment', 'weekday'), condition=models.Q(employment__isnull=False),
                name='unique_employment_weekday',
            ),
        ]

    def __str__(self) -> str:
        return f'{Weekday.to_key(self.weekday)} ({"closed" if self.is_closed else "open"})'

    @property
    def key(self) -> str:
        return Weekday.to_key(self.weekday)


class WorkingInterval(models.Model):
    """One stretch of the day. `end` is exclusive and must come after `start`;
    a shift that runs past midnight is two days' rows, not one backwards one."""

    day = models.ForeignKey(WorkingDay, on_delete=models.CASCADE, related_name='intervals')
    start = models.TimeField()
    end = models.TimeField()

    class Meta:
        ordering = ('start',)

    def __str__(self) -> str:
        return f'{self.start:%H:%M}-{self.end:%H:%M}'

    def clean(self):
        super().clean()
        if self.start and self.end and self.end <= self.start:
            raise ValidationError(
                {'end': 'The end of a shift has to come after its start.'}
            )
