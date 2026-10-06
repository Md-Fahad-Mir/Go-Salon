from django.contrib import admin

from .models import SubscriptionTier


@admin.register(SubscriptionTier)
class SubscriptionTierAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'currency', 'price', 'is_featured', 'is_default', 'position')
    readonly_fields = ('slug', 'created_at', 'updated_at')

    def has_delete_permission(self, request, obj=None) -> bool:
        # Deleting moves the plan's accounts somewhere first and never takes
        # the default — rules the admin dashboard's Settings applies and this
        # page would not.
        return False
