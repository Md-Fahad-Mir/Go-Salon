"""    /api/directory/          salons and barbers a customer can browse
    /api/directory/{id}/     one of them, with its menu and its chairs
"""

from django.urls import path

from . import views

app_name = 'directory'

urlpatterns = [
    path('directory/', views.DirectoryListView.as_view(), name='directory'),
    path('directory/<str:listing_id>/', views.DirectoryDetailView.as_view(), name='listing'),
]
