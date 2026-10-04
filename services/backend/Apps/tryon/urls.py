"""    /api/tryon/videos/                       start a 360° try-on video
    /api/tryon/videos/<pk>/                  its status
    /api/tryon/videos/<pk>/content/          the finished clip
    /api/admin/settings/ai-generation/       which video model renders them — admin only
"""

from django.urls import path

from . import views

app_name = 'tryon'

urlpatterns = [
    path('tryon/videos/', views.TryOnVideoCreateView.as_view(), name='videos'),
    path('tryon/videos/<int:pk>/', views.TryOnVideoDetailView.as_view(), name='video'),
    path('tryon/videos/<int:pk>/content/', views.TryOnVideoContentView.as_view(), name='video-content'),
    path('admin/settings/ai-generation/', views.AdminAIGenerationSettingsView.as_view(),
         name='admin-ai-generation'),
]
