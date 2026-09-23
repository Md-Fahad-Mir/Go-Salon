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

from Apps.tenants.context import business_of_tenant, tenant_of_request
from Apps.tenants.permissions import TenantContext
from Apps.tenants.provisioning import tenant_for
from Apps.users.exceptions import Conflict
from Apps.users.models import Role
from Apps.users.permissions import IsProvider

from .models import Service, ServiceCategory
from .serializers import ServiceCategorySerializer, ServiceSerializer


def service_owner(user, tenant) -> dict | None:
    """Where a *new* service belongs, for the roles that may make one.

    Read off the tenant the request is acting in, not off the account. An
    owner with two salons used to get whichever sorted first by name, and a
    price added to the wrong shop is not an error anyone would notice until a
    customer was quoted it.
    """
    business = business_of_tenant(tenant)
    if business is None:
        return None
    if user.role == Role.BARBER and business.get('barber') is not None:
        # Their own trade, and only their own: the tenant has to *be* them.
        profile = getattr(user, 'barber_profile', None)
        if profile is not None and business['barber'].pk == profile.pk:
            return business
        return None
    if user.role == Role.SALON_OWNER and business.get('salon') is not None:
        return business if business['salon'].owner_id == user.id else None
    return None


def visible_services(user, tenant):
    """Everything this account is allowed to look at, in this tenant.

    Each of the three branches used to answer from the account alone, and each
    was wrong in a different degree:

      * an **owner** got `filter(salon__owner=user)` — *every* salon they own.
        With multi-salon owners now a product decision rather than an
        accident, that is two businesses' price lists in one response, and a
        real data-correctness bug rather than a hypothetical one.
      * a **barber** got their own services, and an **employee** their
        salon's. Neither can mix two businesses — a `BarberProfile` is
        one-to-one with its account, and `unique_active_employment_per_user`
        is a partial unique index, so each maps to exactly one tenant. But
        both ignored the tenant the request named, which means a request
        asking about one business could be answered about another. Not a leak;
        still a lie.

    So all three now answer `filter(tenant=tenant)` — and all three check
    first. That check is the important half: filtering on a tenant the caller
    merely *named* would let any provider read any salon's price list by
    putting its id on the request, which would be a new and worse bug than the
    one being fixed.
    """
    if tenant is None:
        return Service.objects.none()

    if user.role in {Role.BARBER, Role.SALON_OWNER}:
        # `service_owner` already answers "is this tenant's business yours?"
        # for exactly these two roles, so the question is asked once.
        if service_owner(user, tenant) is None:
            return Service.objects.none()
        return Service.objects.filter(tenant=tenant)

    if user.role == Role.SALON_EMPLOYEE:
        employment = user.employments.filter(is_active=True).first()
        if employment is None or not tenant.salon_id:
            return Service.objects.none()
        if employment.salon_id != tenant.salon_id:
            return Service.objects.none()
        return Service.objects.filter(tenant=tenant)

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
    permission_classes = (IsAuthenticated, IsProvider, TenantContext)
    serializer_class = ServiceSerializer

    def get(self, request):
        services = (
            visible_services(request.user, tenant_of_request(request))
            .select_related('category')
            .prefetch_related('eligible_employees')
        )
        return Response(self.get_serializer(services, many=True).data)

    def post(self, request):
        if not can_write(request.user):
            return _forbidden('Your salon sets the price list.')
        owner = service_owner(request.user, tenant_of_request(request))
        if owner is None:
            raise Conflict('Set your business up before adding services.',
                           code='no_business')
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # The tenant is the owner above under another name, so it is read off
        # that same resolution rather than worked out again from the request.
        service = serializer.save(**owner, tenant=tenant_for(owner))
        return Response(self.get_serializer(service).data, status=status.HTTP_201_CREATED)


class ServiceDetailView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsProvider, TenantContext)
    serializer_class = ServiceSerializer

    def _get(self, request, pk: int):
        return (
            visible_services(request.user, tenant_of_request(request))
            .filter(pk=pk).first()
        )

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
