from django.apps import AppConfig


class TenantsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'Apps.tenants'
    label = 'tenants'

    def ready(self):
        # Imported for its `@receiver` side effects, which is the whole reason
        # the import exists — hence the noqa. Done here rather than at module
        # level because the receivers reach `Apps.users.models`, and that is
        # only safe once the app registry has finished loading.
        from . import signals  # noqa: F401
