"""The headings every price list starts from.

Shared categories (no owner) are the catalogue a new professional sees on
their first visit to the services screen, so nobody has to invent "Haircut"
before they can charge for one. A professional who needs a heading nobody
thought of still makes their own; these are only the common ground.

Icons are names from the app's own icon set, not pictures — the field takes
either, and a name travels better than a base64 blob.
"""

from django.db import migrations

SHARED = [
    ('Haircut', 'scissors', 'Cuts, fades and trims.', 10),
    ('Beard', 'beard', 'Shaves, shaping and beard care.', 20),
    ('Styling', 'sparkles', 'Blow-dry, setting and finishing.', 30),
    ('Coloring', 'palette', 'Colour, highlights and balayage.', 40),
    ('Treatment', 'droplet', 'Keratin, spa and scalp work.', 50),
    ('Braiding', 'git-branch', 'Braids, twists and protective styles.', 60),
    ('Bridal', 'crown', 'Holud, wedding and party packages.', 70),
]


def seed(apps, schema_editor):
    ServiceCategory = apps.get_model('services', 'ServiceCategory')
    for name, icon, description, sort_order in SHARED:
        ServiceCategory.objects.update_or_create(
            owner=None,
            name=name,
            defaults={'icon': icon, 'description': description, 'sort_order': sort_order},
        )


def unseed(apps, schema_editor):
    ServiceCategory = apps.get_model('services', 'ServiceCategory')
    ServiceCategory.objects.filter(owner=None, name__in=[row[0] for row in SHARED]).delete()


class Migration(migrations.Migration):

    dependencies = [('services', '0001_initial')]

    operations = [migrations.RunPython(seed, unseed)]
