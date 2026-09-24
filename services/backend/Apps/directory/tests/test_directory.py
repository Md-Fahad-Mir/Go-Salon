"""One salon, in full, to somebody who belongs to it.

The browsable directory these tests used to cover is gone — see `views.py`.
What is left is the endpoint the booking wizard reads a salon's menu, chairs,
address and week from, and the two things worth pinning about it are that the
payload still carries all of that, and that nobody outside the salon can see
any of it.
"""

from __future__ import annotations

from unittest.mock import patch

from Apps.services.models import Service, ServiceCategory
from Apps.tenants.models import Tenant
from Apps.tenants.provisioning import tenant_for
from Apps.users.models import BarberProfile, Salon, User
from Apps.users.tests.base import AuthTestCase

LISTINGS = '/api/listings/'

# Dhanmondi, roughly.
HERE = {'lat': 23.7461, 'lng': 90.3742}


class ListingTestCase(AuthTestCase):
    """Shared plumbing: joining a salon, and reading one."""

    def join(self, session, tenant) -> None:
        """Through the real endpoint, so a membership here is a membership."""
        self.as_user(session)
        response = self.client.post(
            '/api/tenants/join/', {'join_token': tenant.join_token}, format='json')
        self.assertIn(response.status_code, (200, 201), response.data)

    def listing_of(self, salon) -> str:
        return f'salon-{salon.pk}'

    def fetch(self, listing_id: str, expect: int = 200, **params) -> dict:
        response = self.client.get(f'{LISTINGS}{listing_id}/', {**HERE, **params})
        self.assertEqual(response.status_code, expect, response.data)
        return response.data


class AccessTests(ListingTestCase):
    """Who may read a salon, now that reading one is not browsing."""

    def setUp(self):
        super().setUp()
        self.owner_session = self.make_owner()
        self.salon = Salon.objects.get(owner_id=self.owner_session['user']['id'])
        self.tenant = Tenant.objects.get(salon=self.salon)
        self.listing = self.listing_of(self.salon)

    def test_a_customer_who_has_joined_sees_the_salon(self):
        customer = self.make_customer()
        self.join(customer, self.tenant)
        self.assertEqual(self.fetch(self.listing)['name'], 'Glow Beauty Parlour')

    def test_a_customer_who_has_not_joined_gets_nothing(self):
        """A 404, not a 403.

        The same answer a salon that does not exist gets, and deliberately so:
        `MyTenantView` gives one answer to "never a member, already removed, or
        no such salon", and `TenantContext` refuses to tell an unknown id from
        an inactive one, both so that nobody can map the platform by guessing
        `salon-1`, `salon-2`, `salon-3`. A 403 here would confirm every id it
        refused.
        """
        self.as_user(self.make_customer(phone='01777000888'))
        self.fetch(self.listing, expect=404)

    def test_a_customer_who_left_stops_seeing_it(self):
        customer = self.make_customer()
        self.join(customer, self.tenant)
        self.fetch(self.listing)                       # in

        removed = self.client.delete(f'/api/tenants/mine/{self.tenant.pk}/')
        self.assertEqual(removed.status_code, 204, removed.data)
        self.fetch(self.listing, expect=404)           # and out

    def test_a_stranger_who_owns_another_salon_gets_nothing(self):
        other = self.make_owner(phone='01911000999', email='other@example.com',
                                business_name='Rival Salon')
        self.as_user(other)
        self.fetch(self.listing, expect=404)

    def test_the_owner_sees_their_own_salon(self):
        self.as_user(self.owner_session)
        self.assertEqual(self.fetch(self.listing)['name'], 'Glow Beauty Parlour')

    def test_a_hired_stylist_sees_the_salon_they_work_in(self):
        self.as_user(self.owner_session)
        hired = self.client.post('/api/salon/employees/', {
            'phone': '01755000009', 'name': 'Hasan Mahmud', 'password': 'chairside2026',
        }, format='json')
        self.assertEqual(hired.status_code, 201, hired.data)
        staff = User.objects.get(phone='+8801755000009')
        staff.is_phone_verified = True
        staff.save(update_fields=['is_phone_verified'])

        self.as_user(self.sign_in(staff.phone).data)
        self.assertEqual(self.fetch(self.listing)['name'], 'Glow Beauty Parlour')

    def test_an_independent_barber_sees_their_own_trade(self):
        barber = self.make_barber()
        profile = BarberProfile.objects.get(user_id=barber['user']['id'])
        self.as_user(barber)
        self.assertEqual(self.fetch(f'barber-{profile.pk}')['kind'], 'barber')

    def test_a_barber_cannot_read_another_barber(self):
        first = self.make_barber()
        profile = BarberProfile.objects.get(user_id=first['user']['id'])
        second = self.make_barber(phone='01811111199', email='second@example.com')
        self.as_user(second)
        self.fetch(f'barber-{profile.pk}', expect=404)

    def test_a_suspended_salon_is_closed_even_to_its_members(self):
        customer = self.make_customer()
        self.join(customer, self.tenant)
        self.tenant.is_active = False
        self.tenant.save(update_fields=['is_active'])
        # A suspended tenant is a 404 at every other door; this is not a way in.
        self.fetch(self.listing, expect=404)

    def test_an_unknown_listing_is_a_404(self):
        self.as_user(self.make_customer(phone='01777000777'))
        for bad in ('salon-9999', 'barber-9999', 'nonsense', 'salon-abc'):
            response = self.client.get(f'{LISTINGS}{bad}/')
            self.assertEqual(response.status_code, 404, bad)

    def test_signing_out_closes_it(self):
        self.client.credentials()
        response = self.client.get(f'{LISTINGS}{self.listing}/')
        self.assertEqual(response.status_code, 401)

    def test_the_browsable_directory_is_gone(self):
        """No list endpoint, for anybody. The product it served is withdrawn."""
        self.as_user(self.make_customer(phone='01777000666'))
        self.assertEqual(self.client.get('/api/directory/').status_code, 404)
        self.assertEqual(self.client.get(LISTINGS).status_code, 404)


class ContentTests(ListingTestCase):
    """A listing carries what a customer decides on — and what the booking
    wizard cannot get anywhere else."""

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
        self.salon = Salon.objects.get(owner_id=self.owner['user']['id'])
        self.join(self.make_customer(), Tenant.objects.get(salon=self.salon))

    def listing(self) -> dict:
        return self.fetch(self.listing_of(self.salon))

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
        barber = self.make_barber()
        profile = BarberProfile.objects.get(user_id=barber['user']['id'])
        self.as_user(barber)
        self.assertIsNone(self.fetch(f'barber-{profile.pk}')['price_from'])

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
        far = self.client.get(f'{LISTINGS}{self.listing_of(self.salon)}/',
                              {'lat': 23.8759, 'lng': 90.3795}).data
        self.assertGreater(far['distance_km'], 10)

    def test_distance_is_unknown_without_a_point(self):
        response = self.client.get(f'{LISTINGS}{self.listing_of(self.salon)}/')
        self.assertIsNone(response.data['distance_km'])

    def test_it_carries_the_menu_and_the_chairs(self):
        row = self.listing()
        self.assertEqual(len(row['services']), 2)
        self.assertEqual(row['staff'], [])
        self.assertEqual({service['name'] for service in row['services']},
                         {'Balayage', 'Blow dry'})

    def test_it_carries_everything_the_booking_wizard_reads(self):
        """The wizard has no other source for any of this.

        Pinned as a set rather than field by field so that a change which
        drops one is a failure here rather than a screen that quietly loses
        its Directions button — which is exactly what the frontend inventory
        found `address` was one edit away from.
        """
        row = self.listing()
        for field in ('id', 'kind', 'name', 'phone', 'location', 'hours',
                      'services', 'staff', 'avatar', 'acceptance', 'open_now'):
            with self.subTest(field=field):
                self.assertIn(field, row)

        # The one the wizard cannot get from anywhere else at all.
        self.assertEqual(row['location']['address'], 'Road 27')
        for field in ('area', 'city', 'address', 'latitude', 'longitude'):
            self.assertIn(field, row['location'])

        # A service a customer can pick has a price and a length.
        for field in ('id', 'name', 'price', 'duration'):
            self.assertIn(field, row['services'][0])

    def test_a_hidden_service_is_off_the_public_menu(self):
        self.as_user(self.owner)
        service = Service.objects.get(name='Blow dry')
        self.client.patch(f'/api/services/{service.pk}/', {'is_active': False}, format='json')
        self.join(self.make_customer(phone='01777000222'),
                  Tenant.objects.get(salon=self.salon))
        row = self.listing()
        self.assertEqual(row['service_count'], 1)
        self.assertEqual(row['price_from'], 4500.0)

class OpenNowClockTests(ListingTestCase):
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


class ChairHoursTests(ListingTestCase):
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
        self.salon = Salon.objects.get(owner_id=self.owner['user']['id'])

    def as_a_customer(self) -> None:
        """A customer of *this* salon. Signing one in is no longer enough —
        the listing is only readable by somebody who belongs to it."""
        self.join(self.make_customer(), Tenant.objects.get(salon=self.salon))

    def detail(self) -> dict:
        return self.fetch(self.listing_of(self.salon))

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
        self.as_a_customer()

        week = self.chair_week()
        monday = next(d for d in week if d['day'] == 'mon')
        friday = next(d for d in week if d['day'] == 'fri')
        self.assertEqual(monday['intervals'], [{'start': '09:00', 'end': '21:00'}])
        self.assertTrue(friday['is_closed'])

    def test_a_chair_with_its_own_hours_carries_those_instead(self):
        self.set_week('/api/schedule/me/', '09:00', '21:00', closed=('fri',))
        self.set_week(f'/api/schedule/employees/{self.chair}/', '10:00', '20:00')
        self.as_a_customer()

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
        self.as_a_customer()

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


class UnsavedHoursTests(ListingTestCase):
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
        salon = Salon.objects.get(owner_id=self.owner['user']['id'])
        self.join(self.make_customer(), Tenant.objects.get(salon=salon))
        row = self.fetch(self.listing_of(salon))
        self.assertTrue(all(day['is_closed'] for day in row['hours']))
        self.assertFalse(row['open_now'])

    def test_saving_them_is_what_makes_it_own(self):
        self.as_user(self.owner)
        self.client.put('/api/schedule/me/', {'days': [
            {'day': 'mon', 'is_closed': False,
             'intervals': [{'start': '10:00', 'end': '20:00'}]},
        ]}, format='json')
        self.assertEqual(self.client.get('/api/schedule/me/').data['source'], 'own')
