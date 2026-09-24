"""    /api/listings/{id}/      one salon, in full, for somebody who belongs to it

`/api/directory/` — the browsable list — is gone. See `views.py` for why the
list was removed rather than locked down, and why what remains is no longer a
directory.
"""

from django.urls import path

from . import views

app_name = 'directory'

urlpatterns = [
    path('listings/<str:listing_id>/', views.DetailView.as_view(), name='listing'),
]
