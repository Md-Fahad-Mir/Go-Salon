"""Authentication routes.

    /api/auth/register/{customer,barber,salon-owner}/   public sign-up
    /api/auth/otp/{request,verify,resend}/              phone verification
    /api/auth/{login,logout,token/refresh}/             sessions
    /api/auth/password/...                              forgot / reset / change
    /api/auth/me/                                       the signed-in account
    /api/profile/me/                                    the caller's own profile
    /api/salon/employees/                               the owner's staff

There is deliberately no register/salon-employee/ and no register/admin/.
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

app_name = 'users'

urlpatterns = [
    # Registration — the three roles that may sign themselves up.
    path('auth/register/customer/', views.CustomerRegisterView.as_view(), name='register-customer'),
    path('auth/register/barber/', views.BarberRegisterView.as_view(), name='register-barber'),
    path('auth/register/salon-owner/', views.SalonOwnerRegisterView.as_view(), name='register-salon-owner'),

    # One-time codes.
    path('auth/otp/request/', views.OTPRequestView.as_view(), name='otp-request'),
    path('auth/otp/verify/', views.OTPVerifyView.as_view(), name='otp-verify'),
    path('auth/otp/resend/', views.OTPResendView.as_view(), name='otp-resend'),

    # Sessions.
    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/logout/', views.LogoutView.as_view(), name='logout'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('auth/me/', views.MeView.as_view(), name='me'),

    # Passwords.
    path('auth/password/forgot/', views.ForgotPasswordView.as_view(), name='password-forgot'),
    path('auth/password/verify-otp/', views.VerifyResetOTPView.as_view(), name='password-verify-otp'),
    path('auth/password/reset/', views.ResetPasswordView.as_view(), name='password-reset'),
    path('auth/password/change/', views.ChangePasswordView.as_view(), name='password-change'),

    # The signed-in account's own profile, whatever its role.
    path('profile/me/', views.ProfileMeView.as_view(), name='profile-me'),

    # The owner's staff. Employees cannot reach these.
    path('salon/employees/', views.SalonEmployeeListCreateView.as_view(), name='salon-employees'),
    path('salon/employees/<int:pk>/', views.SalonEmployeeDetailView.as_view(), name='salon-employee'),
]
