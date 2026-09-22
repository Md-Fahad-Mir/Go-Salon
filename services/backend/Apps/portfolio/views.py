"""The signed-in professional's own gallery.

Whose gallery it is never comes from the request — it is worked out from the
caller's role, so there is no id anyone could swap for someone else's.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from Apps.users.models import Role
from Apps.users.permissions import IsProvider

from .models import GalleryImage
from .serializers import GalleryImageSerializer


def gallery_owner(user):
    """`{'barber': …}` or `{'salon': …}` — the keyword the rows hang off.

    A salon owner shows the shop. Everyone else who holds scissors — a solo
    barber, and an employee who has their own chair — shows their own work.
    """
    if user.role == Role.SALON_OWNER:
        salon = user.salons.first()
        return {'salon': salon} if salon is not None else None
    profile = getattr(user, 'barber_profile', None)
    return {'barber': profile} if profile is not None else None


class GalleryView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsProvider)
    serializer_class = GalleryImageSerializer

    def _owner(self):
        owner = gallery_owner(self.request.user)
        if owner is None:
            return None
        return owner

    def get(self, request):
        owner = self._owner()
        if owner is None:
            return Response([])
        images = GalleryImage.objects.filter(**owner)
        return Response(GalleryImageSerializer(images, many=True).data)

    def post(self, request):
        owner = self._owner()
        if owner is None:
            return Response(
                {'detail': 'Set your profile up before adding pictures.',
                 'code': 'no_profile', 'errors': {}},
                status=status.HTTP_409_CONFLICT,
            )

        limit = GalleryImage.limit_for(**owner)
        if GalleryImage.objects.filter(**owner).count() >= limit:
            return Response(
                {'detail': f'That is the most pictures you can show ({limit}). '
                           'Remove one to add another.',
                 'code': 'gallery_full', 'errors': {}},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = serializer.save(**owner)
        return Response(GalleryImageSerializer(image).data, status=status.HTTP_201_CREATED)


class GalleryItemView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsProvider)
    serializer_class = GalleryImageSerializer

    def _get(self, request, pk: int):
        owner = gallery_owner(request.user)
        if owner is None:
            return None
        return GalleryImage.objects.filter(pk=pk, **owner).first()

    def patch(self, request, pk: int):
        image = self._get(request, pk)
        if image is None:
            return _not_found()
        serializer = self.get_serializer(image, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk: int):
        image = self._get(request, pk)
        if image is None:
            return _not_found()
        image.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _not_found() -> Response:
    return Response(
        {'detail': 'No such picture.', 'code': 'not_found', 'errors': {}},
        status=status.HTTP_404_NOT_FOUND,
    )
