"""    /api/admin/settings/platform/      the .env settings an admin may override — admin only
"""

from django.urls import path

from . import views

app_name = 'platform_settings'

urlpatterns = [
    path('admin/settings/platform/', views.AdminPlatformSettingsView.as_view(), name='admin-platform-settings'),
]
