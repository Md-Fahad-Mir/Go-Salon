"""Subscription tiers — the monthly plans an account can be on.

Curated from the admin dashboard's Settings rather than fixed in code: an
admin adds, renames, reprices, reorders and deletes plans, and every account
points at one through `User.subscription_tier`.

Accounts reference a tier by its `slug`, not its numeric id. The slug is
minted from the name when the tier is created and never changes after, so
renaming "Basic" to "Plus" moves nobody — and the value the users API has
always returned for a plan ('free', 'basic', 'advanced') stays what it was.

A plan has a main price, in any currency, and may carry prices in others
too — ৳500, and $5 for customers who pay in dollars. A pricing page shows
each customer the price in their own currency when the plan has one, and the
main price when it does not.

The admin API keeps two invariants so `default_tier_slug` always has an
answer: exactly one tier is the default, and the default cannot be deleted.
"""

from __future__ import annotations

from django.db import models
from django.db.models import Q

from .currencies import DEFAULT_CURRENCY

#: The plan a brand-new database starts every account on (see the seed
#: migration), and the one recreated if the table is ever emptied.
FREE_SLUG = 'free'


class SubscriptionTier(models.Model):
    slug = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=40)
    #: The plan's main currency, an ISO 4217 code: what `price` is in, and
    #: what a customer sees when the plan has no price in theirs.
    currency = models.CharField(max_length=3, default=DEFAULT_CURRENCY)
    #: Monthly price in `currency`. Zero is a free plan — free in every
    #: currency, so it carries no `other_prices`.
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    #: The same plan in other currencies, in the order they were added:
    #: `[{"currency": "USD", "amount": "5.00"}]`. Amounts are decimal strings,
    #: so a price is kept exactly as it was set.
    other_prices = models.JSONField(default=list, blank=True)
    #: 360° try-on videos the plan allows each calendar month — one credit
    #: each, counted by Apps.tryon.credits. Null is unlimited.
    monthly_credits = models.PositiveIntegerField(null=True, blank=True, default=0)
    #: What the plan includes, in the order a pricing page lists it.
    features = models.JSONField(default=list, blank=True)
    #: Highlighted on pricing pages.
    is_featured = models.BooleanField(default=False)
    #: The plan every new account starts on.
    is_default = models.BooleanField(default=False)
    #: Display order, lowest first.
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('position', 'pk')
        constraints = [
            models.UniqueConstraint(
                fields=('is_default',), condition=Q(is_default=True), name='one_default_subscription_tier',
            ),
        ]

    def __str__(self) -> str:
        return self.name


def default_tier_slug() -> str:
    """The plan a new account starts on — `User.subscription_tier`'s default.

    The table is only empty when it was cleared behind the admin API's back
    (`manage.py flush`, or a test that truncates every table). Sign-ups keep
    working through that by getting the Free plan back rather than failing
    on a plan that does not exist."""
    slug = SubscriptionTier.objects.filter(is_default=True).values_list('slug', flat=True).first()
    if slug:
        return slug
    tier = SubscriptionTier.objects.first()
    if tier is None:
        tier = SubscriptionTier.objects.create(slug=FREE_SLUG, name='Free', monthly_credits=3, is_default=True)
    return tier.slug
