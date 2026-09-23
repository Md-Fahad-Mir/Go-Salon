"""    /api/tenants/join/            scan a salon's QR, become its customer
    /api/tenants/mine/            the salons this customer has joined
    /api/tenants/mine/<id>/       remove one, keeping what happened there
    /api/salon/qr/                the shop's own code, as a PNG
    /api/salon/qr/regenerate/     a new code; every printed copy stops working

`join/` is the only tenant-scoped route in the project with no tenant on the
request — establishing one is what it is for.
"""

from django.urls import path

from . import views

app_name = 'tenants'

urlpatterns = [
    path('tenants/join/', views.JoinView.as_view(), name='join'),
    path('tenants/mine/', views.MyTenantsView.as_view(), name='mine'),
    path('tenants/mine/<int:tenant_id>/', views.MyTenantView.as_view(), name='mine-detail'),

    # Filed under `salon/` beside the owner's other business screens rather
    # than under `tenants/`, because to an owner this is the shop's QR code,
    # not an object in a tenancy model they never see.
    path('salon/qr/', views.SalonQRView.as_view(), name='salon-qr'),
    path('salon/qr/regenerate/', views.SalonQRRegenerateView.as_view(),
         name='salon-qr-regenerate'),
]
