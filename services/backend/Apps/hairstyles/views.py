"""The AI try-on catalogue: curated by admins, read by the app.

Split the way the price list is — a gated write and a wider read — but as two
pairs of endpoints rather than one with branching permissions. The admin pair
sees every row and every field; the catalogue pair is what the app's try-on
picker renders from, so it carries active styles only and nothing about how
they are curated. Deactivating or deleting a style is what takes it out of
the app, and nothing on the app's side has to know which of the two it was.
"""

from __future__ import annotations

from django.db.models import Q
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from Apps.users.permissions import IsAdmin

from .models import Hairstyle
from .serializers import HairstyleCatalogueSerializer, HairstyleSerializer


def _not_found() -> Response:
    return Response(
        {'detail': 'No such hairstyle.', 'code': 'not_found', 'errors': {}},
        status=status.HTTP_404_NOT_FOUND,
    )


class HairstyleListCreateView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsAdmin)
    serializer_class = HairstyleSerializer

    def get(self, request):
        styles = Hairstyle.objects.all()
        query = request.query_params.get('q', '').strip()
        if query:
            styles = styles.filter(Q(name__icontains=query) | Q(category__icontains=query))
        return Response(self.get_serializer(styles, many=True).data)

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        hairstyle = serializer.save()
        return Response(self.get_serializer(hairstyle).data, status=status.HTTP_201_CREATED)


class HairstyleDetailView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsAdmin)
    serializer_class = HairstyleSerializer

    def _get(self, pk: int) -> Hairstyle | None:
        return Hairstyle.objects.filter(pk=pk).first()

    def get(self, request, pk: int):
        hairstyle = self._get(pk)
        if hairstyle is None:
            return _not_found()
        return Response(self.get_serializer(hairstyle).data)

    def patch(self, request, pk: int):
        hairstyle = self._get(pk)
        if hairstyle is None:
            return _not_found()
        serializer = self.get_serializer(hairstyle, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk: int):
        hairstyle = self._get(pk)
        if hairstyle is None:
            return _not_found()
        hairstyle.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HairstyleCatalogueView(GenericAPIView):
    """Every active style, newest first — the app's try-on picker.

    Open to any signed-in account: the catalogue is the same for everyone and
    says nothing about anybody, and which roles get the try-on at all is the
    app's routing decision, not this list's."""

    permission_classes = (IsAuthenticated,)
    serializer_class = HairstyleCatalogueSerializer

    def get(self, request):
        styles = Hairstyle.objects.filter(is_active=True)
        return Response(self.get_serializer(styles, many=True).data)


class HairstyleCatalogueDetailView(GenericAPIView):
    """One active style. An inactive one is a 404, exactly like a deleted
    one — to the app, a style the admin has switched off does not exist."""

    permission_classes = (IsAuthenticated,)
    serializer_class = HairstyleCatalogueSerializer

    def get(self, request, pk: int):
        hairstyle = Hairstyle.objects.filter(pk=pk, is_active=True).first()
        if hairstyle is None:
            return _not_found()
        return Response(self.get_serializer(hairstyle).data)
