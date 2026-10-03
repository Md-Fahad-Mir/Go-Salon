"""    /api/hairstyles/[<pk>/]   the AI try-on catalogue — admin only
"""

from django.urls import path

from . import views

app_name = 'hairstyles'

urlpatterns = [
    path('hairstyles/', views.HairstyleListCreateView.as_view(), name='hairstyles'),
    path('hairstyles/<int:pk>/', views.HairstyleDetailView.as_view(), name='hairstyle'),
]
