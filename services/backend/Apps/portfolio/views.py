"""The signed-in professional's own gallery.

Whose gallery it is never comes from the request — it is worked out from the
caller's role, so there is no id anyone could swap for someone else's.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from Apps.tenants.context import business_of_tenant, tenant_of_request
from Apps.tenants.permissions import TenantContext
from Apps.tenants.provisioning import tenant_for_optional
from Apps.users.models import Role
from Apps.users.permissions import IsProvider

from .models import GalleryImage
from .serializers import GalleryImageSerializer


def gallery_owner(user, tenant=None):
    """`{'barber': …}` or `{'salon': …}` — the keyword the rows hang off.

    A salon owner shows the shop. Everyone else who holds scissors — a solo
    barber, and an employee who has their own chair — shows their own work.

    Only the owner's branch is tenant-qualified, and deliberately so. An
    owner's gallery is the shopfront, so *which* shop has to come from the
    request rather than from whichever salon sorts first. A stylist's gallery
    is their own portfolio — the same pictures whichever shop they are
    standing in — so the tenant has no say in it. That asymmetry is the
    `test_an_employees_gallery_is_theirs_and_not_the_salons` contract, and
    reading it off the tenant would quietly break it.
    """
    if user.role == Role.SALON_OWNER:
        business = business_of_tenant(tenant)
        if business is None or business.get('salon') is None:
            return None
        return business if business['salon'].owner_id == user.id else None
    profile = getattr(user, 'barber_profile', None)
    return {'barber': profile} if profile is not None else None


class GalleryView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsProvider, TenantContext)
    serializer_class = GalleryImageSerializer

    def _owner(self):
        owner = gallery_owner(self.request.user, tenant_of_request(self.request))
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

        # Unlike the price list, this view is reachable by a salon employee:
        # `gallery_owner` deliberately falls through to their own barber
        # profile, because a stylist's portfolio is theirs and not the shop's.
        # That profile is not a business, so it has no tenant — and this is
        # the one row in the project allowed to be created without one. See
        # `tenant_for_optional` for why the alternatives are worse and what
        # has to be decided before `tenant` can be made NOT NULL.
        tenant = tenant_for_optional(owner)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = serializer.save(**owner, tenant=tenant)
        return Response(GalleryImageSerializer(image).data, status=status.HTTP_201_CREATED)


class GalleryItemView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsProvider, TenantContext)
    serializer_class = GalleryImageSerializer

    def _get(self, request, pk: int):
        owner = gallery_owner(request.user, tenant_of_request(request))
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
