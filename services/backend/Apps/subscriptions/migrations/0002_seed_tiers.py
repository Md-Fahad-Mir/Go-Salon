"""The three plans that were fixed in code before tiers could be edited —
seeded under the same slugs, so every account's existing `subscription_tier`
already points at one when `users.0008` turns the column into a foreign key."""

from django.db import migrations

TIERS = [
    {
        'slug': 'free', 'name': 'Free', 'price_bdt': 0, 'is_default': True, 'is_featured': False,
        'features': ['Browse salons and barbers', 'Book appointments', '3 AI try-ons per month'],
    },
    {
        'slug': 'basic', 'name': 'Basic', 'price_bdt': 199, 'is_default': False, 'is_featured': False,
        'features': ['Everything in Free', '30 AI try-ons per month', 'Priority booking slots',
                     'Booking history export'],
    },
    {
        'slug': 'advanced', 'name': 'Advanced', 'price_bdt': 499, 'is_default': False, 'is_featured': True,
        'features': ['Everything in Basic', 'Unlimited AI hairstyle generation', 'Highest-resolution renders',
                     'Early access to new styles'],
    },
]


def seed(apps, schema_editor):
    SubscriptionTier = apps.get_model('subscriptions', 'SubscriptionTier')
    for position, tier in enumerate(TIERS):
        SubscriptionTier.objects.get_or_create(slug=tier['slug'], defaults={**tier, 'position': position})


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
