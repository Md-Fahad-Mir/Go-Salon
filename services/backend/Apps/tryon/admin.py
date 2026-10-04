from django.contrib import admin

from .models import TryOnSettings, TryOnVideo


@admin.register(TryOnVideo)
class TryOnVideoAdmin(admin.ModelAdmin):
    list_display = ('hairstyle_name', 'user', 'status', 'video_model', 'created_at', 'completed_at')
    list_filter = ('status', 'video_model')
    search_fields = ('hairstyle_name', 'job_id', 'user__phone')
    readonly_fields = ('job_id', 'created_at', 'checked_at', 'completed_at')


@admin.register(TryOnSettings)
class TryOnSettingsAdmin(admin.ModelAdmin):
    list_display = ('video_model', 'updated_at', 'updated_by')
