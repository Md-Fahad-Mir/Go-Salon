"""What a customer thought, hung off the appointment it is about.

One review per appointment, and the appointment is the only thing this table
stores about *who* and *where*. The customer, the business, the chair that did
the work, the services and the stylist's name are all reachable through it, so
none of them is copied here — a denormalised salon id is a second version of the
truth waiting to disagree with the first, and the appointment is already the row
every permission rule in this project is written against.

That last part is the important one. `Apps/bookings/access.py::scoped(user,
tenant)`
decides which appointments an account may see, and it has been audited. Because
a review is reachable only through an appointment, the same call answers who may
read which reviews:

    Review.objects.filter(appointment__in=scoped(user, tenant)[0])

gives an owner their salon's reviews, an employee the reviews of work they did,
a barber their own, and a customer the ones they wrote — without a second
permission rule to keep in step with the first.
"""

from __future__ import annotations

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Review(models.Model):
    appointment = models.OneToOneField(
        'bookings.Appointment', on_delete=models.CASCADE, related_name='review',
    )
    #: Whole stars, one to five. The UI has never offered a half.
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    #: A rating on its own is a review. Words are welcome, not required.
    text = models.TextField(blank=True)

    #: The business's answer, shown under the review. Blank until they write one.
    reply = models.TextField(blank=True)
    replied_at = models.DateTimeField(null=True, blank=True)
    #: Which account wrote the reply. At a salon two people can — the owner and
    #: the stylist whose chair it was — so the byline has to be recorded rather
    #: than guessed from whoever is reading the screen.
    replied_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='review_replies',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-created_at',)
        indexes = [models.Index(fields=['-created_at'])]

    def __str__(self) -> str:
        return f'{self.rating}★ on appointment {self.appointment_id}'

    # --- What the appointment already knows ------------------------------

    @property
    def salon_id(self):
        return self.appointment.salon_id

    @property
    def barber_id(self):
        return self.appointment.barber_id

    @property
    def employee_id(self):
        """The chair that did the work, or None for a lone barber."""
        return self.appointment.employee_id

    @property
    def author_name(self) -> str:
        """Whoever sat in the chair — an account holder or a walk-in."""
        return self.appointment.customer_name
