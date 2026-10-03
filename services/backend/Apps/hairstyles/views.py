"""The AI try-on catalogue, curated by admins only.

Nothing else in the system reads this yet — no public endpoint offers it to
the app, so every method here is admin-gated rather than split between a
public read and a gated write the way the price list is.
"""

from __future__ import annotations

from django.db.models import Q
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from Apps.users.permissions import IsAdmin

from .models import Hairstyle
from .serializers import HairstyleSerializer


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
