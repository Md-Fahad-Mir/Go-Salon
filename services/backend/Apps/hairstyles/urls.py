"""    /api/hairstyles/[<pk>/]             the AI try-on catalogue — admin only
    /api/hairstyles/catalogue/[<pk>/]   its active styles — any signed-in account
"""

from django.urls import path

from . import views

app_name = 'hairstyles'

urlpatterns = [
    path('hairstyles/', views.HairstyleListCreateView.as_view(), name='hairstyles'),
    path('hairstyles/catalogue/', views.HairstyleCatalogueView.as_view(), name='catalogue'),
    path('hairstyles/catalogue/<int:pk>/', views.HairstyleCatalogueDetailView.as_view(),
         name='catalogue-style'),
    path('hairstyles/<int:pk>/', views.HairstyleDetailView.as_view(), name='hairstyle'),
]
