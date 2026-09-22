"""The price list.

Which services a request can see or touch is decided from the caller's role
and nothing else:

  * a barber            — their own, read and write
  * a salon owner       — their salon's, read and write
  * a salon employee    — their salon's, **read only**; they need to know what
                          they may be asked to do, not to reprice it
  * a customer          — nothing here
"""

from __future__ import annotations

from django.db.models import Q
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from Apps.users.exceptions import Conflict
from Apps.users.models import Role
from Apps.users.permissions import IsProvider

from .models import Service, ServiceCategory
from .serializers import ServiceCategorySerializer, ServiceSerializer


def service_owner(user) -> dict | None:
    """Where a *new* service belongs, for the roles that may make one."""
    if user.role == Role.BARBER:
        profile = getattr(user, 'barber_profile', None)
        return {'barber': profile} if profile is not None else None
    if user.role == Role.SALON_OWNER:
        salon = user.salons.first()
        return {'salon': salon} if salon is not None else None
    return None


def visible_services(user):
    """Everything this account is allowed to look at."""
    if user.role == Role.BARBER:
        profile = getattr(user, 'barber_profile', None)
        return Service.objects.filter(barber=profile) if profile else Service.objects.none()
    if user.role == Role.SALON_OWNER:
        return Service.objects.filter(salon__owner=user)
    if user.role == Role.SALON_EMPLOYEE:
        employment = user.employments.filter(is_active=True).first()
        return (
            Service.objects.filter(salon_id=employment.salon_id)
            if employment
            else Service.objects.none()
        )
    return Service.objects.none()


def can_write(user) -> bool:
    return user.role in {Role.BARBER, Role.SALON_OWNER}


class ServiceCategoryListView(GenericAPIView):
    """The headings available to whoever is asking: the shared catalogue plus
    any they invented themselves."""

    permission_classes = (IsAuthenticated,)
    serializer_class = ServiceCategorySerializer

    def get_queryset(self):
        return ServiceCategory.objects.filter(
            Q(owner__isnull=True) | Q(owner=self.request.user)
        ).filter(is_active=True)

    def get(self, request):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)

    def post(self, request):
        if not can_write(request.user):
            return _forbidden('Only a barber or a salon owner can add a category.')
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save(owner=request.user)
        return Response(ServiceCategorySerializer(category).data,
                        status=status.HTTP_201_CREATED)


class ServiceCategoryDetailView(GenericAPIView):
    """Only a category you invented. The shared ones belong to everybody and
    are not yours to rename."""

    permission_classes = (IsAuthenticated, IsProvider)
    serializer_class = ServiceCategorySerializer

    def _get(self, request, pk: int):
        return ServiceCategory.objects.filter(pk=pk, owner=request.user).first()

    def patch(self, request, pk: int):
        category = self._get(request, pk)
        if category is None:
            return _not_found('No category of yours has that id.')
        serializer = self.get_serializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk: int):
        category = self._get(request, pk)
        if category is None:
            return _not_found('No category of yours has that id.')
        # Services keep their prices and lose their heading rather than being
        # deleted along with it — SET_NULL on the model says the same thing.
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ServiceListCreateView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsProvider)
    serializer_class = ServiceSerializer

    def get(self, request):
        services = (
            visible_services(request.user)
            .select_related('category')
            .prefetch_related('eligible_employees')
        )
        return Response(self.get_serializer(services, many=True).data)

    def post(self, request):
        if not can_write(request.user):
            return _forbidden('Your salon sets the price list.')
        owner = service_owner(request.user)
        if owner is None:
            raise Conflict('Set your business up before adding services.',
                           code='no_business')
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = serializer.save(**owner)
        return Response(self.get_serializer(service).data, status=status.HTTP_201_CREATED)


class ServiceDetailView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsProvider)
    serializer_class = ServiceSerializer

    def _get(self, request, pk: int):
        return visible_services(request.user).filter(pk=pk).first()

    def get(self, request, pk: int):
        service = self._get(request, pk)
        if service is None:
            return _not_found('No such service.')
        return Response(self.get_serializer(service).data)

    def patch(self, request, pk: int):
        service = self._get(request, pk)
        if service is None:
            return _not_found('No such service.')
        if not can_write(request.user):
            return _forbidden('Your salon sets the price list.')
        serializer = self.get_serializer(service, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk: int):
        service = self._get(request, pk)
        if service is None:
            return _not_found('No such service.')
        if not can_write(request.user):
            return _forbidden('Your salon sets the price list.')
        service.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _not_found(detail: str) -> Response:
    return Response({'detail': detail, 'code': 'not_found', 'errors': {}},
                    status=status.HTTP_404_NOT_FOUND)


def _forbidden(detail: str) -> Response:
    return Response({'detail': detail, 'code': 'permission_denied', 'errors': {}},
                    status=status.HTTP_403_FORBIDDEN)
