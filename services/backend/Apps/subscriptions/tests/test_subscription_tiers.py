"""Subscription tiers: curated by admins in Settings, read by pricing pages."""

from __future__ import annotations

from Apps.subscriptions.models import SubscriptionTier, default_tier_slug
from Apps.users.models import User
from Apps.users.tests.base import AuthTestCase

LIST = '/api/admin/subscription-tiers/'
REORDER = '/api/admin/subscription-tiers/reorder/'
CATALOGUE = '/api/subscription-tiers/'


def detail(pk: int) -> str:
    return f'/api/admin/subscription-tiers/{pk}/'


def tier(slug: str) -> SubscriptionTier:
    return SubscriptionTier.objects.get(slug=slug)


class TierAccessTests(AuthTestCase):
    def test_a_customer_is_refused(self):
        self.as_user(self.make_customer())
        self.assertEqual(self.client.get(LIST).status_code, 403)

    def test_an_anonymous_caller_is_refused(self):
        self.assertEqual(self.client.get(LIST).status_code, 401)

    def test_an_admin_sees_the_seeded_plans_in_order(self):
        self.as_user(self.admin_session())
        response = self.client.get(LIST)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row['slug'] for row in response.data], ['free', 'basic', 'advanced'])
        free = response.data[0]
        self.assertTrue(free['is_default'])
        # The admin making the request is on the default plan too.
        self.assertEqual(free['subscriber_count'], 1)


class TierCrudTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.admin_session())

    def test_create_mints_a_slug_and_goes_last(self):
        response = self.client.post(LIST, {
            'name': 'Salon Pro', 'price': 999,
            'features': ['Team calendar', '  ', 'Team calendar', 'Priority support'],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['slug'], 'salon-pro')
        self.assertEqual(response.data['position'], 3)
        self.assertEqual(response.data['subscriber_count'], 0)
        self.assertEqual(response.data['features'], ['Team calendar', 'Priority support'])
        self.assertFalse(response.data['is_default'])

    def test_monthly_credits_take_a_number_or_unlimited(self):
        limited = self.client.post(LIST, {'name': 'Plus', 'price': 99, 'monthly_credits': 10}, format='json')
        self.assertEqual(limited.status_code, 201, limited.data)
        self.assertEqual(limited.data['monthly_credits'], 10)

        unlimited = self.client.patch(detail(limited.data['id']), {'monthly_credits': None}, format='json')
        self.assertEqual(unlimited.status_code, 200, unlimited.data)
        self.assertIsNone(unlimited.data['monthly_credits'])

        negative = self.client.patch(detail(limited.data['id']), {'monthly_credits': -1}, format='json')
        self.assertEqual(negative.status_code, 400, negative.data)

    def test_a_name_with_no_latin_letters_still_gets_a_slug(self):
        response = self.client.post(LIST, {'name': 'প্রিমিয়াম', 'price': 299}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['slug'], 'plan')

    def test_names_are_required_and_unique(self):
        blank = self.client.post(LIST, {'name': ' ', 'price': 10}, format='json')
        self.assertEqual(blank.status_code, 400, blank.data)
        self.assertIn('name', blank.data['errors'])

        taken = self.client.post(LIST, {'name': 'basic', 'price': 10}, format='json')
        self.assertEqual(taken.status_code, 400, taken.data)
        self.assertIn('name', taken.data['errors'])

    def test_price_must_be_a_sane_amount(self):
        for price in (-1, 10_000_000_000, '4.999', 'lots'):
            response = self.client.post(LIST, {'name': 'Odd', 'price': price}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('price', response.data['errors'])

    def test_renaming_keeps_the_slug_and_its_subscribers(self):
        customer = self.user_for(self.make_customer())
        User.objects.filter(pk=customer.pk).update(subscription_tier='basic')

        response = self.client.patch(detail(tier('basic').pk), {'name': 'Plus', 'price': 249}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['slug'], 'basic')
        self.assertEqual(response.data['name'], 'Plus')
        self.assertEqual(response.data['subscriber_count'], 1)

    def test_making_a_plan_the_default_moves_the_flag(self):
        response = self.client.patch(detail(tier('basic').pk), {'is_default': True}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(list(SubscriptionTier.objects.filter(is_default=True).values_list('slug', flat=True)),
                         ['basic'])

    def test_the_default_cannot_simply_be_switched_off(self):
        response = self.client.patch(detail(tier('free').pk), {'is_default': False}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertTrue(tier('free').is_default)

    def test_a_new_account_starts_on_the_default_plan(self):
        self.client.patch(detail(tier('basic').pk), {'is_default': True}, format='json')
        customer = self.user_for(self.make_customer())
        self.assertEqual(customer.subscription_tier_id, 'basic')

    def test_reorder(self):
        ids = {slug: tier(slug).pk for slug in ('free', 'basic', 'advanced')}
        response = self.client.post(REORDER, {'order': [ids['advanced'], ids['free'], ids['basic']]},
                                    format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row['slug'] for row in response.data], ['advanced', 'free', 'basic'])

    def test_reorder_must_name_every_plan_once(self):
        response = self.client.post(REORDER, {'order': [tier('free').pk, tier('free').pk]}, format='json')
        self.assertEqual(response.status_code, 400, response.data)


class TierCurrencyTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.admin_session())

    def test_existing_plans_keep_their_taka_prices(self):
        response = self.client.get(LIST)
        self.assertEqual([(row['currency'], row['price']) for row in response.data],
                         [('BDT', '0.00'), ('BDT', '199.00'), ('BDT', '499.00')])
        self.assertEqual([row['other_prices'] for row in response.data], [[], [], []])

    def test_a_plan_can_be_priced_in_another_currency(self):
        response = self.client.post(LIST, {'name': 'Global', 'currency': 'usd', 'price': '4.99'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual((response.data['currency'], response.data['price']), ('USD', '4.99'))

    def test_an_unknown_currency_is_refused(self):
        for currency in ('XYZ', '', 'DOLLAR'):
            response = self.client.post(LIST, {'name': 'Odd', 'currency': currency, 'price': 5}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('currency', response.data['errors'])

    def test_other_prices_are_kept_in_order(self):
        response = self.client.patch(detail(tier('basic').pk), {'other_prices': [
            {'currency': 'usd', 'amount': 5}, {'currency': 'EUR', 'amount': '4.5'}, {'currency': 'JPY', 'amount': 750},
        ]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        expected = [
            {'currency': 'USD', 'amount': '5.00'},
            {'currency': 'EUR', 'amount': '4.50'},
            {'currency': 'JPY', 'amount': '750.00'},
        ]
        self.assertEqual(response.data['other_prices'], expected)
        self.assertEqual(tier('basic').other_prices, expected)
        self.assertEqual(self.client.get(CATALOGUE).data[1]['other_prices'], expected)

    def test_bad_other_prices_are_refused_with_one_message(self):
        cases = [
            [{'currency': 'XYZ', 'amount': 5}],
            [{'currency': '', 'amount': 5}],
            [{'currency': 'USD', 'amount': 5}, {'currency': 'usd', 'amount': 6}],
            [{'currency': 'USD', 'amount': 0}],
            [{'currency': 'USD', 'amount': -5}],
            [{'currency': 'USD', 'amount': 'five'}],
            [{'currency': 'USD'}],
            [{'currency': 'JPY', 'amount': '749.50'}],
            [{'currency': 'BDT', 'amount': 500}],
        ]
        for other_prices in cases:
            response = self.client.patch(detail(tier('basic').pk), {'other_prices': other_prices}, format='json')
            self.assertEqual(response.status_code, 400, (other_prices, response.data))
            self.assertIsInstance(response.data['errors']['other_prices'][0], str)
        self.assertEqual(tier('basic').other_prices, [])

    def test_a_currency_with_no_smaller_unit_takes_whole_amounts(self):
        response = self.client.post(LIST, {'name': 'Tokyo', 'currency': 'JPY', 'price': '499.50'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('price', response.data['errors'])

        # Changing only the currency still has to suit the price the plan keeps.
        self.client.patch(detail(tier('basic').pk), {'price': '199.50'}, format='json')
        response = self.client.patch(detail(tier('basic').pk), {'currency': 'JPY'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('price', response.data['errors'])

    def test_the_main_currency_cannot_also_be_another_price(self):
        self.client.patch(detail(tier('basic').pk), {'other_prices': [{'currency': 'USD', 'amount': 5}]},
                          format='json')
        response = self.client.patch(detail(tier('basic').pk), {'currency': 'USD'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('other_prices', response.data['errors'])

        swapped = self.client.patch(detail(tier('basic').pk), {
            'currency': 'USD', 'price': 5, 'other_prices': [{'currency': 'BDT', 'amount': 199}],
        }, format='json')
        self.assertEqual(swapped.status_code, 200, swapped.data)
        self.assertEqual((swapped.data['currency'], swapped.data['other_prices']),
                         ('USD', [{'currency': 'BDT', 'amount': '199.00'}]))

    def test_a_free_plan_is_free_everywhere(self):
        response = self.client.patch(detail(tier('free').pk), {'other_prices': [{'currency': 'USD', 'amount': 5}]},
                                     format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['other_prices'], [])

        self.client.patch(detail(tier('basic').pk), {'other_prices': [{'currency': 'USD', 'amount': 5}]},
                          format='json')
        response = self.client.patch(detail(tier('basic').pk), {'price': 0}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(tier('basic').other_prices, [])


class TierDeleteTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.admin_session())

    def test_an_empty_plan_is_deleted(self):
        response = self.client.delete(detail(tier('advanced').pk))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(SubscriptionTier.objects.filter(slug='advanced').exists())

    def test_the_default_plan_cannot_be_deleted(self):
        response = self.client.delete(detail(tier('free').pk))
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'default_tier')

    def test_a_plan_with_subscribers_needs_somewhere_to_move_them(self):
        customer = self.user_for(self.make_customer())
        User.objects.filter(pk=customer.pk).update(subscription_tier='advanced')

        refused = self.client.delete(detail(tier('advanced').pk))
        self.assertEqual(refused.status_code, 409, refused.data)
        self.assertEqual(refused.data['code'], 'tier_in_use')

        moved = self.client.delete(f"{detail(tier('advanced').pk)}?move_to={tier('basic').pk}")
        self.assertEqual(moved.status_code, 204)
        customer.refresh_from_db()
        self.assertEqual(customer.subscription_tier_id, 'basic')

    def test_moving_subscribers_onto_the_plan_being_deleted_is_refused(self):
        advanced = tier('advanced')
        response = self.client.delete(f'{detail(advanced.pk)}?move_to={advanced.pk}')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('move_to', response.data['errors'])


class TierCatalogueTests(AuthTestCase):
    def test_anyone_can_read_the_plans(self):
        response = self.client.get(CATALOGUE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row['slug'] for row in response.data], ['free', 'basic', 'advanced'])
        self.assertEqual(set(response.data[0]), {
            'slug', 'name', 'currency', 'price', 'other_prices', 'monthly_credits', 'features', 'is_featured',
            'is_default',
        })
        self.assertEqual([row['monthly_credits'] for row in response.data], [3, 30, None])


class AdminUserPlanTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.admin_session())
        self.customer = self.user_for(self.make_customer())

    def test_an_account_can_move_to_a_new_plan(self):
        created = self.client.post(LIST, {'name': 'Gold', 'price': 799}, format='json').data
        response = self.client.patch(f'/api/admin/users/{self.customer.pk}/',
                                     {'subscription_tier': created['slug']}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['subscription_tier'], 'gold')

    def test_an_unknown_plan_is_refused(self):
        response = self.client.patch(f'/api/admin/users/{self.customer.pk}/',
                                     {'subscription_tier': 'platinum'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('subscription_tier', response.data['errors'])


class DefaultTierTests(AuthTestCase):
    def test_an_emptied_table_gets_the_free_plan_back(self):
        User.objects.all().delete()
        SubscriptionTier.objects.all().delete()
        self.assertEqual(default_tier_slug(), 'free')
        self.assertTrue(tier('free').is_default)
