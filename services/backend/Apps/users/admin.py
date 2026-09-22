"""Django admin — the internal way accounts are managed.

Admin accounts are created here or with `manage.py createsuperuser`. There is
no public endpoint that can mint one, by design.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.translation import gettext_lazy as _

from .models import BarberProfile, CustomerProfile, OTPCode, Salon, SalonEmployee, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ('-date_joined',)
    list_display = ('phone', 'name', 'role', 'is_phone_verified', 'is_active', 'date_joined')
    list_filter = ('role', 'is_phone_verified', 'is_active', 'is_staff')
    search_fields = ('phone', 'name', 'email')
    readonly_fields = ('date_joined', 'last_login', 'updated_at')

    fieldsets = (
        (None, {'fields': ('phone', 'password')}),
        (_('Personal info'), {'fields': ('name', 'email')}),
        (_('Role and access'), {
            'fields': ('role', 'is_phone_verified', 'is_active', 'is_staff', 'is_superuser',
                       'groups', 'user_permissions'),
        }),
        (_('App'), {'fields': ('try_on_credits', 'terms_accepted_at')}),
        (_('Important dates'), {'fields': ('last_login', 'date_joined', 'updated_at')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('phone', 'name', 'role', 'password1', 'password2'),
        }),
    )


@admin.register(Salon)
class SalonAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'business_type', 'audience', 'area', 'created_at')
    list_filter = ('business_type', 'audience')
    search_fields = ('name', 'owner__phone', 'owner__name')


@admin.register(SalonEmployee)
class SalonEmployeeAdmin(admin.ModelAdmin):
    list_display = ('user', 'salon', 'title', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('user__phone', 'user__name', 'salon__name')


@admin.register(OTPCode)
class OTPCodeAdmin(admin.ModelAdmin):
    """Show development OTPs while keeping the verification hash private."""

    list_display = ('user', 'purpose', 'debug_code', 'created_at', 'expires_at', 'consumed_at',
                    'invalidated_at', 'attempts')
    list_filter = ('purpose',)
    search_fields = ('user__phone',)
    readonly_fields = ('user', 'purpose', 'debug_code', 'expires_at', 'consumed_at',
                       'invalidated_at', 'attempts', 'created_at')
    exclude = ('code_hash',)

    def has_add_permission(self, request) -> bool:
        return False


admin.site.register(CustomerProfile)
admin.site.register(BarberProfile)
