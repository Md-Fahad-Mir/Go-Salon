"""Working hours, in and out.

A week arrives whole. Sending one day at a time would make "closed on Friday"
and "open 9–1 and 4–8 on Friday" two different kinds of request; taking the
whole week means one shape, one validation pass, and no way to leave a
schedule half-written.
"""

from __future__ import annotations

from datetime import time

from rest_framework import serializers

from .models import WEEKDAYS, WorkingDay, WorkingInterval


class IntervalSerializer(serializers.Serializer):
    start = serializers.TimeField(format='%H:%M', input_formats=['%H:%M', '%H:%M:%S'])
    end = serializers.TimeField(format='%H:%M', input_formats=['%H:%M', '%H:%M:%S'])

    def validate(self, attrs: dict) -> dict:
        if attrs['end'] <= attrs['start']:
            raise serializers.ValidationError(
                [serializers.ErrorDetail(
                    'A shift has to end after it starts.', code='interval_backwards')]
            )
        return attrs


class WorkingDaySerializer(serializers.Serializer):
    """One day: shut, or open for one or more stretches."""

    day = serializers.ChoiceField(choices=[(key, key) for key in WEEKDAYS])
    is_closed = serializers.BooleanField(default=False)
    intervals = IntervalSerializer(many=True, required=False, default=list)

    def validate(self, attrs: dict) -> dict:
        intervals = attrs.get('intervals') or []

        if attrs.get('is_closed'):
            # A closed day carries no hours. Silently dropping them would let
            # a confused client think it had saved something.
            if intervals:
                raise serializers.ValidationError(
                    [serializers.ErrorDetail(
                        f'{attrs["day"]} is marked closed, so it cannot have hours too.',
                        code='closed_with_intervals')]
                )
            return attrs

        if not intervals:
            raise serializers.ValidationError(
                [serializers.ErrorDetail(
                    f'Give {attrs["day"]} an opening time or mark it closed.',
                    code='day_without_hours')]
            )

        # Overlaps are the bug this whole serializer exists to stop: two
        # stretches covering the same minute means two bookings for one chair.
        ordered = sorted(intervals, key=lambda item: item['start'])
        for earlier, later in zip(ordered, ordered[1:]):
            if later['start'] < earlier['end']:
                raise serializers.ValidationError(
                    [serializers.ErrorDetail(
                        f'Two of {attrs["day"]}\'s opening times overlap '
                        f'({_hhmm(earlier["start"])}-{_hhmm(earlier["end"])} and '
                        f'{_hhmm(later["start"])}-{_hhmm(later["end"])}).',
                        code='intervals_overlap')]
                )
        attrs['intervals'] = ordered
        return attrs


def _hhmm(value: time) -> str:
    return value.strftime('%H:%M')


class ScheduleWriteSerializer(serializers.Serializer):
    """A whole week. Days left out keep whatever they had."""

    days = WorkingDaySerializer(many=True)

    def validate_days(self, value: list) -> list:
        seen = [day['day'] for day in value]
        duplicates = {key for key in seen if seen.count(key) > 1}
        if duplicates:
            raise serializers.ValidationError(
                [serializers.ErrorDetail(
                    f'{", ".join(sorted(duplicates))} appears more than once.',
                    code='duplicate_day')]
            )
        if not value:
            raise serializers.ValidationError(
                [serializers.ErrorDetail('Send at least one day.', code='required')]
            )
        return value


def serialize_days(days) -> list[dict]:
    """A stored week, as the app reads it. Always seven entries, in order, so
    the client never has to fill in the gaps itself."""
    by_key = {day.key: day for day in days}
    out = []
    for key in WEEKDAYS:
        day = by_key.get(key)
        if day is None:
            out.append({'day': key, 'is_closed': True, 'intervals': []})
            continue
        out.append({
            'day': key,
            'is_closed': day.is_closed,
            'intervals': [
                {'start': _hhmm(interval.start), 'end': _hhmm(interval.end)}
                for interval in day.intervals.all()
            ],
        })
    return out
