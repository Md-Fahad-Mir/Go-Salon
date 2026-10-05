"""    /api/admin/subscription-tiers/[<pk>/]      the monthly plans — admin only
    /api/admin/subscription-tiers/reorder/     their display order — admin only
    /api/subscription-tiers/                   every plan, for pricing pages — public
"""

from django.urls import path

from . import views

app_name = 'subscriptions'

urlpatterns = [
    path('admin/subscription-tiers/', views.AdminSubscriptionTierListCreateView.as_view(), name='admin-tiers'),
    path('admin/subscription-tiers/reorder/', views.AdminSubscriptionTierReorderView.as_view(),
         name='admin-tiers-reorder'),
    path('admin/subscription-tiers/<int:pk>/', views.AdminSubscriptionTierDetailView.as_view(),
         name='admin-tier'),
    path('subscription-tiers/', views.SubscriptionTierCatalogueView.as_view(), name='catalogue'),
]
