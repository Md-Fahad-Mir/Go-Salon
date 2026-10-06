"""Plans priced in any currency, and in several at once.

`price_bdt` becomes `price` — renamed rather than dropped and re-added, so
every plan keeps what it costs — and turns decimal, since a dollar plan can
cost $4.99. Every existing plan's main currency is the taka it was priced in.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0003_tier_monthly_credits'),
    ]

    operations = [
        migrations.RenameField(
            model_name='subscriptiontier',
            old_name='price_bdt',
            new_name='price',
        ),
        migrations.AlterField(
            model_name='subscriptiontier',
            name='price',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='subscriptiontier',
            name='currency',
            field=models.CharField(default='BDT', max_length=3),
        ),
        migrations.AddField(
            model_name='subscriptiontier',
            name='other_prices',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
