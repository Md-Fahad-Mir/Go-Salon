"""    /api/services/categories/[<pk>/]   headings
    /api/services/[<pk>/]              the caller's own price list
"""

from django.urls import path

from . import views

app_name = 'services'

urlpatterns = [
    path('services/categories/', views.ServiceCategoryListView.as_view(), name='categories'),
    path('services/categories/<int:pk>/', views.ServiceCategoryDetailView.as_view(),
         name='category'),
    path('services/', views.ServiceListCreateView.as_view(), name='services'),
    path('services/<int:pk>/', views.ServiceDetailView.as_view(), name='service'),
]
