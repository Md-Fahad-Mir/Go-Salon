"""Categories and services, in and out."""

from __future__ import annotations

from rest_framework import serializers

from Apps.common.images import MAX_IMAGE_CHARS
from Apps.common.text import StringListField
from Apps.users.models import Role, SalonEmployee

from .models import Service, ServiceAudience, ServiceCategory


class ServiceCategorySerializer(serializers.ModelSerializer):
    is_shared = serializers.BooleanField(read_only=True)

    class Meta:
        model = ServiceCategory
        fields = ('id', 'name', 'icon', 'description', 'sort_order', 'is_active',
                  'is_shared')
        read_only_fields = ('id', 'is_shared')
        extra_kwargs = {
            'icon': {'required': False, 'allow_blank': True, 'max_length': MAX_IMAGE_CHARS},
            'sort_order': {'required': False},
            'is_active': {'required': False},
        }

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError(
                [serializers.ErrorDetail('Give the category a name.', code='required')]
            )
        owner = self.context['request'].user
        clash = ServiceCategory.objects.filter(owner=owner, name__iexact=name)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError(
                [serializers.ErrorDetail('You already have a category with that name.',
                                         code='category_exists')]
            )
        return name


class ServiceSerializer(serializers.ModelSerializer):
    """One line of a price list.

    `eligible_employee_ids` is how the salon says who may perform it. Leaving
    it empty is not "nobody" — it is "any active chair", which is the answer
    that keeps working when somebody is hired next week.
    """

    category_id = serializers.PrimaryKeyRelatedField(
        queryset=ServiceCategory.objects.all(), source='category',
        required=False, allow_null=True,
    )
    category_name = serializers.CharField(source='category.name', read_only=True,
                                          default=None)
    includes = StringListField(max_length=12, item_max_length=80)
    steps = StringListField(max_length=20, item_max_length=120)
    eligible_employee_ids = serializers.PrimaryKeyRelatedField(
        queryset=SalonEmployee.objects.all(), source='eligible_employees',
        many=True, required=False,
    )
    #: True when the row says nothing about chairs, which means all of them.
    available_to_all_staff = serializers.SerializerMethodField()
    price = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=0)

    class Meta:
        model = Service
        fields = ('id', 'name', 'description', 'price', 'duration_minutes',
                  'buffer_minutes', 'audience', 'includes', 'steps', 'category_id',
                  'category_name', 'eligible_employee_ids',
                  'available_to_all_staff', 'is_active', 'is_popular',
                  'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')
        extra_kwargs = {
            'description': {'required': False, 'allow_blank': True},
            'buffer_minutes': {'required': False},
            'audience': {'required': False},
            'is_active': {'required': False},
            'is_popular': {'required': False},
        }

    def get_available_to_all_staff(self, service: Service) -> bool:
        return not service.eligible_employees.exists()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request is None:
            return
        user = request.user
        # A category has to be one the caller can actually use, and a chair
        # has to be one of their own — otherwise a service could be pinned to
        # another salon's staff.
        self.fields['category_id'].queryset = ServiceCategory.objects.filter(
            is_active=True
        ).filter(models_owner_filter(user))
        self.fields['eligible_employee_ids'].child_relation.queryset = (
            SalonEmployee.objects.filter(salon__owner=user, is_active=True)
            if user.role == Role.SALON_OWNER
            else SalonEmployee.objects.none()
        )

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError(
                [serializers.ErrorDetail('Give the service a name.', code='required')]
            )
        return name

    def validate(self, attrs: dict) -> dict:
        user = self.context['request'].user
        if user.role != Role.SALON_OWNER and attrs.get('eligible_employees'):
            raise serializers.ValidationError(
                {'eligible_employee_ids': [serializers.ErrorDetail(
                    'Only a salon can assign a service to staff.', code='not_a_salon')]}
            )
        return attrs


def models_owner_filter(user):
    """Categories this account may pick: the shared ones plus its own."""
    from django.db.models import Q

    return Q(owner__isnull=True) | Q(owner=user)


class ServiceAudienceChoices:
    """Re-exported so the frontend's options and the model's cannot drift."""

    choices = ServiceAudience.choices
