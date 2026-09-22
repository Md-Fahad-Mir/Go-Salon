"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    # Admin accounts are made here and from `manage.py createsuperuser`, never
    # through a public registration endpoint.
    path('admin/', admin.site.urls),
    path('api/', include('Apps.users.urls')),
    path('api/', include('Apps.services.urls')),
    path('api/', include('Apps.schedules.urls')),
    path('api/', include('Apps.portfolio.urls')),
    path('api/', include('Apps.directory.urls')),
    path('api/', include('Apps.bookings.urls')),
    path('api/', include('Apps.reviews.urls')),
]
