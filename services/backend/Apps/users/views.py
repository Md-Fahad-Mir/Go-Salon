"""The authentication endpoints.

Registration hands back no session: the account exists but the phone is
unproved, so the caller is told to collect a code. Verifying that code is what
activates the account and issues the first pair of tokens.
"""

from __future__ import annotations

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from Apps.tenants.context import business_of_tenant, tenant_of_request
from Apps.tenants.permissions import OptionalTenantContext, TenantContext

from .exceptions import Conflict
from .models import OTPPurpose, Role, Salon, SalonEmployee, User
from .permissions import IsSalonOrParlorOwner
from .serializers import (
    PROFILE_WRITERS,
    BarberRegistrationSerializer,
    ChangePasswordSerializer,
    CustomerRegistrationSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    OTPRequestSerializer,
    OTPVerifySerializer,
    ResetPasswordSerializer,
    SalonEmployeeCreateSerializer,
    SalonEmployeeSerializer,
    SalonOwnerRegistrationSerializer,
    SalonEmployeeUpdateSerializer,
    UserSerializer,
    VerifyResetOTPSerializer,
    profile_payload,
)
from .services import otp as otp_service

RESET_SIGNER_SALT = 'users.password-reset'


class PublicAPIView(GenericAPIView):
    """A view anyone may call.

    It takes no credentials, but still names the scheme it would accept:
    without a WWW-Authenticate header DRF turns every 401 into a 403, and a
    client cannot tell "wrong password" from "not allowed here".
    """

    permission_classes = (AllowAny,)
    authentication_classes = ()

    def get_authenticate_header(self, request) -> str:
        return 'Bearer'


def issue_tokens(user: User) -> dict:
    """A fresh pair. The role rides along so the client can route on it without
    a second call; nothing else about the account is in the payload."""
    refresh = RefreshToken.for_user(user)
    refresh['role'] = user.role
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


def session_response(user: User, status_code: int = status.HTTP_200_OK) -> Response:
    return Response(
        {**issue_tokens(user), 'user': UserSerializer(user).data},
        status=status_code,
    )


def revoke_all_sessions(user: User) -> None:
    """Blacklist every refresh token the account has out. Used after a
    password changes, so a stolen session dies with the old password."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def verification_response(user: User) -> Response:
    return Response(
        {
            'detail': f'We sent a {settings.OTP_LENGTH}-digit code to {user.phone}.',
            'verification_required': True,
            'phone': user.phone,
            'purpose': OTPPurpose.REGISTRATION,
            'resend_in': otp_service.seconds_until_resend(user, OTPPurpose.REGISTRATION),
            'expires_in_minutes': settings.OTP_EXPIRATION_MINUTES,
            'user': UserSerializer(user).data,
        },
        status=status.HTTP_201_CREATED,
    )


# --------------------------------------------------------------------------
# Registration — customer, barber, owner. No employee, no admin.
# --------------------------------------------------------------------------


class BaseRegisterView(PublicAPIView):
    throttle_scope = 'register'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        # The account is real but unproved; the code decides whether it lives.
        otp_service.issue_otp(user, OTPPurpose.REGISTRATION, enforce_rate=False)
        return verification_response(user)


class CustomerRegisterView(BaseRegisterView):
    serializer_class = CustomerRegistrationSerializer


class BarberRegisterView(BaseRegisterView):
    serializer_class = BarberRegistrationSerializer


class SalonOwnerRegisterView(BaseRegisterView):
    serializer_class = SalonOwnerRegistrationSerializer


# --------------------------------------------------------------------------
# One-time codes
# --------------------------------------------------------------------------


class OTPRequestView(PublicAPIView):
    """Send a code. Registration verification and an employee proving the
    number their owner registered both come through here."""

    serializer_class = OTPRequestSerializer
    throttle_scope = 'otp'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data['phone']
        purpose = serializer.validated_data['purpose']
        user = User.objects.filter(phone=phone).first()

        if purpose == OTPPurpose.PASSWORD_RESET:
            # Never says whether the number has an account.
            if user is not None and user.is_active:
                otp_service.issue_otp(user, purpose)
            return Response(self._sent(user, purpose))

        if user is None:
            return Response(
                {'detail': 'No account uses that number.', 'code': 'account_not_found',
                 'errors': {}},
                status=status.HTTP_404_NOT_FOUND,
            )
        if user.is_phone_verified:
            return Response(
                {'detail': 'That number is already verified. Sign in instead.',
                 'code': 'already_verified', 'errors': {}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp_service.issue_otp(user, purpose)
        return Response(self._sent(user, purpose))

    def _sent(self, user: User | None, purpose: str) -> dict:
        return {
            'detail': f'If that number has an account, a {settings.OTP_LENGTH}-digit code is on its way.'
            if purpose == OTPPurpose.PASSWORD_RESET
            else f'We sent a {settings.OTP_LENGTH}-digit code to {user.phone}.',
            'purpose': purpose,
            'resend_in': otp_service.seconds_until_resend(user, purpose) if user else
            settings.OTP_RESEND_COOLDOWN_SECONDS,
            'expires_in_minutes': settings.OTP_EXPIRATION_MINUTES,
        }


class OTPResendView(OTPRequestView):
    """The same thing, named for what the client is doing. Asking again always
    retires the previous code and is subject to the cooldown."""


class OTPVerifyView(PublicAPIView):
    serializer_class = OTPVerifySerializer
    throttle_scope = 'otp'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data['purpose'] != OTPPurpose.REGISTRATION:
            return Response(
                {'detail': 'Use the password-reset endpoints for that code.',
                 'code': 'wrong_purpose', 'errors': {}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(phone=data['phone']).first()
        if user is None:
            return Response(
                {'detail': 'No account uses that number.', 'code': 'account_not_found',
                 'errors': {}},
                status=status.HTTP_404_NOT_FOUND,
            )

        otp_service.verify_otp(user, OTPPurpose.REGISTRATION, data['code'])

        # The phone is proved: the account is now a real one, and this is
        # where its first session begins.
        if not user.is_phone_verified:
            user.is_phone_verified = True
            user.is_active = True
            user.save(update_fields=['is_phone_verified', 'is_active', 'updated_at'])

        return session_response(user)


# --------------------------------------------------------------------------
# Sessions
# --------------------------------------------------------------------------


class LoginView(PublicAPIView):
    """Phone and password. No code: verification happens once, at sign-up."""

    serializer_class = LoginSerializer
    throttle_scope = 'login'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        return session_response(user)


class LogoutView(GenericAPIView):
    """Blacklists the refresh token. Dropping it on the client is not enough:
    a copy taken beforehand would still buy new access tokens."""

    permission_classes = (IsAuthenticated,)
    serializer_class = LogoutSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data['refresh']).blacklist()
        except TokenError:
            # Already expired or already blacklisted: the caller wanted it
            # dead and it is dead.
            pass
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(APIView):
    """The signed-in account. What the frontend restores its session from."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        return Response(UserSerializer(request.user).data)


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------


class ForgotPasswordView(PublicAPIView):
    serializer_class = ForgotPasswordSerializer
    throttle_scope = 'password_reset'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(phone=serializer.validated_data['phone']).first()
        if user is not None and user.is_active:
            otp_service.issue_otp(user, OTPPurpose.PASSWORD_RESET)
        # The same answer either way, so this cannot be used to discover who
        # holds an account.
        return Response({
            'detail': f'If that number has an account, a {settings.OTP_LENGTH}-digit code is on its way.',
            'resend_in': settings.OTP_RESEND_COOLDOWN_SECONDS,
            'expires_in_minutes': settings.OTP_EXPIRATION_MINUTES,
        })


class VerifyResetOTPView(PublicAPIView):
    """Spends the code and hands back a short-lived token. The new password is
    set with that token, so the code itself is never replayed."""

    serializer_class = VerifyResetOTPSerializer
    throttle_scope = 'password_reset'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = User.objects.filter(phone=data['phone']).first()
        if user is None:
            return Response(
                {'detail': 'That code is not right.', 'code': 'otp_invalid', 'errors': {}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp = otp_service.verify_otp(user, OTPPurpose.PASSWORD_RESET, data['code'])
        token = TimestampSigner(salt=RESET_SIGNER_SALT).sign_object(
            {'user_id': user.pk, 'otp_id': otp.pk}
        )
        return Response({
            'detail': 'Code accepted. Set a new password.',
            'reset_token': token,
            'expires_in_seconds': settings.PASSWORD_RESET_TOKEN_MAX_AGE_SECONDS,
        })


class ResetPasswordView(PublicAPIView):
    serializer_class = ResetPasswordSerializer
    throttle_scope = 'password_reset'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            payload = TimestampSigner(salt=RESET_SIGNER_SALT).unsign_object(
                serializer.validated_data['reset_token'],
                max_age=settings.PASSWORD_RESET_TOKEN_MAX_AGE_SECONDS,
            )
        except SignatureExpired:
            return Response(
                {'detail': 'That took too long. Ask for a new code.',
                 'code': 'reset_token_expired', 'errors': {}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except BadSignature:
            return Response(
                {'detail': 'Start the reset again.', 'code': 'reset_token_invalid', 'errors': {}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(pk=payload['user_id']).first()
        if user is None:
            return Response(
                {'detail': 'Start the reset again.', 'code': 'reset_token_invalid', 'errors': {}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .serializers import _check_password_policy

        _check_password_policy(serializer.validated_data['password'], user)
        user.set_password(serializer.validated_data['password'])
        # Whoever proved the code owns the phone, so it is verified now too.
        user.is_phone_verified = True
        user.save(update_fields=['password', 'is_phone_verified', 'updated_at'])
        revoke_all_sessions(user)

        return Response({'detail': 'Password updated. Sign in with your new password.'})


class ChangePasswordView(GenericAPIView):
    """For someone already signed in. The current password is the proof."""

    permission_classes = (IsAuthenticated,)
    serializer_class = ChangePasswordSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password', 'updated_at'])

        # Every other session dies; this one is handed a new pair so the
        # person who just changed it is not signed out of their own device.
        revoke_all_sessions(user)
        return session_response(user)


# --------------------------------------------------------------------------
# The owner's employees
# --------------------------------------------------------------------------


class SalonEmployeeListCreateView(GenericAPIView):
    """Employee accounts exist because an owner made one. Nothing here is
    reachable by an employee: the permission is the boundary."""

    permission_classes = (IsAuthenticated, IsSalonOrParlorOwner, TenantContext)
    serializer_class = SalonEmployeeSerializer

    def _salon(self, request) -> Salon:
        """The salon a new chair is being added to.

        Two single-business assumptions used to live in one line here: a
        `salon` id taken from the request body, and `.first()` when it was
        absent. The body is no longer consulted at all — which salon a request
        is acting in is not something the client gets to assert alongside its
        credentials — and the fallback is the tenant rather than whichever
        shop sorts first by name.
        """
        business = business_of_tenant(tenant_of_request(request))
        salon = (business or {}).get('salon')
        if salon is None or salon.owner_id != request.user.id:
            raise Conflict('Register your salon before adding staff.', code='no_salon')
        return salon

    def get(self, request):
        employments = (
            SalonEmployee.objects.filter(salon__owner=request.user)
            .select_related('user', 'salon', 'user__barber_profile')
            .prefetch_related('working_days', 'eligible_services')
        )
        return Response(SalonEmployeeSerializer(employments, many=True).data)

    def post(self, request):
        salon = self._salon(request)
        serializer = SalonEmployeeCreateSerializer(
            data=request.data, context={'request': request, 'salon': salon}
        )
        serializer.is_valid(raise_exception=True)
        employment = serializer.save()
        return Response(
            SalonEmployeeSerializer(employment).data, status=status.HTTP_201_CREATED
        )


class SalonEmployeeDetailView(GenericAPIView):
    permission_classes = (IsAuthenticated, IsSalonOrParlorOwner, TenantContext)
    serializer_class = SalonEmployeeUpdateSerializer

    def _employment(self, request, pk: int):
        return (
            SalonEmployee.objects.filter(pk=pk, salon__owner=request.user)
            .select_related('user', 'salon', 'user__barber_profile')
            .first()
        )

    def get(self, request, pk: int):
        employment = self._employment(request, pk)
        if employment is None:
            return _no_such_employee()
        return Response(SalonEmployeeSerializer(employment).data)

    def patch(self, request, pk: int):
        """The job, the split, whether the chair is open — and the person's own
        card, which an owner who created the account may fill in for them."""
        employment = self._employment(request, pk)
        if employment is None:
            return _no_such_employee()
        serializer = self.get_serializer(employment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # The person's card was written through a relation this row had already
        # cached, so answer from a fresh read rather than echoing the old one.
        return Response(SalonEmployeeSerializer(self._employment(request, pk)).data)

    def delete(self, request, pk: int):
        employment = self._employment(request, pk)
        if employment is None:
            return _no_such_employee()

        employment.is_active = False
        employment.ended_at = timezone.now()
        employment.save(update_fields=['is_active', 'ended_at'])

        # A barber who was hired gets their own trade back rather than being
        # left as an employee of nowhere.
        user = employment.user
        if user.role == Role.SALON_EMPLOYEE and hasattr(user, 'barber_profile'):
            user.role = Role.BARBER
            user.save(update_fields=['role', 'updated_at'])

        return Response(status=status.HTTP_204_NO_CONTENT)


def _no_such_employee() -> Response:
    return Response(
        {'detail': 'No such employee.', 'code': 'not_found', 'errors': {}},
        status=status.HTTP_404_NOT_FOUND,
    )


# --------------------------------------------------------------------------
# Profiles
# --------------------------------------------------------------------------


class ProfileMeView(GenericAPIView):
    """The signed-in account's own profile — one endpoint, four shapes.

    Which serializer validates a PATCH comes from `request.user.role`, so a
    customer cannot reach a salon's fields by sending them, and an employee
    cannot reach the ones their owner keeps.
    """

    permission_classes = (IsAuthenticated, OptionalTenantContext)

    def get_serializer_class(self):
        return PROFILE_WRITERS.get(self.request.user.role)

    def get(self, request):
        return Response(profile_payload(request.user, tenant_of_request(request)))

    def patch(self, request):
        serializer_class = self.get_serializer_class()
        if serializer_class is None:
            return Response(
                {'detail': 'Administrator accounts are managed on the admin site.',
                 'code': 'profile_not_editable', 'errors': {}},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = serializer_class(data=request.data,
                                      context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        request.user.refresh_from_db()
        return Response(
            profile_payload(request.user, tenant_of_request(request)))
