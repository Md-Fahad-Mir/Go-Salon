"""    /api/bookings/                      the caller's appointments
    /api/bookings/availability/         free slots for a day
    /api/bookings/walk-in/              a business adding somebody at the counter
    /api/bookings/{id}/                 one appointment
    /api/bookings/{id}/{action}/        approve, reject, cancel, complete, reschedule
    /api/bookings/analytics/            what the salon took, for its owner
    /api/bookings/performance/          how one stylist did, for themselves

Both reports live under /api/bookings/ rather than /api/salon/ because the
permission boundary they obey is `Apps/bookings/access.py::scoped`, and an
endpoint filed under the salon namespace invites the next maintainer to reach
for `Salon.objects` and rebuild that rule by hand.
"""

from django.urls import path

from . import views

app_name = 'bookings'

urlpatterns = [
    path('bookings/availability/', views.AvailabilityView.as_view(), name='availability'),
    path('bookings/walk-in/', views.WalkInView.as_view(), name='walk-in'),
    path('bookings/analytics/', views.AnalyticsView.as_view(), name='analytics'),
    path('bookings/performance/', views.PerformanceView.as_view(), name='performance'),
    path('bookings/', views.BookingListCreateView.as_view(), name='bookings'),
    path('bookings/<int:pk>/', views.BookingDetailView.as_view(), name='booking'),
    path('bookings/<int:pk>/approve/', views.ApproveView.as_view(), name='approve'),
    path('bookings/<int:pk>/reject/', views.RejectView.as_view(), name='reject'),
    path('bookings/<int:pk>/cancel/', views.CancelView.as_view(), name='cancel'),
    path('bookings/<int:pk>/complete/', views.CompleteView.as_view(), name='complete'),
    path('bookings/<int:pk>/reschedule/', views.RescheduleView.as_view(), name='reschedule'),
]
