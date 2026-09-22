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
    #: Which tenant this belongs to. Nullable and entirely unpopulated for
    #: now: the backfill is a later step, and until it has run the pair above
    #: is still the only answer to whose row this is.
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.SET_NULL, null=True, blank=True,
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
