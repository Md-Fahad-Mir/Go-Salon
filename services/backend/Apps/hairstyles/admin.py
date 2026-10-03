from django.contrib import admin

from .models import Hairstyle


@admin.register(Hairstyle)
class HairstyleAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'is_active', 'generation_count', 'created_at')
    list_filter = ('category', 'is_active')
    search_fields = ('name', 'category')
