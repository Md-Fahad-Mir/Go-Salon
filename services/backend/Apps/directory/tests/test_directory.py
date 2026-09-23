"""The customer-facing directory: who appears, who does not, and in what order."""

from __future__ import annotations

from unittest.mock import patch

from Apps.services.models import Service, ServiceCategory
from Apps.tenants.provisioning import tenant_for
from Apps.users.models import BarberProfile, Salon, User
from Apps.users.tests.base import AuthTestCase

DIRECTORY = '/api/directory/'

# Dhanmondi, roughly.
HERE = {'lat': 23.7461, 'lng': 90.3742}


class DirectoryVisibilityTests(AuthTestCase):
    """A listing exists because somebody finished signing up for it."""

    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.barber = self.make_barber()
        self.as_user(self.make_customer())

    def names(self, **params) -> set[str]:
        response = self.client.get(DIRECTORY, {**HERE, **params})
        self.assertEqual(response.status_code, 200, response.data)
        return {row['name'] for row in response.data['results']}

    def test_a_customer_sees_salons_and_independent_barbers(self):
        self.assertEqual(self.names(), {'Glow Beauty Parlour', "Rafiq's Chair"})

    def test_each_listing_says_which_kind_it_is(self):
        rows = {row['name']: row for row in self.client.get(DIRECTORY, HERE).data['results']}
        self.assertEqual(rows['Glow Beauty Parlour']['kind'], 'salon')
        self.assertEqual(rows["Rafiq's Chair"]['kind'], 'barber')
        self.assertTrue(rows['Glow Beauty Parlour']['id'].startswith('salon-'))
        self.assertTrue(rows["Rafiq's Chair"]['id'].startswith('barber-'))

    def test_an_unverified_sign_up_is_not_a_business_yet(self):
        self.register('salon-owner', {
            'phone': '01913333333', 'name': 'Half Done', 'password': 'chairside2026',
            'accepted_terms': True, 'business_name': 'Never Verified',
            'business_type': 'salon', 'audience': 'unisex', 'address': 'Road 1, Dhaka',
        })
        self.assertNotIn('Never Verified', self.names())

    def test_a_disabled_account_drops_out_of_the_directory(self):
        user = User.objects.get(phone='+8801811111111')
        user.is_active = False
        user.save(update_fields=['is_active'])
        self.assertNotIn("Rafiq's Chair", self.names())

    def test_an_employee_is_a_chair_not_a_listing(self):
        self.as_user(self.owner)
        self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan Mahmud', 'password': 'chairside2026',
        }, format='json')
        self.as_user(self.make_customer(phone='01777000111'))
        self.assertNotIn('Hasan Mahmud', self.names())

    def test_signing_out_closes_the_directory(self):
        self.client.credentials()
        self.assertEqual(self.client.get(DIRECTORY).status_code, 401)


class DirectoryContentTests(AuthTestCase):
    """A listing carries what a customer decides on."""

    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.as_user(self.owner)
        self.client.patch('/api/profile/me/', {
            'tagline': 'Colour, cuts and bridal.',
            'bio': 'Open since 2016.',
            'avatar': 'https://cdn.example.com/logo.jpg',
            'amenities': ['Parking', 'Air conditioning'],
            'women_only': True,
            'location': {'area': 'Dhanmondi', 'city': 'Dhaka', 'address': 'Road 27',
                         'latitude': 23.7461, 'longitude': 90.3742},
        }, format='json')
        self.client.post('/api/services/', {
            'name': 'Balayage', 'price': '4500.00', 'duration_minutes': 120,
        }, format='json')
        self.client.post('/api/services/', {
            'name': 'Blow dry', 'price': '800.00', 'duration_minutes': 40,
        }, format='json')
        self.client.post('/api/profile/me/gallery/', {
            'image': 'https://cdn.example.com/room.jpg', 'caption': 'The front room',
        }, format='json')
        self.client.put('/api/schedule/me/', {'days': [
            {'day': 'sun', 'is_closed': False,
             'intervals': [{'start': '10:00', 'end': '14:00'},
                           {'start': '16:00', 'end': '20:00'}]},
            {'day': 'fri', 'is_closed': True, 'intervals': []},
        ]}, format='json')
        self.as_user(self.make_customer())

    def listing(self) -> dict:
        return self.client.get(DIRECTORY, HERE).data['results'][0]

    def test_carries_the_profile_the_owner_wrote(self):
        row = self.listing()
        self.assertEqual(row['tagline'], 'Colour, cuts and bridal.')
        self.assertEqual(row['bio'], 'Open since 2016.')
        self.assertEqual(row['avatar'], 'https://cdn.example.com/logo.jpg')
        self.assertEqual(row['amenities'], ['Parking', 'Air conditioning'])
        self.assertTrue(row['women_only'])
        self.assertEqual(row['location']['area'], 'Dhanmondi')

    def test_carries_the_gallery(self):
        self.assertEqual(len(self.listing()['gallery']), 1)

    def test_price_from_is_the_cheapest_thing_on_the_menu(self):
        row = self.listing()
        self.assertEqual(row['price_from'], 800.0)
        self.assertEqual(row['service_count'], 2)

    def test_a_business_with_no_menu_has_no_price_rather_than_zero(self):
        self.as_user(self.make_barber())
        row = next(r for r in self.client.get(DIRECTORY, HERE).data['results']
                   if r['kind'] == 'barber')
        self.assertIsNone(row['price_from'])

    def test_carries_the_real_week_including_a_split_day(self):
        sunday = next(d for d in self.listing()['hours'] if d['day'] == 'sun')
        self.assertEqual(sunday['intervals'],
                         [{'start': '10:00', 'end': '14:00'},
                          {'start': '16:00', 'end': '20:00'}])
        friday = next(d for d in self.listing()['hours'] if d['day'] == 'fri')
        self.assertTrue(friday['is_closed'])

    def test_reports_no_rating_rather_than_inventing_one(self):
        row = self.listing()
        self.assertIsNone(row['rating'])
        self.assertEqual(row['review_count'], 0)

    def test_distance_comes_back_in_kilometres(self):
        self.assertEqual(self.listing()['distance_km'], 0.0)
        far = self.client.get(DIRECTORY, {'lat': 23.8759, 'lng': 90.3795}).data['results'][0]
        self.assertGreater(far['distance_km'], 10)

    def test_distance_is_unknown_without_a_point(self):
        self.assertIsNone(self.client.get(DIRECTORY).data['results'][0]['distance_km'])

    def test_the_detail_view_adds_the_menu_and_the_chairs(self):
        listing_id = self.listing()['id']
        response = self.client.get(f'{DIRECTORY}{listing_id}/', HERE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data['services']), 2)
        self.assertEqual(response.data['staff'], [])
        names = {service['name'] for service in response.data['services']}
        self.assertEqual(names, {'Balayage', 'Blow dry'})

    def test_a_hidden_service_is_off_the_public_menu(self):
        self.as_user(self.owner)
        service = Service.objects.get(name='Blow dry')
        self.client.patch(f'/api/services/{service.pk}/', {'is_active': False}, format='json')
        self.as_user(self.make_customer(phone='01777000222'))
        row = self.listing()
        self.assertEqual(row['service_count'], 1)
        self.assertEqual(row['price_from'], 4500.0)

    def test_an_unknown_listing_is_a_404(self):
        for bad in ('salon-9999', 'barber-9999', 'nonsense', 'salon-abc'):
            self.assertEqual(self.client.get(f'{DIRECTORY}{bad}/').status_code, 404, bad)


class DirectoryFilterTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.make_owner()                       # women's parlour, Dhanmondi
        self.make_barber()                      # men's barber, Mirpur
        self.as_user(self.make_customer())

    def results(self, **params):
        response = self.client.get(DIRECTORY, {**HERE, **params})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['results']

    def names(self, **params) -> set[str]:
        return {row['name'] for row in self.results(**params)}

    def test_filters_by_kind(self):
        self.assertEqual(self.names(type='salon'), {'Glow Beauty Parlour'})
        self.assertEqual(self.names(type='barber'), {"Rafiq's Chair"})

    def test_filters_by_who_it_is_for(self):
        self.assertEqual(self.names(audience='women'), {'Glow Beauty Parlour'})
        self.assertEqual(self.names(audience='men'), {"Rafiq's Chair"})

    def test_unisex_appears_on_both_sides(self):
        self.as_user(self.make_barber(phone='01812222222', business_name='Everyone Cuts',
                                      audience='unisex'))
        self.as_user(self.make_customer(phone='01777000333'))
        self.assertIn('Everyone Cuts', self.names(audience='men'))
        self.assertIn('Everyone Cuts', self.names(audience='women'))

    def test_searches_name_area_and_menu(self):
        self.assertEqual(self.names(q='glow'), {'Glow Beauty Parlour'})
        self.assertEqual(self.names(q='mirpur'), {"Rafiq's Chair"})
        self.assertEqual(self.names(q='rafiq'), {"Rafiq's Chair"})
        self.assertEqual(self.names(q='nothing like this'), set())

    def test_search_matches_a_service_by_name(self):
        owner = User.objects.get(phone='+8801912345678')
        salon = Salon.objects.get(owner=owner)
        # `tenant` is NOT NULL, and through the API it is filled in by
        # `service_owner` -> `tenant_for`. Built here directly, the fixture has
        # to resolve it the same way the view would.
        Service.objects.create(salon=salon, tenant=tenant_for({'salon': salon}),
                               name='Keratin treatment',
                               price=6000, duration_minutes=180)
        self.assertEqual(self.names(q='keratin'), {'Glow Beauty Parlour'})

    def test_filters_by_area(self):
        self.assertEqual(self.names(area='Mirpur'), {"Rafiq's Chair"})

    def test_sorts_by_distance_with_the_unpinned_last(self):
        # The barber never set coordinates, so it cannot be the nearest.
        rows = self.results(sort='distance')
        self.assertEqual(rows[0]['name'], 'Glow Beauty Parlour')
        self.assertIsNone(rows[-1]['distance_km'])

    def test_sorts_by_price_with_the_menuless_last(self):
        owner = User.objects.get(phone='+8801912345678')
        salon = Salon.objects.get(owner=owner)
        Service.objects.create(salon=salon, tenant=tenant_for({'salon': salon}),
                               name='Trim', price=300, duration_minutes=20)
        rows = self.results(sort='price')
        self.assertEqual(rows[0]['name'], 'Glow Beauty Parlour')
        self.assertIsNone(rows[-1]['price_from'])

    def test_open_now_reads_the_real_week(self):
        owner = self.sign_in('+8801912345678').data
        self.as_user(owner)
        self.client.put('/api/schedule/me/', {'days': [
            {'day': day, 'is_closed': False,
             'intervals': [{'start': '00:00', 'end': '23:59'}]}
            for day in ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')
        ]}, format='json')
        self.as_user(self.make_customer(phone='01777000444'))
        self.assertEqual(self.names(open_now='true'), {'Glow Beauty Parlour'})

    def test_a_shut_business_is_not_open_now(self):
        owner = self.sign_in('+8801912345678').data
        self.as_user(owner)
        self.client.put('/api/schedule/me/', {'days': [
            {'day': day, 'is_closed': True, 'intervals': []}
            for day in ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')
        ]}, format='json')
        self.as_user(self.make_customer(phone='01777000555'))
        self.assertEqual(self.names(open_now='true'), set())

    def test_the_limit_is_capped(self):
        response = self.client.get(DIRECTORY, {**HERE, 'limit': '5000'})
        self.assertLessEqual(len(response.data['results']), 100)

    def test_count_reports_the_whole_match_not_the_page(self):
        response = self.client.get(DIRECTORY, {**HERE, 'limit': 1})
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(len(response.data['results']), 1)


class OpenNowClockTests(AuthTestCase):
    """Opening hours are local times, so "now" has to be local too."""

    def test_lunchtime_counts_as_closed_between_two_stretches(self):
        from Apps.directory.hours import is_open_at

        week = [{'day': 'sun', 'is_closed': False,
                 'intervals': [{'start': '10:00', 'end': '14:00'},
                               {'start': '16:00', 'end': '20:00'}]}]
        week += [{'day': d, 'is_closed': True, 'intervals': []}
                 for d in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat')]

        from datetime import datetime
        from zoneinfo import ZoneInfo

        dhaka = ZoneInfo('Asia/Dhaka')
        sunday = datetime(2026, 9, 13, tzinfo=dhaka)   # a Sunday
        self.assertTrue(is_open_at(week, sunday.replace(hour=11)))
        self.assertFalse(is_open_at(week, sunday.replace(hour=15)))
        self.assertTrue(is_open_at(week, sunday.replace(hour=17)))
        self.assertFalse(is_open_at(week, sunday.replace(hour=21)))
        # Monday is shut all day.
        self.assertFalse(is_open_at(week, sunday.replace(day=14, hour=11)))


class ChairHoursTests(AuthTestCase):
    """A chair's week travels with the listing.

    The customer's calendar greys out days nobody works, and it has to reach
    the same answer the booking endpoint does — otherwise it hides times the
    server would happily sell. The rule being pinned is the one
    `Apps.bookings.availability.chair_hours` applies: a chair with its own
    hours keeps them, a chair without keeps the salon's.
    """

    WEEK = ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')

    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.as_user(self.owner)
        hired = self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan Mahmud', 'password': 'chairside2026',
        }, format='json')
        self.assertEqual(hired.status_code, 201, hired.data)
        self.chair = hired.data['id']

    def detail(self) -> dict:
        from Apps.users.models import Salon

        salon = Salon.objects.first()
        response = self.client.get(f'/api/directory/salon-{salon.id}/', HERE)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def chair_week(self) -> list[dict]:
        return next(s for s in self.detail()['staff'] if s['id'] == str(self.chair))['hours']

    def set_week(self, url: str, start: str, end: str, closed=()):
        response = self.client.put(url, {'days': [
            {'day': day, 'is_closed': day in closed,
             'intervals': [] if day in closed else [{'start': start, 'end': end}]}
            for day in self.WEEK
        ]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_a_chair_with_no_hours_of_its_own_carries_the_salons(self):
        self.set_week('/api/schedule/me/', '09:00', '21:00', closed=('fri',))
        self.as_user(self.make_customer())

        week = self.chair_week()
        monday = next(d for d in week if d['day'] == 'mon')
        friday = next(d for d in week if d['day'] == 'fri')
        self.assertEqual(monday['intervals'], [{'start': '09:00', 'end': '21:00'}])
        self.assertTrue(friday['is_closed'])

    def test_a_chair_with_its_own_hours_carries_those_instead(self):
        self.set_week('/api/schedule/me/', '09:00', '21:00', closed=('fri',))
        self.set_week(f'/api/schedule/employees/{self.chair}/', '10:00', '20:00')
        self.as_user(self.make_customer())

        week = self.chair_week()
        self.assertEqual(
            next(d for d in week if d['day'] == 'mon')['intervals'],
            [{'start': '10:00', 'end': '20:00'}],
        )
        # The salon shuts on Fridays; this chair does not, and the customer's
        # calendar has to offer the day the server would sell.
        self.assertFalse(next(d for d in week if d['day'] == 'fri')['is_closed'])

    def test_a_chair_can_work_at_a_salon_that_never_saved_a_week(self):
        """The reported bug, from the data that caused it.

        The owner never saved the salon's hours — the hours screen offers a
        week to start from, and a week that is only *offered* is not stored.
        The stylist set her own. The salon therefore reads as closed all week
        while her chair is open ten to eight, and the calendar must follow the
        chair.
        """
        self.set_week(f'/api/schedule/employees/{self.chair}/', '10:00', '20:00')
        self.as_user(self.make_customer())

        listing = self.detail()
        self.assertTrue(all(day['is_closed'] for day in listing['hours']),
                        'the salon itself has no hours')
        chair = next(s for s in listing['staff'] if s['id'] == str(self.chair))
        self.assertTrue(all(not day['is_closed'] for day in chair['hours']),
                        'but the chair works every day')
        self.assertEqual(
            next(d for d in chair['hours'] if d['day'] == 'mon')['intervals'],
            [{'start': '10:00', 'end': '20:00'}],
        )


class UnsavedHoursTests(AuthTestCase):
    """A week that is only *offered* is not a week that is set.

    `/api/schedule/me/` answers a business that has never saved hours with a
    suggested week and `source: "default"`. It looks exactly like a configured
    one, which is the trap: an owner reads ten-to-eight off the screen, never
    presses save, and every customer is told the salon is shut. The flag is
    what lets the app say so, so it is pinned here.
    """

    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()

    def test_a_business_that_never_saved_hours_is_told_they_are_only_a_default(self):
        self.as_user(self.owner)
        response = self.client.get('/api/schedule/me/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['source'], 'default')
        # And the suggestion is a real-looking week, not a blank one — which is
        # precisely why it has to be labelled.
        monday = next(d for d in response.data['days'] if d['day'] == 'mon')
        self.assertFalse(monday['is_closed'])
        self.assertTrue(monday['intervals'])

    def test_and_customers_are_meanwhile_shown_a_business_that_is_shut(self):
        self.as_user(self.make_customer())
        row = self.client.get(DIRECTORY, HERE).data['results'][0]
        self.assertTrue(all(day['is_closed'] for day in row['hours']))
        self.assertFalse(row['open_now'])

    def test_saving_them_is_what_makes_it_own(self):
        self.as_user(self.owner)
        self.client.put('/api/schedule/me/', {'days': [
            {'day': 'mon', 'is_closed': False,
             'intervals': [{'start': '10:00', 'end': '20:00'}]},
        ]}, format='json')
        self.assertEqual(self.client.get('/api/schedule/me/').data['source'], 'own')
