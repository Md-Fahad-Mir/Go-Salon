from django.contrib import admin

from .models import WorkingDay, WorkingInterval


class WorkingIntervalInline(admin.TabularInline):
    model = WorkingInterval
    extra = 0


@admin.register(WorkingDay)
class WorkingDayAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'salon', 'barber', 'employment')
    list_filter = ('weekday', 'is_closed')
    inlines = (WorkingIntervalInline,)
