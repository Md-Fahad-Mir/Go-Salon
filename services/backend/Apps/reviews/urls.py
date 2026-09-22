"""    /api/reviews/                          what this account may see
    /api/reviews/listing/{professional_id}/  one business's, for anybody
    /api/reviews/booking/{id}/               POST to write one, PATCH to answer
"""

from django.urls import path

from . import views

app_name = 'reviews'

urlpatterns = [
    path('reviews/', views.MyReviewsView.as_view(), name='mine'),
    path('reviews/listing/<str:professional_id>/', views.ListingReviewsView.as_view(), name='listing'),
    path('reviews/booking/<int:pk>/', views.AppointmentReviewView.as_view(), name='booking'),
]
