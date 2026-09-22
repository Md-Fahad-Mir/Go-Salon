"""Working hours.

    GET       /api/schedule/me/                        the caller's own week
    PUT       /api/schedule/me/                        a barber or an owner only
    GET/PUT/DELETE /api/schedule/employees/<pk>/       a chair, set by its owner

**An employee works the salon's hours.** They read them here and cannot write
them: a chair inside a shop cannot be open when the shop is shut, and the
person who decides when the shop is open is the person who owns it. Their GET
answers with the salon's week and `source: "salon"`, or with whatever their
owner has set for their chair.

That leaves one writer per week, which is the point — there is no copy to fall
out of step, and no argument about whose hours are the real ones.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from Apps.users.models import Role, SalonEmployee
from Apps.users.permissions import IsProvider, IsSalonOrParlorOwner

from . import services as schedule_service
from .serializers import ScheduleWriteSerializer, serialize_days


def own_owner(user) -> dict | None:
    """The rows a professional's own schedule hangs off."""
    if user.role == Role.BARBER:
        profile = getattr(user, 'barber_profile', None)
        return {'barber': profile} if profile is not None else None
    if user.role == Role.SALON_OWNER:
        salon = user.salons.first()
        return {'salon': salon} if salon is not None else None
    if user.role == Role.SALON_EMPLOYEE:
        employment = user.employments.filter(is_active=True).first()
        return {'employment': employment} if employment is not None else None
    return None


def salon_owner_of(user) -> dict | None:
    """The salon an employee falls back to, if they have one."""
    employment = user.employments.filter(is_active=True).select_related('salon').first()
    return {'salon': employment.salon} if employment is not None else None


def schedule_payload(owner: dict, fallback: dict | None = None, *, editable: bool = True) -> dict:
    """The week to show, where it came from, and whether this caller may change it.

    `source` says whose hours these are — the chair's own, the salon's, or a
    suggestion nobody has saved. `editable` is a separate question: an employee
    reads their salon's week and cannot write it, so a screen that offered them
    an edit button would be offering something the API refuses.
    """
    if schedule_service.has_schedule(owner):
        return {
            'source': 'own',
            'editable': editable,
            'days': serialize_days(schedule_service.days_for(owner)),
        }
    if fallback is not None and schedule_service.has_schedule(fallback):
        return {
            'source': 'salon',
            'editable': editable,
            'days': serialize_days(schedule_service.days_for(fallback)),
        }
    return {
        'source': 'default',
        'editable': editable,
        'days': schedule_service.default_week(),
    }


class MyScheduleView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsProvider)
    serializer_class = ScheduleWriteSerializer

    def _owner(self):
        return own_owner(self.request.user)

    def _fallback(self):
        if self.request.user.role == Role.SALON_EMPLOYEE:
            return salon_owner_of(self.request.user)
        return None

    def get(self, request):
        owner = self._owner()
        if owner is None:
            return _no_business()
        return Response(schedule_payload(
            owner, self._fallback(),
            editable=request.user.role != Role.SALON_EMPLOYEE,
        ))

    def put(self, request):
        if request.user.role == Role.SALON_EMPLOYEE:
            return _salon_sets_these()
        owner = self._owner()
        if owner is None:
            return _no_business()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        schedule_service.replace_days(owner, serializer.validated_data['days'])
        return Response(schedule_payload(owner, self._fallback()))

    def delete(self, request):
        """Nobody clears their own week here.

        An employee has nothing of their own to give back, and a barber or an
        owner clearing theirs would leave a business with no hours at all —
        which reads to every customer as permanently shut.
        """
        if request.user.role == Role.SALON_EMPLOYEE:
            return _salon_sets_these()
        return Response(
            {'detail': 'Your own hours are the ones customers see; set them '
                       'rather than clearing them.',
             'code': 'cannot_clear_schedule', 'errors': {}},
            status=status.HTTP_400_BAD_REQUEST,
        )


class EmployeeScheduleView(GenericAPIView):
    """An owner setting the hours of one chair."""

    permission_classes = (IsAuthenticated, IsSalonOrParlorOwner)
    serializer_class = ScheduleWriteSerializer

    def _employment(self, request, pk: int):
        return SalonEmployee.objects.filter(
            pk=pk, salon__owner=request.user
        ).select_related('salon').first()

    def get(self, request, pk: int):
        employment = self._employment(request, pk)
        if employment is None:
            return _no_such_chair()
        return Response(schedule_payload({'employment': employment},
                                         {'salon': employment.salon}))

    def put(self, request, pk: int):
        employment = self._employment(request, pk)
        if employment is None:
            return _no_such_chair()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        schedule_service.replace_days({'employment': employment},
                                      serializer.validated_data['days'])
        return Response(schedule_payload({'employment': employment},
                                         {'salon': employment.salon}))

    def delete(self, request, pk: int):
        employment = self._employment(request, pk)
        if employment is None:
            return _no_such_chair()
        schedule_service.clear_days({'employment': employment})
        return Response(schedule_payload({'employment': employment},
                                         {'salon': employment.salon}))


def _no_business() -> Response:
    return Response(
        {'detail': 'Set your business up before setting opening hours.',
         'code': 'no_business', 'errors': {}},
        status=status.HTTP_409_CONFLICT,
    )


def _salon_sets_these() -> Response:
    return Response(
        {'detail': 'Your salon sets the hours its chairs work. Ask the owner to '
                   'change yours.',
         'code': 'salon_sets_hours', 'errors': {}},
        status=status.HTTP_403_FORBIDDEN,
    )


def _no_such_chair() -> Response:
    return Response({'detail': 'No such employee.', 'code': 'not_found', 'errors': {}},
                    status=status.HTTP_404_NOT_FOUND)
