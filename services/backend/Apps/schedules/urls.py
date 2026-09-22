"""    /api/schedule/me/                 the caller's own working hours
    /api/schedule/employees/<pk>/     one chair's, set by the salon owner
"""

from django.urls import path

from . import views

app_name = 'schedules'

urlpatterns = [
    path('schedule/me/', views.MyScheduleView.as_view(), name='my-schedule'),
    path('schedule/employees/<int:pk>/', views.EmployeeScheduleView.as_view(),
         name='employee-schedule'),
]
