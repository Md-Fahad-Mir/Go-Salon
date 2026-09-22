"""The account model and everything that proves someone owns it.

One user table. A row is identified by its phone number, carries exactly one
role, and is only allowed to sign in once that phone has been proved with a
one-time code. Role-specific detail lives in the small profile models at the
bottom rather than as nullable columns on the account itself.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from Apps.common.images import ImageRefField

from .phone import normalize_phone


class Role(models.TextChoices):
    """The five roles. A women's hairstylist is a BARBER whose clients are
    women, and a parlour is a salon whose customers are women — variations
    inside a role, never roles of their own."""

    CUSTOMER = 'customer', 'Customer'
    BARBER = 'barber', 'Barber / Hairstylist'
    SALON_OWNER = 'salon_owner', 'Salon / Parlor Owner'
    SALON_EMPLOYEE = 'salon_employee', 'Salon / Parlor Employee'
    ADMIN = 'admin', 'Admin'


#: The roles someone can sign themselves up as. An employee's account is made
#: by the owner who hires them; an admin's is made from the command line.
PUBLIC_REGISTRATION_ROLES = frozenset({Role.CUSTOMER, Role.BARBER, Role.SALON_OWNER})

#: Roles that run a business rather than book one.
PROVIDER_ROLES = frozenset({Role.BARBER, Role.SALON_OWNER, Role.SALON_EMPLOYEE})


class Audience(models.TextChoices):
    """Who a professional serves. This is what tells a gents barber apart from
    a women's hairstylist without giving either its own role."""

    MEN = 'men', "Men's hair"
    WOMEN = 'women', "Women's hair"
    UNISEX = 'unisex', 'Everyone'


class BusinessType(models.TextChoices):
    SALON = 'salon', 'Salon'
    BARBER = 'barber', 'Barbershop'


class ExperienceRange(models.TextChoices):
    """How long someone has been doing this, as a band rather than a number.

    Customers read "5-10 years"; nobody is counting months. The exact figure
    stays in `experience_years` for the professional's own record."""

    UNDER_1 = 'under_1', 'Less than a year'
    ONE_TO_THREE = '1_3', '1-3 years'
    THREE_TO_FIVE = '3_5', '3-5 years'
    FIVE_TO_TEN = '5_10', '5-10 years'
    TEN_PLUS = '10_plus', '10 years or more'

    @classmethod
    def from_years(cls, years: int) -> str:
        if years < 1:
            return cls.UNDER_1
        if years < 3:
            return cls.ONE_TO_THREE
        if years < 5:
            return cls.THREE_TO_FIVE
        if years < 10:
            return cls.FIVE_TO_TEN
        return cls.TEN_PLUS


#: How long before an appointment a customer may still call it off themselves.
#: Past that they ring the salon — a chair held for them is a slot nobody else
#: could take, and a person deserves to be told.
DEFAULT_CANCELLATION_WINDOW_HOURS = 2



class VerificationStage(models.TextChoices):
    """Whether a salon has been checked over, as the owner sees it.

    Set by a reviewer from the admin site; there is no self-service route
    into the queue. The app used to open one by asking for a trade licence
    number, which was dropped — a number typed into a box was never a
    check, and keeping somebody's licence on file for no purpose is not
    free.
    """

    UNVERIFIED = 'unverified', 'Not reviewed'
    PENDING = 'pending', 'Under review'
    VERIFIED = 'verified', 'Verified'
    REJECTED = 'rejected', 'Rejected'


#: A barber shows at most this many pictures of their work. Six fills the grid
#: on a phone; more is a portfolio, which is a different screen.
MAX_BARBER_GALLERY = 6
#: A salon has a shopfront to show, so it gets more room than one pair of hands.
MAX_SALON_GALLERY = 12


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, phone: str, password: str | None, **extra):
        if not phone:
            raise ValueError('A phone number is required.')
        user = self.model(phone=normalize_phone(phone), **extra)
        # set_password(None) leaves an unusable hash, which is what an account
        # that cannot be signed into should have.
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, phone: str, password: str | None = None, **extra):
        extra.setdefault('role', Role.CUSTOMER)
        extra.setdefault('is_staff', False)
        extra.setdefault('is_superuser', False)
        return self._create_user(phone, password, **extra)

    def create_superuser(self, phone: str, password: str | None = None, **extra):
        extra.setdefault('role', Role.ADMIN)
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        # Nobody texts a code to the person running `createsuperuser`.
        extra.setdefault('is_phone_verified', True)
        if extra['is_staff'] is not True:
            raise ValueError('A superuser must have is_staff=True.')
        if extra['is_superuser'] is not True:
            raise ValueError('A superuser must have is_superuser=True.')
        return self._create_user(phone, password, **extra)

    def get_by_natural_key(self, username: str):
        return self.get(phone=normalize_phone(username))


class User(AbstractBaseUser, PermissionsMixin):
    """An account. The phone number is the username."""

    phone = models.CharField(max_length=16, unique=True, db_index=True)
    name = models.CharField(max_length=80)
    # Not unique: a salon and its owner legitimately share a mailbox, and
    # nobody signs in with an email here.
    email = models.EmailField(blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER, db_index=True)

    #: Set by a verified one-time code. Without it there is no signing in.
    is_phone_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    #: AI try-on credits. Part of the account the frontend reads on sign-in.
    try_on_credits = models.PositiveIntegerField(default=0)

    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    date_joined = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'phone'
    REQUIRED_FIELDS = ['name']

    class Meta:
        ordering = ('-date_joined',)

    def __str__(self) -> str:
        return f'{self.name} <{self.phone}> ({self.role})'

    def clean(self):
        super().clean()
        self.phone = normalize_phone(self.phone)

    def save(self, *args, **kwargs):
        self.phone = normalize_phone(self.phone)
        super().save(*args, **kwargs)

    # --- Role helpers. Read by the permission classes and the serializers. ---

    @property
    def is_customer(self) -> bool:
        return self.role == Role.CUSTOMER

    @property
    def is_barber(self) -> bool:
        return self.role == Role.BARBER

    @property
    def is_salon_owner(self) -> bool:
        return self.role == Role.SALON_OWNER

    @property
    def is_salon_employee(self) -> bool:
        return self.role == Role.SALON_EMPLOYEE

    @property
    def is_admin(self) -> bool:
        return self.role == Role.ADMIN or self.is_superuser

    @property
    def is_provider(self) -> bool:
        return self.role in PROVIDER_ROLES

    @property
    def can_sign_in(self) -> bool:
        return self.is_active and self.is_phone_verified


class LocationMixin(models.Model):
    """Where something is. Shared by the profiles and the salon so the app has
    one shape for a place."""

    area = models.CharField(max_length=60, blank=True)
    city = models.CharField(max_length=60, blank=True)
    address = models.CharField(max_length=160, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    class Meta:
        abstract = True


class CustomerProfile(LocationMixin):
    """What a customer told us at sign-up: it decides which salons and styles
    they are shown."""

    class Gender(models.TextChoices):
        MALE = 'male', 'Male'
        FEMALE = 'female', 'Female'

    class HairType(models.TextChoices):
        STRAIGHT = 'straight', 'Straight'
        WAVY = 'wavy', 'Wavy'
        CURLY = 'curly', 'Curly'
        COILY = 'coily', 'Coily'

    class HairLength(models.TextChoices):
        SHORT = 'short', 'Short'
        MEDIUM = 'medium', 'Medium'
        LONG = 'long', 'Long'

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='customer_profile')
    avatar = ImageRefField()
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    hair_type = models.CharField(max_length=10, choices=HairType.choices, blank=True)
    hair_length = models.CharField(max_length=10, choices=HairLength.choices, blank=True)

    def __str__(self) -> str:
        return f'Customer profile for {self.user.phone}'


class BarberProfile(LocationMixin):
    """A barber or hairstylist working for themselves.

    Kept when the barber is later hired by a salon, so their trade does not
    disappear with a change of employer and comes back if they leave.
    """

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='barber_profile')
    #: Men's hair, women's hair or both. The whole of the "female barber"
    #: distinction, held as a field rather than as a second role.
    audience = models.CharField(max_length=10, choices=Audience.choices, default=Audience.UNISEX)
    #: Trading name customers see. Blank means their own name.
    business_name = models.CharField(max_length=60, blank=True)
    #: What they call themselves — "Senior Barber", "Colour Specialist".
    title = models.CharField(max_length=40, blank=True)
    bio = models.TextField(max_length=1000, blank=True)
    avatar = ImageRefField()
    cover_image = ImageRefField()
    #: The heading their work sits under in the catalogue.
    category = models.ForeignKey(
        'services.ServiceCategory', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='barbers',
    )
    experience_years = models.PositiveSmallIntegerField(
        default=0, validators=[MaxValueValidator(70)]
    )
    #: The band shown to customers. Kept in step with `experience_years` on
    #: save so the two can never disagree.
    experience_range = models.CharField(
        max_length=10, choices=ExperienceRange.choices, default=ExperienceRange.UNDER_1
    )
    specialties = models.JSONField(default=list, blank=True)
    #: How customers reach them. Blank falls back to the account's own phone.
    contact_phone = models.CharField(max_length=16, blank=True)
    contact_email = models.EmailField(blank=True)
    instagram = models.CharField(max_length=60, blank=True)
    facebook = models.CharField(max_length=60, blank=True)
    tiktok = models.CharField(max_length=60, blank=True)
    #: Off means the chair is closed to new bookings without being deleted.
    accepting_clients = models.BooleanField(default=True)
    #: Take bookings without approving each one by hand.
    auto_accept = models.BooleanField(default=True)
    #: Hours before the appointment that a customer may still cancel online.
    cancellation_window_hours = models.PositiveSmallIntegerField(
        default=DEFAULT_CANCELLATION_WINDOW_HOURS,
        validators=[MaxValueValidator(168)],
    )
    #: Ids of the services they offer; priced later in the provider app.
    service_ids = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f'Barber profile for {self.user.phone}'

    @property
    def display_name(self) -> str:
        return self.business_name or self.user.name

    def save(self, *args, **kwargs):
        # One source of truth: the band always follows the number, so editing
        # either one through the API leaves a consistent pair behind.
        self.experience_range = ExperienceRange.from_years(self.experience_years or 0)
        super().save(*args, **kwargs)


class Salon(LocationMixin):
    """A salon, barbershop or beauty parlour, and the owner who runs it.

    `business_type` + `audience` is what makes one a gents salon and another a
    women's parlour — neither is a separate kind of account.
    """

    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='salons')
    name = models.CharField(max_length=60)
    business_type = models.CharField(max_length=10, choices=BusinessType.choices, default=BusinessType.SALON)
    audience = models.CharField(max_length=10, choices=Audience.choices, default=Audience.UNISEX)
    #: The one line customers read under the name.
    tagline = models.CharField(max_length=120, blank=True)
    bio = models.TextField(max_length=2000, blank=True)
    avatar = ImageRefField()
    cover_image = ImageRefField()
    business_phone = models.CharField(max_length=16, blank=True)
    contact_email = models.EmailField(blank=True)
    verification = models.CharField(
        max_length=12, choices=VerificationStage.choices, default=VerificationStage.UNVERIFIED
    )
    amenities = models.JSONField(default=list, blank=True)
    #: Women-only premises, and private booths for clients who want one. Both
    #: are things customers filter on in Dhaka, not decoration.
    women_only = models.BooleanField(default=False)
    private_booth = models.BooleanField(default=False)
    #: Take bookings without approving each one by hand.
    auto_accept = models.BooleanField(default=True)
    #: Hours before the appointment that a customer may still cancel online.
    #: The owner sets this; two hours is the default.
    cancellation_window_hours = models.PositiveSmallIntegerField(
        default=DEFAULT_CANCELLATION_WINDOW_HOURS,
        validators=[MaxValueValidator(168)],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('name',)

    def __str__(self) -> str:
        return self.name


class SalonEmployee(models.Model):
    """Someone's job at a salon.

    This is the only way an employee account comes into being: an owner adds a
    chair, either creating the account or attaching one that already exists.
    Employment is a record of its own, so a barber who is hired keeps the
    account — and the barber profile — they already had.
    """

    salon = models.ForeignKey(Salon, on_delete=models.CASCADE, related_name='employees')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='employments')
    #: The job, as printed on the price list. The owner sets it when they add
    #: the chair; the person sitting in it may correct it afterwards.
    title = models.CharField(max_length=40, blank=True)
    #: Share of each service that is theirs, 0-100.
    commission_rate = models.PositiveSmallIntegerField(
        default=0, validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-created_at',)
        constraints = [
            models.UniqueConstraint(fields=('salon', 'user'), name='unique_salon_employee'),
            # Nobody holds two chairs at once. Ended jobs are left in place as
            # history, so re-hiring reuses the row rather than duplicating it.
            models.UniqueConstraint(
                fields=('user',),
                condition=models.Q(is_active=True),
                name='unique_active_employment_per_user',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.user.phone} at {self.salon.name}'


class OTPPurpose(models.TextChoices):
    REGISTRATION = 'registration', 'Registration'
    PASSWORD_RESET = 'password_reset', 'Password reset'


class OTPCodeManager(models.Manager):
    def live(self, user: User, purpose: str):
        """Codes that could still be used: not spent, not superseded, not
        expired."""
        return self.filter(
            user=user,
            purpose=purpose,
            consumed_at__isnull=True,
            invalidated_at__isnull=True,
            expires_at__gt=timezone.now(),
        )


class OTPCode(models.Model):
    """A one-time code, stored as a hash.

    The plaintext exists for exactly as long as it takes to hand it to the SMS
    provider. A database copy would be a list of working credentials, so what
    is kept is a hash, checked the same way a password is.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='otp_codes')
    purpose = models.CharField(max_length=20, choices=OTPPurpose.choices)
    code_hash = models.CharField(max_length=128)
    debug_code = models.CharField(max_length=12, blank=True, editable=False)
    expires_at = models.DateTimeField()
    #: Set when the right code was entered. A spent code never works twice.
    consumed_at = models.DateTimeField(null=True, blank=True)
    #: Set when a newer code replaced this one, or too many guesses were made.
    invalidated_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OTPCodeManager()

    class Meta:
        ordering = ('-created_at',)
        indexes = [models.Index(fields=('user', 'purpose', '-created_at'))]

    def __str__(self) -> str:
        return f'{self.purpose} code for {self.user.phone}'

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_usable(self) -> bool:
        return self.consumed_at is None and self.invalidated_at is None and not self.is_expired

    def clean(self):
        if self.expires_at and self.expires_at <= self.created_at_or_now():
            raise ValidationError('An OTP cannot expire before it is created.')

    def created_at_or_now(self):
        return self.created_at or timezone.now()


def starting_credits() -> int:
    return getattr(settings, 'STARTING_TRY_ON_CREDITS', 0)
