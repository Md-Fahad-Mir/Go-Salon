"""What goes in and out of the authentication endpoints.

The three registrations share a base, so a customer, a barber and an owner are
validated the same way and differ only in the profile each one writes.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed

from Apps.common.images import MAX_IMAGE_CHARS, validate_image_ref

from .exceptions import Conflict, PhoneNotVerified
from .models import (
    Audience,
    BarberProfile,
    BusinessType,
    CustomerProfile,
    OTPPurpose,
    Role,
    Salon,
    SalonEmployee,
    User,
    starting_credits,
)
from .phone import normalize_phone
from .services import otp as otp_service


def _normalized(value: str) -> str:
    try:
        return normalize_phone(value)
    except DjangoValidationError as error:
        raise serializers.ValidationError(
            [serializers.ErrorDetail(error.messages[0], code='invalid_phone')]
        ) from error


def _check_password_policy(password: str, user: User | None = None) -> str:
    """One policy, run from registration, reset and change alike."""
    try:
        validate_password(password, user)
    except DjangoValidationError as error:
        raise serializers.ValidationError(
            [serializers.ErrorDetail(message, code='password_invalid') for message in error.messages]
        ) from error
    return password


class LocationSerializer(serializers.Serializer):
    area = serializers.CharField(max_length=60, required=False, allow_blank=True, default='')
    city = serializers.CharField(max_length=60, required=False, allow_blank=True, default='')
    address = serializers.CharField(max_length=160, required=False, allow_blank=True, default='')
    latitude = serializers.FloatField(required=False, allow_null=True, default=None)
    longitude = serializers.FloatField(required=False, allow_null=True, default=None)


# --------------------------------------------------------------------------
# Reading a user back
# --------------------------------------------------------------------------


class UserSerializer(serializers.ModelSerializer):
    """The account as the frontend sees it. No password, no hashes, no codes."""

    profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id',
            'phone',
            'name',
            'email',
            'role',
            'is_phone_verified',
            'try_on_credits',
            'date_joined',
            'profile',
        )
        read_only_fields = fields

    def get_profile(self, user: User) -> dict:
        """Only what the signed-in app needs to render itself: which customers
        a professional serves, which salon an employee's chair is in."""
        if user.role == Role.CUSTOMER:
            profile = getattr(user, 'customer_profile', None)
            if profile is None:
                return {}
            return {
                'avatar': profile.avatar,
                'gender': profile.gender,
                'hair_type': profile.hair_type,
                'hair_length': profile.hair_length,
                'location': _location_of(profile),
            }

        data: dict = {}
        barber = getattr(user, 'barber_profile', None)
        if barber is not None:
            data['barber'] = {
                'audience': barber.audience,
                'business_name': barber.business_name,
                'avatar': barber.avatar,
                'experience_years': barber.experience_years,
                'service_ids': barber.service_ids,
                'location': _location_of(barber),
            }
        if user.role == Role.SALON_OWNER:
            salon = user.salons.first()
            if salon is not None:
                data['salon'] = SalonSerializer(salon).data
        if user.role == Role.SALON_EMPLOYEE:
            employment = user.employments.filter(is_active=True).select_related('salon').first()
            if employment is not None:
                data['employment'] = {
                    'salon_id': employment.salon_id,
                    'salon_name': employment.salon.name,
                    'title': employment.title,
                }
        return data


def _location_of(instance) -> dict:
    return {
        'area': instance.area,
        'city': instance.city,
        'address': instance.address,
        'latitude': instance.latitude,
        'longitude': instance.longitude,
    }


class SalonSerializer(serializers.ModelSerializer):
    location = serializers.SerializerMethodField()

    class Meta:
        model = Salon
        fields = ('id', 'name', 'business_type', 'audience', 'business_phone',
                  'location')
        read_only_fields = fields

    def get_location(self, salon: Salon) -> dict:
        return _location_of(salon)


# --------------------------------------------------------------------------
# Registration
# --------------------------------------------------------------------------


class BaseRegistrationSerializer(serializers.Serializer):
    """Everything a new account needs whatever its role.

    A phone that already belongs to a verified account is refused. One that
    belongs to an abandoned, never-verified registration is taken over rather
    than left to block the number forever.
    """

    role: str = Role.CUSTOMER

    phone = serializers.CharField(max_length=20)
    name = serializers.CharField(max_length=80, min_length=2)
    email = serializers.EmailField(required=False, allow_blank=True, default='')
    password = serializers.CharField(write_only=True, max_length=128)
    accepted_terms = serializers.BooleanField()
    location = LocationSerializer(required=False)

    def validate_phone(self, value: str) -> str:
        phone = _normalized(value)
        existing = User.objects.filter(phone=phone).first()
        if existing is not None and existing.is_phone_verified:
            raise Conflict(
                'An account with this number already exists. Sign in instead.',
                code='phone_taken',
            )
        return phone

    def validate_accepted_terms(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError(
                [serializers.ErrorDetail('Accept the terms to create an account.',
                                         code='terms_required')]
            )
        return value

    def validate_password(self, value: str) -> str:
        return _check_password_policy(value)

    # --- creation ---------------------------------------------------------

    def build_profile(self, user: User) -> None:
        """Role-specific half of the sign-up. Subclasses fill this in."""

    @transaction.atomic
    def create(self, validated_data: dict) -> User:
        phone = validated_data['phone']
        location = validated_data.get('location') or {}

        user = User.objects.filter(phone=phone).first()
        if user is None:
            user = User(phone=phone)
        user.name = validated_data['name'].strip()
        user.email = (validated_data.get('email') or '').strip()
        user.role = self.role
        user.is_phone_verified = False
        user.is_active = True
        user.terms_accepted_at = timezone.now()
        if user.role == Role.CUSTOMER and not user.pk:
            user.try_on_credits = starting_credits()
        user.set_password(validated_data['password'])
        user.save()

        self.location = location
        self.build_profile(user)
        return user

    def location_fields(self) -> dict:
        location = getattr(self, 'location', None) or {}
        return {
            'area': location.get('area') or '',
            'city': location.get('city') or '',
            'address': location.get('address') or '',
            'latitude': location.get('latitude'),
            'longitude': location.get('longitude'),
        }


class CustomerRegistrationSerializer(BaseRegistrationSerializer):
    role = Role.CUSTOMER

    gender = serializers.ChoiceField(choices=CustomerProfile.Gender.choices,
                                     required=False, allow_blank=True, default='')
    hair_type = serializers.ChoiceField(choices=CustomerProfile.HairType.choices,
                                        required=False, allow_blank=True, default='')
    hair_length = serializers.ChoiceField(choices=CustomerProfile.HairLength.choices,
                                          required=False, allow_blank=True, default='')

    def build_profile(self, user: User) -> None:
        data = self.validated_data
        CustomerProfile.objects.update_or_create(
            user=user,
            defaults={
                'gender': data.get('gender') or '',
                'hair_type': data.get('hair_type') or '',
                'hair_length': data.get('hair_length') or '',
                **self.location_fields(),
            },
        )


class BarberRegistrationSerializer(BaseRegistrationSerializer):
    """A barber or hairstylist working for themselves.

    `audience` is the whole of the difference between a gents barber and a
    women's hairstylist — one role, asked who their clients are.
    """

    role = Role.BARBER

    audience = serializers.ChoiceField(choices=Audience.choices)
    business_name = serializers.CharField(max_length=60, required=False,
                                          allow_blank=True, default='')
    experience_years = serializers.IntegerField(min_value=0, max_value=60)
    service_ids = serializers.ListField(
        child=serializers.CharField(max_length=40), allow_empty=False, max_length=40
    )

    def build_profile(self, user: User) -> None:
        data = self.validated_data
        BarberProfile.objects.update_or_create(
            user=user,
            defaults={
                'audience': data['audience'],
                'business_name': (data.get('business_name') or '').strip(),
                'experience_years': data['experience_years'],
                'service_ids': data['service_ids'],
                **self.location_fields(),
            },
        )


class SalonOwnerRegistrationSerializer(BaseRegistrationSerializer):
    """Whoever runs the place. A gents salon, a women's parlour and a unisex
    salon are one role, told apart by `business_type` and `audience`."""

    role = Role.SALON_OWNER

    business_name = serializers.CharField(max_length=60, min_length=2)
    business_type = serializers.ChoiceField(choices=BusinessType.choices)
    audience = serializers.ChoiceField(choices=Audience.choices)
    address = serializers.CharField(max_length=160, min_length=6)
    business_phone = serializers.CharField(max_length=20, required=False,
                                           allow_blank=True, default='')

    def validate_business_phone(self, value: str) -> str:
        return _normalized(value) if value.strip() else ''

    def build_profile(self, user: User) -> None:
        data = self.validated_data
        location = self.location_fields()
        location['address'] = data['address'].strip() or location['address']
        salon, _ = Salon.objects.update_or_create(
            owner=user,
            name=data['business_name'].strip(),
            defaults={
                'business_type': data['business_type'],
                'audience': data['audience'],
                'business_phone': data.get('business_phone') or '',
                **location,
            },
        )
        return salon


# --------------------------------------------------------------------------
# Signing in
# --------------------------------------------------------------------------


class LoginSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True, max_length=128)

    def validate(self, attrs: dict) -> dict:
        phone = _normalized(attrs['phone'])
        user = User.objects.filter(phone=phone).first()

        # The password is checked before anything else is said about the
        # account, so this endpoint cannot be used to find out who has one.
        if user is None or not user.check_password(attrs['password']):
            raise AuthenticationFailed('That number and password do not match.',
                                       code='invalid_credentials')
        if not user.is_active:
            raise AuthenticationFailed('This account has been disabled.', code='account_disabled')
        if not user.is_phone_verified:
            raise PhoneNotVerified()

        attrs['user'] = user
        return attrs


class OTPRequestSerializer(serializers.Serializer):
    """Asking for a code. Used by registration verification and by an employee
    proving the number their owner registered for them."""

    phone = serializers.CharField(max_length=20)
    purpose = serializers.ChoiceField(choices=OTPPurpose.choices,
                                      default=OTPPurpose.REGISTRATION)

    def validate_phone(self, value: str) -> str:
        return _normalized(value)


class OTPVerifySerializer(OTPRequestSerializer):
    code = serializers.CharField(min_length=4, max_length=10)


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------


class ForgotPasswordSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)

    def validate_phone(self, value: str) -> str:
        return _normalized(value)


class VerifyResetOTPSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    code = serializers.CharField(min_length=4, max_length=10)

    def validate_phone(self, value: str) -> str:
        return _normalized(value)


class ResetPasswordSerializer(serializers.Serializer):
    """The second half of a reset. The token is what proves the code was
    entered correctly a moment ago, so the code itself is never replayed."""

    reset_token = serializers.CharField(max_length=512)
    password = serializers.CharField(write_only=True, max_length=128)
    confirm_password = serializers.CharField(write_only=True, max_length=128, required=False)

    def validate(self, attrs: dict) -> dict:
        confirm = attrs.get('confirm_password')
        if confirm is not None and confirm != attrs['password']:
            raise serializers.ValidationError(
                {'confirm_password': [serializers.ErrorDetail(
                    'The two passwords do not match.', code='password_mismatch')]}
            )
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, max_length=128)
    new_password = serializers.CharField(write_only=True, max_length=128)
    confirm_password = serializers.CharField(write_only=True, max_length=128, required=False)

    def validate_current_password(self, value: str) -> str:
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError(
                [serializers.ErrorDetail('That is not your current password.',
                                         code='invalid_password')]
            )
        return value

    def validate(self, attrs: dict) -> dict:
        confirm = attrs.get('confirm_password')
        if confirm is not None and confirm != attrs['new_password']:
            raise serializers.ValidationError(
                {'confirm_password': [serializers.ErrorDetail(
                    'The two passwords do not match.', code='password_mismatch')]}
            )
        _check_password_policy(attrs['new_password'], self.context['request'].user)
        return attrs


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(max_length=1024)


# --------------------------------------------------------------------------
# The owner's employees
# --------------------------------------------------------------------------


class EmployeeUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'name', 'phone', 'role', 'is_phone_verified')
        read_only_fields = fields


class SalonEmployeeSerializer(serializers.ModelSerializer):
    user = EmployeeUserSerializer(read_only=True)
    salon_name = serializers.CharField(source='salon.name', read_only=True)
    #: The person's own trade record — their avatar, what they specialise in,
    #: how long they have been doing it. Either of them may write it.
    profile = serializers.SerializerMethodField()
    has_own_schedule = serializers.SerializerMethodField()
    service_ids = serializers.SerializerMethodField()

    class Meta:
        model = SalonEmployee
        fields = ('id', 'user', 'salon', 'salon_name', 'title', 'commission_rate',
                  'is_active', 'profile', 'has_own_schedule',
                  'service_ids', 'created_at')
        read_only_fields = fields

    def get_profile(self, employment: SalonEmployee) -> dict | None:
        profile = getattr(employment.user, 'barber_profile', None)
        if profile is None:
            return None
        return {
            'avatar': profile.avatar,
            'bio': profile.bio,
            'specialties': profile.specialties,
            'experience_years': profile.experience_years,
            'experience_range': profile.experience_range,
            'audience': profile.audience,
        }

    def get_has_own_schedule(self, employment: SalonEmployee) -> bool:
        """False means this chair is simply keeping the salon's hours."""
        return employment.working_days.exists()

    def get_service_ids(self, employment: SalonEmployee) -> list[int]:
        """The services this chair has been named on. An empty list here does
        not mean "none" — a service that names nobody is open to everyone."""
        return list(employment.eligible_services.values_list('id', flat=True))


class SalonEmployeeCreateSerializer(serializers.Serializer):
    """An owner adding a chair.

    Two cases, one endpoint. A number nobody has gets a new account with the
    password the owner sets and hands over. A number that already belongs to a
    barber is attached to the salon — the same account, kept whole, with its
    barber profile intact so leaving gives it back.
    """

    phone = serializers.CharField(max_length=20)
    name = serializers.CharField(max_length=80, min_length=2, required=False)
    title = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')
    commission_rate = serializers.IntegerField(min_value=0, max_value=100, required=False)
    password = serializers.CharField(write_only=True, max_length=128, required=False)

    def validate_phone(self, value: str) -> str:
        return _normalized(value)

    def validate(self, attrs: dict) -> dict:
        existing = User.objects.filter(phone=attrs['phone']).first()

        if existing is None:
            missing = {}
            if not attrs.get('name'):
                missing['name'] = [serializers.ErrorDetail(
                    'Give the new employee a name.', code='required')]
            if not attrs.get('password'):
                missing['password'] = [serializers.ErrorDetail(
                    'Set an initial password to give them.', code='required')]
            if missing:
                raise serializers.ValidationError(missing)
            _check_password_policy(attrs['password'])
            attrs['existing'] = None
            return attrs

        if existing.role in {Role.SALON_OWNER, Role.ADMIN}:
            raise Conflict('That number belongs to an owner or administrator account.',
                           code='phone_not_available')
        if existing.role == Role.CUSTOMER:
            raise Conflict(
                'That number belongs to a customer account. Ask them to register as a '
                'barber first, or use another number.',
                code='phone_is_customer',
            )
        if existing.employments.filter(is_active=True).exists():
            raise Conflict('That person already works at a salon.', code='already_employed')

        attrs['existing'] = existing
        return attrs

    @transaction.atomic
    def create(self, validated_data: dict) -> SalonEmployee:
        salon: Salon = self.context['salon']
        existing: User | None = validated_data['existing']
        commission = validated_data.get('commission_rate') or 0

        if existing is None:
            user = User.objects.create_user(
                phone=validated_data['phone'],
                password=validated_data['password'],
                name=validated_data['name'].strip(),
                role=Role.SALON_EMPLOYEE,
                # The owner vouches for the person; the phone is still theirs
                # to prove, which they do with a code on first sign-in.
                is_phone_verified=False,
            )
            # Every professional keeps one of these, employee or not. Making
            # it now means the bio and photograph they add later have a home,
            # and that leaving the salon hands them a working barber account.
            BarberProfile.objects.get_or_create(
                user=user,
                defaults={
                    'audience': salon.audience,
                    'title': validated_data.get('title') or '',
                    'area': salon.area,
                    'city': salon.city,
                },
            )
        else:
            user = existing
            user.role = Role.SALON_EMPLOYEE
            user.save(update_fields=['role', 'updated_at'])

        employment, _ = SalonEmployee.objects.update_or_create(
            salon=salon,
            user=user,
            defaults={
                'title': validated_data.get('title') or '',
                'commission_rate': commission,
                'is_active': True,
                'ended_at': None,
            },
        )
        return employment


# --------------------------------------------------------------------------
# Profiles
#
# One endpoint, `/api/profile/me/`, four shapes. Each role edits its own
# record and nothing else: the serializer a request is validated against is
# chosen from `request.user.role`, never from anything the caller sends.
# --------------------------------------------------------------------------


from Apps.common.text import StringListField  # noqa: E402
from Apps.services.models import ServiceCategory  # noqa: E402

from .models import (  # noqa: E402
    ExperienceRange,
)


class LocationWriteSerializer(serializers.Serializer):
    """A place, as a PATCH sends it. Every field optional — moving the pin
    should not mean re-sending the street."""

    area = serializers.CharField(max_length=60, required=False, allow_blank=True)
    city = serializers.CharField(max_length=60, required=False, allow_blank=True)
    address = serializers.CharField(max_length=160, required=False, allow_blank=True)
    latitude = serializers.FloatField(required=False, allow_null=True,
                                      min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=False, allow_null=True,
                                       min_value=-180, max_value=180)


class ImageRefSerializerField(serializers.CharField):
    """A picture: a data URL, an https link, or an icon name."""

    def __init__(self, **kwargs):
        kwargs.setdefault('required', False)
        kwargs.setdefault('allow_blank', True)
        kwargs.setdefault('trim_whitespace', False)
        kwargs.setdefault('max_length', MAX_IMAGE_CHARS)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            validate_image_ref(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(
                [serializers.ErrorDetail(error.messages[0],
                                         code=getattr(error, 'code', 'image_invalid'))]
            ) from error
        return value


class AccountSerializer(serializers.ModelSerializer):
    """The account half of a profile — the same for every role."""

    class Meta:
        model = User
        fields = ('id', 'phone', 'name', 'email', 'role', 'is_phone_verified',
                  'try_on_credits', 'date_joined')
        read_only_fields = fields


class BaseProfileWriteSerializer(serializers.Serializer):
    """What every role may change about itself: their name, their email and —
    for those who have a place — where they are.

    The phone number is not here. It is the username and the thing an OTP
    proved; changing it is a different, verified flow, not a profile edit.
    """

    name = serializers.CharField(max_length=80, min_length=2, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    location = LocationWriteSerializer(required=False)

    #: The model that carries `location` for this role, if any.
    location_target = None

    def account_fields(self) -> dict:
        data = self.validated_data
        fields = {}
        if 'name' in data:
            fields['name'] = data['name'].strip()
        if 'email' in data:
            fields['email'] = (data['email'] or '').strip()
        return fields

    def apply_location(self, instance) -> list[str]:
        """Writes whichever location keys were sent. Returns what changed."""
        location = self.validated_data.get('location')
        if location is None or instance is None:
            return []
        changed = []
        for field in ('area', 'city', 'address', 'latitude', 'longitude'):
            if field in location:
                setattr(instance, field, location[field])
                changed.append(field)
        return changed

    def save_account(self, user: User) -> None:
        fields = self.account_fields()
        if not fields:
            return
        for field, value in fields.items():
            setattr(user, field, value)
        user.save(update_fields=[*fields, 'updated_at'])


class CustomerProfileWriteSerializer(BaseProfileWriteSerializer):
    avatar = ImageRefSerializerField()
    gender = serializers.ChoiceField(choices=CustomerProfile.Gender.choices,
                                     required=False, allow_blank=True)
    hair_type = serializers.ChoiceField(choices=CustomerProfile.HairType.choices,
                                        required=False, allow_blank=True)
    hair_length = serializers.ChoiceField(choices=CustomerProfile.HairLength.choices,
                                          required=False, allow_blank=True)

    PROFILE_FIELDS = ('avatar', 'gender', 'hair_type', 'hair_length')

    @transaction.atomic
    def save(self, **kwargs) -> User:
        user: User = self.context['request'].user
        self.save_account(user)
        profile, _ = CustomerProfile.objects.get_or_create(user=user)
        changed = [f for f in self.PROFILE_FIELDS if f in self.validated_data]
        for field in changed:
            setattr(profile, field, self.validated_data[field])
        changed += self.apply_location(profile)
        if changed:
            profile.save(update_fields=changed)
        return user


class BarberProfileWriteSerializer(BaseProfileWriteSerializer):
    """A barber or hairstylist editing their own trade.

    A salon employee uses the same record — see `EmployeeProfileWriteSerializer`,
    which is this with the fields their salon owns taken away.
    """

    avatar = ImageRefSerializerField()
    cover_image = ImageRefSerializerField()
    business_name = serializers.CharField(max_length=60, required=False, allow_blank=True)
    title = serializers.CharField(max_length=40, required=False, allow_blank=True)
    bio = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    audience = serializers.ChoiceField(choices=Audience.choices, required=False)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=ServiceCategory.objects.all(), source='category',
        required=False, allow_null=True,
    )
    experience_years = serializers.IntegerField(min_value=0, max_value=70, required=False)
    specialties = StringListField(max_length=12, item_max_length=40)
    contact_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True)
    instagram = serializers.CharField(max_length=60, required=False, allow_blank=True)
    facebook = serializers.CharField(max_length=60, required=False, allow_blank=True)
    tiktok = serializers.CharField(max_length=60, required=False, allow_blank=True)
    accepting_clients = serializers.BooleanField(required=False)
    #: How this barber takes bookings. The same two settings a salon has, so
    #: the booking rules read one shape whichever kind of business it is.
    auto_accept = serializers.BooleanField(required=False)
    cancellation_window_hours = serializers.IntegerField(
        min_value=0, max_value=168, required=False
    )

    #: Everything a self-employed barber may set on their own record.
    PROFILE_FIELDS = (
        'avatar', 'cover_image', 'business_name', 'title', 'bio', 'audience',
        'category', 'experience_years', 'specialties', 'contact_phone',
        'contact_email', 'instagram', 'facebook', 'tiktok', 'accepting_clients',
        'auto_accept', 'cancellation_window_hours',
    )
    #: What an employee may not touch: their salon decides these.
    EMPLOYER_OWNED = ()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # An employee may not even offer a value for what their salon owns:
        # the field is removed, so sending one is an unknown key rather than
        # a silent no-op.
        for field in self.EMPLOYER_OWNED:
            self.fields.pop(field, None)

        # A heading has to be one this account can actually use — the shared
        # catalogue, or one it invented. Without this narrowing any id would
        # do, and a profile could be filed under a stranger's private category.
        request = self.context.get('request')
        if request is not None and 'category_id' in self.fields:
            self.fields['category_id'].queryset = ServiceCategory.objects.filter(
                is_active=True
            ).filter(Q(owner__isnull=True) | Q(owner=request.user))

    def validate_contact_phone(self, value: str) -> str:
        return _normalized(value) if value.strip() else ''

    @transaction.atomic
    def save(self, **kwargs) -> User:
        user: User = self.context['request'].user
        self.save_account(user)
        profile, _ = BarberProfile.objects.get_or_create(user=user)
        writable = set(self.PROFILE_FIELDS) - set(self.EMPLOYER_OWNED)
        changed = [f for f in writable if f in self.validated_data]
        for field in changed:
            setattr(profile, field, self.validated_data[field])
        changed += self.apply_location(profile)
        if changed:
            # `experience_range` is recomputed on every save, so it goes along
            # whatever else changed.
            profile.save()
        return user


class EmployeeProfileWriteSerializer(BarberProfileWriteSerializer):
    """A salon employee editing themselves.

    Bio, avatar, specialties, experience and what they call their job are
    theirs. The trading name, who the salon serves and whether it is taking
    clients belong to the owner, so those fields are not even accepted.
    """

    #: An employee runs no business of their own, so how bookings are accepted
    #: and how late they can be cancelled are not theirs to set.
    EMPLOYER_OWNED = (
        'business_name', 'audience', 'accepting_clients', 'cover_image',
        'auto_accept', 'cancellation_window_hours',
    )

    #: Their job title lives on the employment, not on the barber profile:
    #: it is a fact about this chair at this salon.
    title = serializers.CharField(max_length=40, required=False, allow_blank=True)

    @transaction.atomic
    def save(self, **kwargs) -> User:
        user = super().save(**kwargs)
        if 'title' in self.validated_data:
            employment = active_employment(user)
            if employment is not None:
                employment.title = self.validated_data['title'].strip()
                employment.save(update_fields=['title', 'updated_at'])
        return user


class SalonWriteSerializer(BaseProfileWriteSerializer):
    """An owner editing their salon. `name` is the owner's own name;
    `business_name` is the shop's."""

    business_name = serializers.CharField(max_length=60, min_length=2, required=False)
    tagline = serializers.CharField(max_length=120, required=False, allow_blank=True)
    bio = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    avatar = ImageRefSerializerField()
    cover_image = ImageRefSerializerField()
    business_type = serializers.ChoiceField(choices=BusinessType.choices, required=False)
    audience = serializers.ChoiceField(choices=Audience.choices, required=False)
    business_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True)
    amenities = StringListField(max_length=20, item_max_length=40)
    women_only = serializers.BooleanField(required=False)
    private_booth = serializers.BooleanField(required=False)
    auto_accept = serializers.BooleanField(required=False)
    #: Hours before an appointment that a customer may still cancel online.
    cancellation_window_hours = serializers.IntegerField(
        min_value=0, max_value=168, required=False
    )

    SALON_FIELDS = (
        'tagline', 'bio', 'avatar', 'cover_image', 'business_type', 'audience',
        'business_phone', 'contact_email', 'amenities', 'women_only',
        'private_booth', 'auto_accept', 'cancellation_window_hours',
    )

    def validate_business_phone(self, value: str) -> str:
        return _normalized(value) if value.strip() else ''

    @transaction.atomic
    def save(self, **kwargs) -> User:
        user: User = self.context['request'].user
        self.save_account(user)
        salon = user.salons.first()
        if salon is None:
            raise Conflict('Register your salon before editing it.', code='no_salon')

        changed = [f for f in self.SALON_FIELDS if f in self.validated_data]
        for field in changed:
            setattr(salon, field, self.validated_data[field])
        if 'business_name' in self.validated_data:
            salon.name = self.validated_data['business_name'].strip()
            changed.append('name')
        changed += self.apply_location(salon)
        if changed:
            salon.save(update_fields=[*set(changed), 'updated_at'])
        return user


def active_employment(user: User):
    return user.employments.filter(is_active=True).select_related('salon').first()


class SalonEmployeeUpdateSerializer(serializers.ModelSerializer):
    """What an owner may change about a chair.

    Two records behind one form. The job, the split and whether the chair is
    taking bookings are the employment's. The card a customer reads — the
    name, the photograph, the bio, the specialties, the years — belongs to
    the person, and the owner may set it too: they made the account, it
    starts empty, and the person is not always there to fill it in.

    It stays the person's as well. Nothing here is locked to the owner, so
    whichever of them writes last is what stands.
    """

    name = serializers.CharField(max_length=60, required=False)
    avatar = ImageRefSerializerField(required=False, allow_blank=True)
    bio = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    specialties = StringListField(max_length=12, item_max_length=40)
    experience_years = serializers.IntegerField(min_value=0, max_value=70,
                                                required=False)

    #: Kept on the person's own trade record rather than on the employment.
    PERSON_FIELDS = ('avatar', 'bio', 'specialties', 'experience_years')

    class Meta:
        model = SalonEmployee
        fields = ('title', 'commission_rate', 'is_active', 'name',
                  'avatar', 'bio', 'specialties', 'experience_years')
        extra_kwargs = {
            field: {'required': False}
            for field in ('title', 'commission_rate', 'is_active')
        }

    def validate_title(self, value: str) -> str:
        return value.strip()

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError('A name cannot be blank.')
        return name

    @transaction.atomic
    def update(self, instance: SalonEmployee, validated_data: dict) -> SalonEmployee:
        person = {
            field: validated_data.pop(field)
            for field in ('name', *self.PERSON_FIELDS)
            if field in validated_data
        }
        employment = super().update(instance, validated_data)

        name = person.pop('name', None)
        if name is not None and name != employment.user.name:
            employment.user.name = name
            employment.user.save(update_fields=['name', 'updated_at'])

        if person:
            profile, _ = BarberProfile.objects.get_or_create(user=employment.user)
            for field, value in person.items():
                setattr(profile, field, value)
            # `experience_range` is recomputed on save, so it follows whatever
            # else changed here.
            profile.save()
        return employment


#: Which serializer validates a PATCH, chosen by the caller's own role.
PROFILE_WRITERS = {
    Role.CUSTOMER: CustomerProfileWriteSerializer,
    Role.BARBER: BarberProfileWriteSerializer,
    Role.SALON_OWNER: SalonWriteSerializer,
    Role.SALON_EMPLOYEE: EmployeeProfileWriteSerializer,
}


# --- Reading a profile back ------------------------------------------------


class CustomerProfileReadSerializer(serializers.ModelSerializer):
    location = serializers.SerializerMethodField()

    class Meta:
        model = CustomerProfile
        fields = ('avatar', 'gender', 'hair_type', 'hair_length', 'location')
        read_only_fields = fields

    def get_location(self, profile) -> dict:
        return _location_of(profile)


class BarberProfileReadSerializer(serializers.ModelSerializer):
    location = serializers.SerializerMethodField()
    category_id = serializers.IntegerField(source='category.id', read_only=True,
                                           allow_null=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True,
                                          allow_null=True, default=None)
    display_name = serializers.CharField(read_only=True)
    gallery = serializers.SerializerMethodField()

    class Meta:
        model = BarberProfile
        fields = ('audience', 'business_name', 'display_name', 'title', 'bio',
                  'avatar', 'cover_image', 'category_id', 'category_name',
                  'experience_years', 'experience_range', 'specialties',
                  'contact_phone', 'contact_email', 'instagram', 'facebook',
                  'tiktok', 'accepting_clients', 'auto_accept',
                  'cancellation_window_hours', 'service_ids', 'location',
                  'gallery')
        read_only_fields = fields

    def get_location(self, profile) -> dict:
        return _location_of(profile)

    def get_gallery(self, profile) -> list:
        from Apps.portfolio.serializers import GalleryImageSerializer

        return GalleryImageSerializer(profile.gallery.all(), many=True).data


class SalonReadSerializer(serializers.ModelSerializer):
    location = serializers.SerializerMethodField()
    gallery = serializers.SerializerMethodField()
    employee_count = serializers.SerializerMethodField()

    class Meta:
        model = Salon
        fields = ('id', 'name', 'business_type', 'audience', 'tagline', 'bio',
                  'avatar', 'cover_image', 'business_phone', 'contact_email',
                  'verification', 'amenities', 'women_only',
                  'private_booth', 'auto_accept', 'cancellation_window_hours',
                  'location', 'gallery', 'employee_count', 'created_at')
        read_only_fields = fields

    def get_location(self, salon) -> dict:
        return _location_of(salon)

    def get_gallery(self, salon) -> list:
        from Apps.portfolio.serializers import GalleryImageSerializer

        return GalleryImageSerializer(salon.gallery.all(), many=True).data

    def get_employee_count(self, salon) -> int:
        return salon.employees.filter(is_active=True).count()


class EmploymentReadSerializer(serializers.ModelSerializer):
    salon_name = serializers.CharField(source='salon.name', read_only=True)
    salon_audience = serializers.CharField(source='salon.audience', read_only=True)

    class Meta:
        model = SalonEmployee
        fields = ('id', 'salon', 'salon_name', 'salon_audience', 'title',
                  'commission_rate', 'is_active', 'created_at')
        read_only_fields = fields


def profile_payload(user: User) -> dict:
    """Everything the app needs to draw whoever is signed in.

    One shape for all four roles, with the parts that do not apply left null,
    so the client has one call and one branch rather than four endpoints.
    """
    payload: dict = {
        'role': user.role,
        'account': AccountSerializer(user).data,
        'customer': None,
        'barber': None,
        'salon': None,
        'employment': None,
    }

    customer = getattr(user, 'customer_profile', None)
    if customer is not None:
        payload['customer'] = CustomerProfileReadSerializer(customer).data

    barber = getattr(user, 'barber_profile', None)
    if barber is not None:
        payload['barber'] = BarberProfileReadSerializer(barber).data

    if user.role == Role.SALON_OWNER:
        salon = user.salons.first()
        if salon is not None:
            payload['salon'] = SalonReadSerializer(salon).data

    employment = active_employment(user)
    if employment is not None:
        payload['employment'] = EmploymentReadSerializer(employment).data
        # An employee needs their salon's shopfront to render their own
        # screens, but they do not own it — so it is read-only detail here.
        payload['salon'] = SalonReadSerializer(employment.salon).data

    return payload
