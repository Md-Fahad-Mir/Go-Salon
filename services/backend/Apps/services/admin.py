from django.contrib import admin

from .models import Service, ServiceCategory


@admin.register(ServiceCategory)
class ServiceCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'sort_order', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner_label', 'price', 'duration_minutes', 'audience', 'is_active')
    list_filter = ('is_active', 'audience')
    search_fields = ('name',)
    autocomplete_fields = ('category',)
