"""What each portfolio screen needs, and the line between them.

No endpoint here is new. The Salon Portfolio, the barber's profile and the
employee's profile are all assembled from `/api/profile/me/`, `/api/services/`,
`/api/salon/employees/`, `/api/schedule/me/` and `/api/profile/me/gallery/` —
five endpoints that already existed. What was not written down is the
*contract*: which fields each screen leans on, and — the part worth guarding —
that a salon's portfolio and a person's portfolio never leak into each other.

That separation is not a display preference. A salon's pictures are the shop's
and a stylist's are her own trade record; she takes hers with her when she
leaves, and the salon keeps its own. The gallery endpoint decides which of the
two a caller is writing to purely from their role, and these tests hold it to
that.
"""

from __future__ import annotations

from Apps.users.models import Salon, User
from Apps.users.tests.base import AuthTestCase

WEEK = ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')


class SalonPortfolioTests(AuthTestCase):
    """Everything the owner's Salon tab renders."""

    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.as_user(self.owner)
        self.client.patch('/api/profile/me/', {
            'tagline': 'Colour, cuts and bridal.',
            'bio': 'Open since 2016.',
            'avatar': 'https://cdn.example.com/logo.jpg',
            'cover_image': 'https://cdn.example.com/cover.jpg',
            'business_phone': '01911111111',
            'contact_email': 'hello@glow.example',
            'amenities': ['Parking', 'Air conditioning'],
            'location': {'area': 'Dhanmondi', 'city': 'Dhaka', 'address': 'Road 27'},
        }, format='json')
        self.client.post('/api/services/', {
            'name': 'Balayage', 'price': '4500.00', 'duration_minutes': 120,
        }, format='json')
        self.client.post('/api/services/', {
            'name': 'Blow dry', 'price': '800.00', 'duration_minutes': 40,
        }, format='json')
        self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan Mahmud', 'password': 'chairside2026',
            'title': 'Senior barber',
        }, format='json')
        self.client.put('/api/schedule/me/', {'days': [
            {'day': day, 'is_closed': day == 'fri',
             'intervals': [] if day == 'fri' else [{'start': '10:00', 'end': '20:00'}]}
            for day in WEEK
        ]}, format='json')

    def test_the_salon_itself_carries_identity_contact_and_place(self):
        salon = self.client.get('/api/profile/me/').data['salon']
        self.assertEqual(salon['name'], 'Glow Beauty Parlour')
        self.assertEqual(salon['tagline'], 'Colour, cuts and bridal.')
        self.assertEqual(salon['bio'], 'Open since 2016.')
        self.assertEqual(salon['avatar'], 'https://cdn.example.com/logo.jpg')
        self.assertEqual(salon['cover_image'], 'https://cdn.example.com/cover.jpg')
        self.assertEqual(salon['contact_email'], 'hello@glow.example')
        self.assertTrue(salon['business_phone'])
        self.assertEqual(salon['location']['area'], 'Dhanmondi')
        self.assertEqual(salon['amenities'], ['Parking', 'Air conditioning'])

    def test_the_menu_comes_with_price_and_duration(self):
        menu = self.client.get('/api/services/').data
        self.assertEqual({row['name'] for row in menu}, {'Balayage', 'Blow dry'})
        cheapest = min(float(row['price']) for row in menu)
        self.assertEqual(cheapest, 800.0)
        self.assertTrue(all(row['duration_minutes'] for row in menu))

    def test_the_team_comes_with_each_persons_trade_record(self):
        roster = self.client.get('/api/salon/employees/').data
        self.assertEqual(len(roster), 1)
        chair = roster[0]
        # The person and their trade record are nested, and rightly so: the
        # employment is the salon's row, the profile is theirs.
        self.assertEqual(chair['user']['name'], 'Hasan Mahmud')
        self.assertEqual(chair['title'], 'Senior barber')
        self.assertTrue(chair['is_active'])
        # The fields the team list renders. Blank is fine; missing is not.
        for field in ('avatar', 'specialties', 'experience_years'):
            self.assertIn(field, chair['profile'])

    def test_the_week_is_the_salons_own(self):
        week = self.client.get('/api/schedule/me/').data
        self.assertEqual(week['source'], 'own')
        friday = next(d for d in week['days'] if d['day'] == 'fri')
        self.assertTrue(friday['is_closed'])

    def test_the_gallery_an_owner_writes_is_the_salons(self):
        made = self.client.post('/api/profile/me/gallery/', {
            'image': 'https://cdn.example.com/room.jpg', 'caption': 'The front room',
        }, format='json')
        self.assertEqual(made.status_code, 201, made.data)
        salon = Salon.objects.get(owner__phone__endswith='12345678')
        self.assertEqual(salon.gallery.count(), 1)
        self.assertEqual(self.client.get('/api/profile/me/').data['salon']['gallery'][0]['caption'],
                         'The front room')


class ProfessionalPortfolioTests(AuthTestCase):
    """A barber's own portfolio, and an employee's — never the salon's."""

    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.as_user(self.owner)
        hired = self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan Mahmud', 'password': 'chairside2026',
            'title': 'Senior barber',
        }, format='json')
        self.chair = hired.data['id']
        cut = self.client.post('/api/services/', {
            'name': 'Skin fade', 'price': '600.00', 'duration_minutes': 45,
            'eligible_employee_ids': [self.chair],
        }, format='json')
        self.assertEqual(cut.status_code, 201, cut.data)
        self.everyones = self.client.post('/api/services/', {
            'name': 'Beard trim', 'price': '300.00', 'duration_minutes': 20,
        }, format='json').data
        self.client.post('/api/profile/me/gallery/', {
            'image': 'https://cdn.example.com/salon-room.jpg', 'caption': "The salon's room",
        }, format='json')

        user = User.objects.get(phone='+8801755000004')
        user.is_phone_verified = True
        user.save(update_fields=['is_phone_verified'])
        self.employee = self.sign_in('01755000004', 'chairside2026').data

    # --- the employee -----------------------------------------------------

    def test_an_employee_reads_their_own_trade_record_not_the_salons(self):
        self.as_user(self.employee)
        self.client.patch('/api/profile/me/', {
            'bio': 'Ten years on skin fades.', 'specialties': ['Fades', 'Beard work'],
            'experience_years': 10, 'avatar': 'https://cdn.example.com/hasan.jpg',
        }, format='json')

        me = self.client.get('/api/profile/me/').data
        self.assertEqual(me['barber']['bio'], 'Ten years on skin fades.')
        self.assertEqual(me['barber']['specialties'], ['Fades', 'Beard work'])
        self.assertEqual(me['barber']['experience_years'], 10)
        self.assertEqual(me['barber']['avatar'], 'https://cdn.example.com/hasan.jpg')
        # Their employment says where they work; it is not a salon of their own.
        self.assertEqual(me['employment']['title'], 'Senior barber')

    def test_an_employees_gallery_is_theirs_and_not_the_salons(self):
        self.as_user(self.employee)
        made = self.client.post('/api/profile/me/gallery/', {
            'image': 'https://cdn.example.com/my-fade.jpg', 'caption': 'A fade I did',
        }, format='json')
        self.assertEqual(made.status_code, 201, made.data)

        mine = self.client.get('/api/profile/me/gallery/').data
        captions = [row['caption'] for row in mine]
        self.assertIn('A fade I did', captions)
        # The shop's own picture is not part of her portfolio.
        self.assertNotIn("The salon's room", captions)

        # And hers has not been added to the salon's.
        self.as_user(self.owner)
        salon_captions = [row['caption'] for row in self.client.get('/api/profile/me/gallery/').data]
        self.assertEqual(salon_captions, ["The salon's room"])

    def test_an_employee_can_tell_which_services_are_theirs(self):
        """The menu arrives whole; which of it is *theirs* has to be readable.

        A service naming nobody is open to every active chair, so
        `available_to_all_staff` is as much a yes as being named.
        """
        self.as_user(self.employee)
        menu = self.client.get('/api/services/').data
        by_name = {row['name']: row for row in menu}

        self.assertIn(self.chair, by_name['Skin fade']['eligible_employee_ids'])
        self.assertFalse(by_name['Skin fade']['available_to_all_staff'])
        self.assertTrue(by_name['Beard trim']['available_to_all_staff'])

    def test_an_employee_cannot_reprice_the_salons_menu(self):
        self.as_user(self.employee)
        refused = self.client.post('/api/services/', {
            'name': 'Mine now', 'price': '1.00', 'duration_minutes': 10,
        }, format='json')
        self.assertEqual(refused.status_code, 403, refused.data)

    def test_an_employees_hours_say_whose_they_are(self):
        self.as_user(self.employee)
        week = self.client.get('/api/schedule/me/').data
        # Nothing of their own yet, so these are the salon's and say so.
        self.assertIn(week['source'], {'salon', 'default'})

    # --- the independent barber -------------------------------------------

    def test_a_barber_carries_their_whole_professional_record(self):
        barber = self.make_barber()
        self.as_user(barber)
        self.client.patch('/api/profile/me/', {
            'title': 'Master barber', 'bio': 'Fifteen years of scissor work.',
            'specialties': ['Scissor cuts', 'Beard sculpt'], 'experience_years': 15,
            'avatar': 'https://cdn.example.com/rafiq.jpg',
            'instagram': 'rafiqcuts',
        }, format='json')
        self.client.post('/api/services/', {
            'name': 'Scissor cut', 'price': '900.00', 'duration_minutes': 50,
        }, format='json')
        self.client.post('/api/profile/me/gallery/', {
            'image': 'https://cdn.example.com/cut.jpg', 'caption': 'Last week',
        }, format='json')

        me = self.client.get('/api/profile/me/').data
        self.assertEqual(me['barber']['title'], 'Master barber')
        self.assertEqual(me['barber']['bio'], 'Fifteen years of scissor work.')
        self.assertEqual(me['barber']['experience_years'], 15)
        self.assertEqual(me['barber']['specialties'], ['Scissor cuts', 'Beard sculpt'])
        self.assertEqual(me['barber']['instagram'], 'rafiqcuts')
        self.assertEqual(len(me['barber']['gallery']), 1)
        # A barber working alone has no salon to mix in.
        self.assertIsNone(me['salon'])

        menu = self.client.get('/api/services/').data
        self.assertEqual([row['name'] for row in menu], ['Scissor cut'])
