from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Max
from django.utils.text import slugify
from rest_framework import serializers

from .currencies import CURRENCIES, DEFAULT_CURRENCY, ZERO_DECIMAL
from .models import SubscriptionTier

#: A sanity ceiling on a price in any currency. It has to leave room for the
#: weakest: a month priced in Iranian rial runs to millions.
MAX_PRICE = Decimal('1000000000')
#: A sanity ceiling on a plan's monthly try-ons; "unlimited" is null, not big.
MAX_MONTHLY_CREDITS = 100_000
#: A pricing card lists a handful of lines; past this it stops being one.
MAX_FEATURES = 20
MAX_FEATURE_LENGTH = 120


def _whole_only(currency: str) -> str:
    return f'{currency} has no smaller unit — enter a whole amount.'


def _amount(value, currency: str) -> Decimal:
    """`value` as a price in `currency`, or why it cannot be one — with the
    currency named, since one message covers every row of other prices."""
    field = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, max_value=MAX_PRICE)
    try:
        amount = field.run_validation(value)
    except serializers.ValidationError as error:
        raise serializers.ValidationError(f'{currency}: {error.detail[0]}') from None
    if currency in ZERO_DECIMAL and amount != amount.to_integral_value():
        raise serializers.ValidationError(_whole_only(currency))
    return amount


def _unique_slug(name: str) -> str:
    """A slug for a new tier. Names in Bangla slugify to nothing, so those
    fall back to 'plan' — the slug is an identifier, never shown as a name."""
    base = slugify(name)[:34] or 'plan'
    slug, n = base, 2
    while SubscriptionTier.objects.filter(slug=slug).exists():
        slug, n = f'{base}-{n}', n + 1
    return slug


class SubscriptionTierSerializer(serializers.ModelSerializer):
    """A tier as the admin dashboard edits it. `subscriber_count` is read
    from an annotation — see `views.tiers()` — so listing every tier costs
    one query."""

    features = serializers.ListField(
        child=serializers.CharField(max_length=MAX_FEATURE_LENGTH, allow_blank=True),
        required=False,
        max_length=MAX_FEATURES,
    )
    #: `[{"currency": "USD", "amount": "5.00"}]` — see `validate_other_prices`.
    other_prices = serializers.ListField(child=serializers.DictField(), required=False)
    subscriber_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = SubscriptionTier
        fields = (
            'id', 'slug', 'name', 'currency', 'price', 'other_prices', 'monthly_credits', 'features',
            'is_featured', 'is_default', 'position', 'subscriber_count', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'slug', 'position', 'subscriber_count', 'created_at', 'updated_at')
        extra_kwargs = {
            'price': {'min_value': 0, 'max_value': MAX_PRICE},
            'monthly_credits': {'max_value': MAX_MONTHLY_CREDITS},
            # DRF would check the one-default constraint before `update()`
            # gets to move the flag off the old default, and refuse.
            'is_default': {'validators': []},
        }

    def validate_name(self, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError('Give this plan a name.')
        others = SubscriptionTier.objects.filter(name__iexact=value)
        if self.instance is not None:
            others = others.exclude(pk=self.instance.pk)
        if others.exists():
            raise serializers.ValidationError('Another plan already has that name.')
        return value

    def validate_currency(self, value: str) -> str:
        value = value.strip().upper()
        if value not in CURRENCIES:
            raise serializers.ValidationError('Choose a currency from the list.')
        return value

    def validate_other_prices(self, value: list[dict]) -> list[dict]:
        """Each price as it is stored: an ISO code and a decimal string, in
        the order given, every currency at most once and none of them free."""
        prices = []
        seen: set[str] = set()
        for entry in value:
            currency = str(entry.get('currency') or '').strip().upper()
            if not currency:
                raise serializers.ValidationError('Choose a currency for every price.')
            if currency not in CURRENCIES:
                raise serializers.ValidationError(f'{currency} is not a currency code we know.')
            if currency in seen:
                raise serializers.ValidationError(f'{currency} is listed twice.')
            seen.add(currency)
            amount = _amount(entry.get('amount'), currency)
            if not amount:
                raise serializers.ValidationError(f'Enter a {currency} price above 0.')
            prices.append({'currency': currency, 'amount': str(amount)})
        return prices

    def validate_features(self, value: list[str]) -> list[str]:
        # Blank lines dropped, repeats kept once, in the order typed.
        seen: set[str] = set()
        features = []
        for feature in (item.strip() for item in value):
            if feature and feature.lower() not in seen:
                seen.add(feature.lower())
                features.append(feature)
        return features

    def validate_is_default(self, value: bool) -> bool:
        # There is always exactly one default; it moves by naming another
        # plan, never by switching this one off and leaving none.
        if not value and self.instance is not None and self.instance.is_default:
            raise serializers.ValidationError(
                'New accounts need a plan to start on. Make another plan the default instead.'
            )
        return value

    def validate(self, attrs: dict) -> dict:
        """The prices the plan will have once this save lands, checked
        together: a PATCH that changes only the currency still has to suit
        the price the plan keeps."""
        tier = self.instance
        currency = attrs.get('currency', tier.currency if tier else DEFAULT_CURRENCY)
        price = attrs.get('price', tier.price if tier else Decimal(0))
        if currency in ZERO_DECIMAL and price != price.to_integral_value():
            raise serializers.ValidationError({'price': [_whole_only(currency)]})
        if not price:
            # Free is free in every currency.
            attrs['other_prices'] = []
            return attrs
        others = attrs.get('other_prices', tier.other_prices if tier else [])
        if any(entry['currency'] == currency for entry in others):
            raise serializers.ValidationError(
                {'other_prices': [f'{currency} is this plan’s main currency already.']}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data: dict) -> SubscriptionTier:
        if not SubscriptionTier.objects.exists():
            validated_data['is_default'] = True
        if validated_data.get('is_default'):
            SubscriptionTier.objects.filter(is_default=True).update(is_default=False)
        last = SubscriptionTier.objects.aggregate(last=Max('position'))['last']
        validated_data['position'] = 0 if last is None else last + 1
        validated_data['slug'] = _unique_slug(validated_data['name'])
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance: SubscriptionTier, validated_data: dict) -> SubscriptionTier:
        if validated_data.get('is_default') and not instance.is_default:
            SubscriptionTier.objects.filter(is_default=True).update(is_default=False)
        return super().update(instance, validated_data)


class SubscriptionTierReorderSerializer(serializers.Serializer):
    #: Every tier's id, in the order they should be shown.
    order = serializers.ListField(child=serializers.IntegerField())

    def validate_order(self, value: list[int]) -> list[int]:
        existing = set(SubscriptionTier.objects.values_list('pk', flat=True))
        if len(value) != len(existing) or set(value) != existing:
            raise serializers.ValidationError('List every plan exactly once.')
        return value


class SubscriptionTierCatalogueSerializer(serializers.ModelSerializer):
    """A tier as a pricing page shows it. Nothing about how it is curated —
    its position, its subscribers, the timestamps — leaves the admin API."""

    class Meta:
        model = SubscriptionTier
        fields = (
            'slug', 'name', 'currency', 'price', 'other_prices', 'monthly_credits', 'features', 'is_featured',
            'is_default',
        )
        read_only_fields = fields
