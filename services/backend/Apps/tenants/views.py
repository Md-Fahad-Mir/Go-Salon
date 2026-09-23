"""Joining a salon, leaving it, and the code that starts it.

A customer scans the shop's QR, which is a link carrying the tenant's
`join_token`. The app posts that token here, a `CustomerTenantMembership`
comes into being, and from then on `X-Tenant-Id` on their requests means
something for that salon.

The join endpoint is the one tenant-scoped thing in this project that
deliberately runs *without* `TenantContext`. It cannot have a tenant on the
request because establishing one is its entire job — requiring a membership in
order to create a membership is a circle. What stands in for that check is the
token: holding it is the claim, and the token is 32 random bytes precisely so
that holding it means something.
"""

from __future__ import annotations

import io

import qrcode
from django.conf import settings
from django.http import HttpResponse
from qrcode.image.pure import PyPNGImage
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from Apps.users.models import Role
from Apps.users.permissions import IsSalonOrParlorOwner

from .models import CustomerTenantMembership, Tenant, new_join_token
from .permissions import OwnsTenant, TenantContext
from .serializers import JoinSerializer, TenantProfileSerializer


def _not_found(detail: str) -> Response:
    return Response({'detail': detail, 'code': 'not_found', 'errors': {}},
                    status=status.HTTP_404_NOT_FOUND)


def _forbidden(detail: str, code: str = 'permission_denied') -> Response:
    return Response({'detail': detail, 'code': code, 'errors': {}},
                    status=status.HTTP_403_FORBIDDEN)


def join_url(tenant: Tenant) -> str:
    """What the QR code actually says.

    The base is configurable because the code printed in a shop has to point
    at wherever the app really is, and that is not the same string in
    development as in production.
    """
    base = getattr(settings, 'JOIN_URL_BASE', 'https://app.gosalon.com').rstrip('/')
    return f'{base}/join/{tenant.join_token}'


def qr_response(tenant: Tenant) -> HttpResponse:
    """The join link as a PNG, made on the way out and kept nowhere.

    Generated per request rather than stored: the image is a pure function of
    the token, so a saved copy is only a second thing to invalidate when the
    token rotates — and rotating it is the point of `/regenerate/`.

    `PyPNGImage` rather than the default Pillow backend. This project has
    deliberately never had Pillow (see `Apps/common/images.py`), and a QR code
    is not a reason to introduce it.
    """
    image = qrcode.make(join_url(tenant), image_factory=PyPNGImage)
    buffer = io.BytesIO()
    image.save(buffer)

    # A plain `HttpResponse`, not DRF's: `Response` hands its body to a
    # renderer, and the JSON renderer would try to serialise PNG bytes. The
    # permission classes have already done their work by the time we are here,
    # so nothing is lost by stepping outside DRF for the body.
    response = HttpResponse(buffer.getvalue(), content_type='image/png')
    # The token can be rotated at any moment, and a cached QR would outlive it
    # on somebody's phone.
    response['Cache-Control'] = 'no-store'
    response['Content-Disposition'] = f'inline; filename="join-{tenant.slug}.png"'
    return response


class JoinView(GenericAPIView):
    """POST a join token, become a customer of that salon.

    No `TenantContext`: see the module docstring. `IsAuthenticated` still
    applies — a membership belongs to somebody, so we have to know who.
    """

    permission_classes = (IsAuthenticated,)
    serializer_class = JoinSerializer

    def post(self, request):
        if request.user.role != Role.CUSTOMER:
            # Not a product judgement so much as a limit of the account model;
            # see the step report. A single global `role` means a membership
            # for a non-customer would be created and then ignored, because
            # `belongs_to` answers the owner/employee/barber branches from
            # their business rather than from memberships. Refusing is honest;
            # writing a row nothing reads would not be.
            return _forbidden(
                'Only a customer account can join a salon.',
                code='not_a_customer',
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tenant = Tenant.objects.filter(
            join_token=serializer.validated_data['join_token'], is_active=True,
        ).select_related('salon', 'barber_profile__user').first()
        if tenant is None:
            # A retired token and a token that never existed answer the same,
            # so a stranger cannot test guesses against the live set.
            return _not_found('That code is not valid any more.')

        membership, created = CustomerTenantMembership.objects.get_or_create(
            customer=request.user, tenant=tenant,
        )
        if not created and not membership.is_active:
            # Re-scanning a salon they had removed. Reactivating the row they
            # already have rather than making a second one is what keeps their
            # bookings and reviews attached to one membership.
            membership.is_active = True
            membership.save(update_fields=['is_active'])

        # Joining twice is not an error — a customer who scans the code again
        # gets the same answer as the first time.
        return Response(
            TenantProfileSerializer(tenant).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class MyTenantsView(GenericAPIView):
    """The salons this customer has joined — the switcher's list."""

    permission_classes = (IsAuthenticated,)
    serializer_class = TenantProfileSerializer

    def get(self, request):
        if request.user.role != Role.CUSTOMER:
            return _forbidden('Only a customer account keeps a list of salons.',
                              code='not_a_customer')
        tenants = Tenant.objects.filter(
            customer_memberships__customer=request.user,
            customer_memberships__is_active=True,
            is_active=True,
        ).select_related('salon', 'barber_profile__user').order_by('slug')
        return Response(TenantProfileSerializer(tenants, many=True).data)


class MyOwnedSalonsView(GenericAPIView):
    """The salons this owner owns — the switcher's list, for the one role that
    can have more than one of anything.

    The counterpart to `MyTenantsView`, and deliberately a separate endpoint
    rather than a role-branch inside it. They answer the same question — which
    tenants may this account act in, i.e. which `X-Tenant-Id` values it may
    send — but from two different relationships, and only one of them is
    revocable. A customer's membership is a row they made by scanning a code
    and can remove again, which is why `MyTenantView` exists to delete one.
    Ownership is not a row anyone joins or leaves: the tenant is provisioned
    with the salon at registration and dies with it. Folding both into one
    path would mean one URL whose DELETE means something for half its callers
    and nothing for the other half.

    Read-only, therefore, and permanently — there is no join, leave or remove
    here, because none of those verbs applies to owning a shop.

    No `TenantContext`: this is what a client calls to find out which tenants
    exist for it, so requiring it to name one first would be circular. It is
    also exactly the account this unblocks — an owner of two salons sending no
    header gets 400 `tenant_required`, and until now had no way to learn either
    id.
    """

    permission_classes = (IsAuthenticated, IsSalonOrParlorOwner)
    serializer_class = TenantProfileSerializer

    def get(self, request):
        tenants = (
            Tenant.objects
            .filter(salon__owner=request.user, is_active=True)
            .select_related('salon')
            # By the name on the shopfront, not by `slug` as the customer list
            # is sorted. The two agree for an English name and part company for
            # a Bengali one, where the slug is a transliteration — and an owner
            # picking between their shops reads the name, so sorting by
            # anything else would look arbitrary to them. Matches
            # `Salon.Meta.ordering` too, so the list is in the same order here
            # as everywhere else a salon is listed.
            .order_by('salon__name')
        )
        return Response(TenantProfileSerializer(tenants, many=True).data)


class MyTenantView(APIView):
    """Removing a salon from the list, without removing what happened there."""

    permission_classes = (IsAuthenticated,)

    def delete(self, request, tenant_id: int):
        if request.user.role != Role.CUSTOMER:
            return _forbidden('Only a customer account keeps a list of salons.',
                              code='not_a_customer')

        membership = CustomerTenantMembership.objects.filter(
            customer=request.user, tenant_id=tenant_id, is_active=True,
        ).first()
        if membership is None:
            # Never a member, already removed, or no such salon — one answer
            # for all three, the same way a booking that is not yours is a 404
            # rather than a 403 that confirms it exists.
            return _not_found('You have not joined that salon.')

        # Soft. Their bookings and reviews there are facts about things that
        # happened, and deleting the membership would orphan every one of
        # them; re-scanning the code brings this row back rather than making
        # a second.
        membership.is_active = False
        membership.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class SalonQRView(APIView):
    """The shop's own QR code, for printing.

    `OwnsTenant` rather than `IsProvider`: a stylist works here, but the code
    on the counter is the business's.
    """

    permission_classes = (IsAuthenticated, TenantContext, OwnsTenant)

    def get(self, request):
        return qr_response(request.tenant)


class SalonQRRegenerateView(APIView):
    """A fresh token, and every printed copy of the old one stops working.

    For a code that has been photographed, posted online, or left with someone
    who should not still have it. Rotating the token cannot disturb anybody
    already joined: a `CustomerTenantMembership` is keyed on the tenant, not
    on the token that introduced them, so the people inside stay inside and
    only the door changes locks.
    """

    permission_classes = (IsAuthenticated, TenantContext, OwnsTenant)

    def post(self, request):
        tenant = request.tenant
        tenant.join_token = new_join_token()
        tenant.save(update_fields=['join_token'])
        return qr_response(tenant)

