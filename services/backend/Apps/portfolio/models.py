"""The pictures a professional shows.

A barber's gallery is the work in their hands — six frames, the grid on a
phone. A salon's is the shopfront: the room, the chairs, the front door. Both
are the same row with a different owner column, and both cap so nobody turns a
profile into an album.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import models

from Apps.common.images import ImageRefField
from Apps.users.models import MAX_BARBER_GALLERY, MAX_SALON_GALLERY


class GalleryImage(models.Model):
    barber = models.ForeignKey(
        'users.BarberProfile', on_delete=models.CASCADE, null=True, blank=True,
        related_name='gallery',
    )
    salon = models.ForeignKey(
        'users.Salon', on_delete=models.CASCADE, null=True, blank=True,
        related_name='gallery',
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
        db_index=True, related_name='gallery_images',
    )
    #: Never blank: a gallery row with no picture is not a picture.
    image = ImageRefField(blank=False)
    caption = models.CharField(max_length=120, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('sort_order', 'created_at')
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(barber__isnull=False, salon__isnull=True)
                    | models.Q(barber__isnull=True, salon__isnull=False)
                ),
                name='gallery_image_has_exactly_one_owner',
            ),
        ]

    def __str__(self) -> str:
        return self.caption or f'Gallery image {self.pk}'

    @staticmethod
    def limit_for(*, barber=None, salon=None) -> int:
        return MAX_BARBER_GALLERY if barber is not None else MAX_SALON_GALLERY

    def clean(self):
        super().clean()
        if bool(self.barber_id) == bool(self.salon_id):
            raise ValidationError('A gallery image belongs to a barber or to a salon.')
