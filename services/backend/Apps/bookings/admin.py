from django.contrib import admin

from .models import Appointment, AppointmentNotification, AppointmentService


class AppointmentServiceInline(admin.TabularInline):
    model = AppointmentService
    extra = 0


class NotificationInline(admin.TabularInline):
    model = AppointmentNotification
    extra = 0
    readonly_fields = ('kind', 'to_phone', 'message', 'status', 'provider', 'error', 'sent_at')


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'customer', 'business_name', 'date', 'start_time', 'status')
    list_filter = ('status', 'date')
    search_fields = ('customer__name', 'customer__phone')
    inlines = (AppointmentServiceInline, NotificationInline)


@admin.register(AppointmentNotification)
class AppointmentNotificationAdmin(admin.ModelAdmin):
    list_display = ('appointment', 'kind', 'to_phone', 'status', 'provider', 'created_at')
    list_filter = ('kind', 'status', 'provider')
