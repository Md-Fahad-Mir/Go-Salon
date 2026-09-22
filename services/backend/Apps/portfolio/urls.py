"""    /api/profile/me/gallery/[<pk>/]   the caller's own pictures"""

from django.urls import path

from . import views

app_name = 'portfolio'

urlpatterns = [
    path('profile/me/gallery/', views.GalleryView.as_view(), name='gallery'),
    path('profile/me/gallery/<int:pk>/', views.GalleryItemView.as_view(), name='gallery-item'),
]
