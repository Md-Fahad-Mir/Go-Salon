"""Subscription tiers: curated by admins, read by pricing pages.

Split the way the hairstyle catalogue is — an admin set that sees every
field and can change them, and a public list that carries only what a
pricing page shows.
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import Count, ProtectedError
from rest_framework import serializers, status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from Apps.users.exceptions import Conflict
from Apps.users.permissions import IsAdmin

from .models import SubscriptionTier
from .serializers import (
    SubscriptionTierCatalogueSerializer,
    SubscriptionTierReorderSerializer,
    SubscriptionTierSerializer,
)


def tiers():
    """Every tier, in display order, with how many accounts are on it. The
    order is spelled out: Django leaves `Meta.ordering` off GROUP BY queries."""
    return SubscriptionTier.objects.annotate(subscriber_count=Count('subscribers')).order_by('position', 'pk')


def _not_found() -> Response:
    return Response(
        {'detail': 'No such plan.', 'code': 'not_found', 'errors': {}},
        status=status.HTTP_404_NOT_FOUND,
    )


def _accounts(count: int) -> str:
    return f'{count} account' if count == 1 else f'{count} accounts'


class AdminSubscriptionTierListCreateView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsAdmin)
    serializer_class = SubscriptionTierSerializer

    def get(self, request):
        return Response(self.get_serializer(tiers(), many=True).data)

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tier = serializer.save()
        return Response(self.get_serializer(tiers().get(pk=tier.pk)).data, status=status.HTTP_201_CREATED)


class AdminSubscriptionTierDetailView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsAdmin)
    serializer_class = SubscriptionTierSerializer

    def get(self, request, pk: int):
        tier = tiers().filter(pk=pk).first()
        if tier is None:
            return _not_found()
        return Response(self.get_serializer(tier).data)

    def patch(self, request, pk: int):
        tier = SubscriptionTier.objects.filter(pk=pk).first()
        if tier is None:
            return _not_found()
        serializer = self.get_serializer(tier, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self.get_serializer(tiers().get(pk=pk)).data)

    def delete(self, request, pk: int):
        """Deletes a plan. Accounts on it are moved to `?move_to=<id>` first;
        without one, a plan anybody is still on is refused rather than
        leaving them on nothing."""
        tier = SubscriptionTier.objects.filter(pk=pk).first()
        if tier is None:
            return _not_found()
        if tier.is_default:
            raise Conflict(
                'New accounts start on this plan. Make another plan the default before deleting it.',
                code='default_tier',
            )

        target = None
        move_to = request.query_params.get('move_to', '').strip()
        if move_to:
            if move_to.isdigit():
                target = SubscriptionTier.objects.exclude(pk=tier.pk).filter(pk=move_to).first()
            if target is None:
                raise serializers.ValidationError({'move_to': ['Choose another plan to move them to.']})

        try:
            with transaction.atomic():
                if target is not None:
                    tier.subscribers.update(subscription_tier=target)
                tier.delete()
        except ProtectedError:
            raise Conflict(
                f'{tier.name} still has {_accounts(tier.subscribers.count())} on it. '
                'Choose a plan to move them to.',
                code='tier_in_use',
            ) from None
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminSubscriptionTierReorderView(GenericAPIView):
    """Sets the display order from a list of every tier's id."""

    permission_classes = (IsAuthenticated, IsAdmin)
    serializer_class = SubscriptionTierReorderSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            for position, pk in enumerate(serializer.validated_data['order']):
                SubscriptionTier.objects.filter(pk=pk).update(position=position)
        return Response(SubscriptionTierSerializer(tiers(), many=True).data)


class SubscriptionTierCatalogueView(GenericAPIView):
    """Every plan, in the admin's order — what a pricing page renders from.

    Open to anyone, signed in or not: prices are what someone reads before
    deciding to sign up, and they say nothing about anybody."""

    permission_classes = (AllowAny,)
    authentication_classes = ()
    serializer_class = SubscriptionTierCatalogueSerializer

    def get(self, request):
        return Response(self.get_serializer(SubscriptionTier.objects.all(), many=True).data)
