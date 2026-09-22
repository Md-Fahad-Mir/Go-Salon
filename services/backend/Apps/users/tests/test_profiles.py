"""Profiles: what each role may read and write about itself.

The rule under test throughout is that the serializer a PATCH is checked
against comes from the caller's own role, so no request can reach fields that
belong to somebody else.
"""

from __future__ import annotations

from Apps.users.models import BarberProfile, CustomerProfile, Role, Salon, SalonEmployee

from .base import AuthTestCase

PROFILE = '/api/profile/me/'

TINY_PNG = (
    'data:image/png;base64,'
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
)


class CustomerProfileTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.session = self.make_customer()
        self.as_user(self.session)

    def test_reads_its_own_profile(self):
        response = self.client.get(PROFILE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['role'], Role.CUSTOMER)
        self.assertEqual(response.data['account']['phone'], '+8801712345678')
        self.assertEqual(response.data['customer']['hair_type'], 'wavy')
        self.assertEqual(response.data['customer']['location']['area'], 'Dhanmondi')
        # Nothing that belongs to a professional.
        self.assertIsNone(response.data['barber'])
        self.assertIsNone(response.data['salon'])

    def test_updates_details_hair_and_address(self):
        response = self.client.patch(PROFILE, {
            'name': 'Ahmed H',
            'email': 'new@example.com',
            'avatar': TINY_PNG,
            'hair_type': 'curly',
            'hair_length': 'long',
            'location': {'area': 'Gulshan', 'address': 'Road 11',
                         'latitude': 23.79, 'longitude': 90.41},
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        profile = CustomerProfile.objects.get(user__phone='+8801712345678')
        self.assertEqual(profile.hair_type, 'curly')
        self.assertEqual(profile.hair_length, 'long')
        self.assertEqual(profile.area, 'Gulshan')
        self.assertAlmostEqual(profile.latitude, 23.79)
        self.assertEqual(profile.avatar, TINY_PNG)
        self.assertEqual(profile.user.name, 'Ahmed H')
        self.assertEqual(profile.user.email, 'new@example.com')

    def test_gps_is_optional(self):
        response = self.client.patch(
            PROFILE, {'location': {'area': 'Uttara'}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        profile = CustomerProfile.objects.get(user__phone='+8801712345678')
        self.assertEqual(profile.area, 'Uttara')
        # The pin that was there is left alone rather than wiped.
        self.assertAlmostEqual(profile.latitude, 23.74)

    def test_refuses_coordinates_off_the_planet(self):
        response = self.client.patch(
            PROFILE, {'location': {'latitude': 120}}, format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_cannot_change_its_own_phone_number(self):
        self.client.patch(PROFILE, {'phone': '+8801999999999'}, format='json')
        self.assertTrue(
            CustomerProfile.objects.filter(user__phone='+8801712345678').exists()
        )

    def test_cannot_reach_a_salons_fields(self):
        response = self.client.patch(
            PROFILE, {'business_name': 'Not My Salon'}, format='json')
        # Accepted as a no-op — the field is not in a customer's serializer —
        # and crucially no salon appears.
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(Salon.objects.filter(name='Not My Salon').exists())

    def test_rejects_a_picture_that_is_not_one(self):
        response = self.client.patch(
            PROFILE, {'avatar': 'javascript:alert(1)'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'image_invalid')

    def test_signed_out_callers_are_refused(self):
        self.client.credentials()
        self.assertEqual(self.client.get(PROFILE).status_code, 401)


class BarberProfileTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.session = self.make_barber()
        self.as_user(self.session)

    def test_reads_its_own_trade(self):
        response = self.client.get(PROFILE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['role'], Role.BARBER)
        self.assertEqual(response.data['barber']['business_name'], "Rafiq's Chair")
        self.assertEqual(response.data['barber']['audience'], 'men')
        self.assertEqual(response.data['barber']['experience_years'], 7)
        self.assertEqual(response.data['barber']['gallery'], [])

    def test_updates_the_whole_card(self):
        response = self.client.patch(PROFILE, {
            'title': 'Master Barber',
            'bio': 'Fifteen years of fades on Mirpur Road.',
            'avatar': TINY_PNG,
            'cover_image': 'https://cdn.example.com/cover.jpg',
            'experience_years': 12,
            'specialties': ['Skin fade', ' Beard sculpt ', ''],
            'contact_phone': '01755000123',
            'contact_email': 'rafiq@chair.example',
            'instagram': 'rafiqcuts',
            'accepting_clients': False,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        profile = BarberProfile.objects.get(user__phone='+8801811111111')
        self.assertEqual(profile.title, 'Master Barber')
        self.assertEqual(profile.experience_years, 12)
        self.assertEqual(profile.contact_phone, '+8801755000123')
        self.assertFalse(profile.accepting_clients)
        # Blanks are dropped and whitespace trimmed rather than stored.
        self.assertEqual(profile.specialties, ['Skin fade', 'Beard sculpt'])

    def test_the_experience_band_follows_the_number(self):
        self.client.patch(PROFILE, {'experience_years': 12}, format='json')
        profile = BarberProfile.objects.get(user__phone='+8801811111111')
        self.assertEqual(profile.experience_range, '10_plus')

        self.client.patch(PROFILE, {'experience_years': 2}, format='json')
        profile.refresh_from_db()
        self.assertEqual(profile.experience_range, '1_3')

    def test_picks_a_category_from_the_catalogue(self):
        from Apps.services.models import ServiceCategory

        category = ServiceCategory.objects.get(owner=None, name='Haircut')
        response = self.client.patch(
            PROFILE, {'category_id': category.pk}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['barber']['category_name'], 'Haircut')

    def test_refuses_a_category_belonging_to_someone_else(self):
        from Apps.services.models import ServiceCategory

        stranger = self.make_owner()
        mine = ServiceCategory.objects.create(
            name='Private', owner_id=stranger['user']['id']
        )
        response = self.client.patch(PROFILE, {'category_id': mine.pk}, format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_refuses_an_absurd_experience(self):
        response = self.client.patch(PROFILE, {'experience_years': 200}, format='json')
        self.assertEqual(response.status_code, 400, response.data)


class SalonOwnerProfileTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.session = self.make_owner()
        self.as_user(self.session)

    def test_reads_its_salon(self):
        response = self.client.get(PROFILE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['role'], Role.SALON_OWNER)
        self.assertEqual(response.data['salon']['name'], 'Glow Beauty Parlour')
        self.assertEqual(response.data['salon']['audience'], 'women')
        self.assertEqual(response.data['salon']['employee_count'], 0)

    def test_updates_the_business(self):
        response = self.client.patch(PROFILE, {
            'name': 'Shirin A',
            'business_name': 'Glow Studio',
            'tagline': 'Colour, cuts and bridal.',
            'bio': 'Open since 2016.',
            'avatar': TINY_PNG,
            'business_phone': '01755009999',
            'contact_email': 'hello@glow.example',
            'amenities': ['Air conditioning', 'Parking'],
            'women_only': True,
            'private_booth': True,
            'auto_accept': False,
            'location': {'address': 'Road 27, Dhanmondi',
                         'latitude': 23.7461, 'longitude': 90.3742},
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        salon = Salon.objects.get(owner__phone='+8801912345678')
        self.assertEqual(salon.name, 'Glow Studio')
        self.assertEqual(salon.tagline, 'Colour, cuts and bridal.')
        self.assertEqual(salon.business_phone, '+8801755009999')
        self.assertTrue(salon.women_only)
        self.assertFalse(salon.auto_accept)
        self.assertAlmostEqual(salon.latitude, 23.7461)
        self.assertEqual(salon.owner.name, 'Shirin A')

    def test_a_trade_licence_is_neither_asked_for_nor_kept(self):
        """It was dropped: a number typed into a box was never a check, and a
        field nobody reads is a licence held on file for nothing."""
        response = self.client.patch(
            PROFILE, {'licence_number': 'TRAD-99812'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn('licence_number', response.data['salon'])
        salon = Salon.objects.get(owner__phone='+8801912345678')
        self.assertFalse(hasattr(salon, 'licence_number'))
        # And sending one does not quietly put them in the review queue.
        self.assertEqual(response.data['salon']['verification'], 'unverified')

    def test_an_owner_cannot_mark_their_own_salon_verified(self):
        self.client.patch(PROFILE, {'verification': 'verified'}, format='json')
        salon = Salon.objects.get(owner__phone='+8801912345678')
        self.assertEqual(salon.verification, 'unverified')


class EmployeeProfileTests(AuthTestCase):
    """An employee owns their trade; their salon owns the job."""

    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.as_user(self.owner)
        created = self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan Mahmud',
            'title': 'Stylist', 'password': 'chairside2026', 'commission_rate': 40,
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.employment_id = created.data['id']

        user = self.verified_employee('+8801755000004')
        self.employee = self.sign_in(user.phone).data
        self.as_user(self.employee)

    def verified_employee(self, phone: str):
        from Apps.users.models import User

        user = User.objects.get(phone=phone)
        user.is_phone_verified = True
        user.save(update_fields=['is_phone_verified'])
        return user

    def test_sees_its_own_record_and_its_salon(self):
        response = self.client.get(PROFILE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['role'], Role.SALON_EMPLOYEE)
        self.assertEqual(response.data['employment']['title'], 'Stylist')
        self.assertEqual(response.data['employment']['commission_rate'], 40)
        self.assertEqual(response.data['salon']['name'], 'Glow Beauty Parlour')
        # The owner made them a trade record to fill in.
        self.assertIsNotNone(response.data['barber'])

    def test_manages_its_own_bio_avatar_specialties_and_experience(self):
        response = self.client.patch(PROFILE, {
            'bio': 'Colour and balayage.',
            'avatar': TINY_PNG,
            'specialties': ['Balayage', 'Keratin'],
            'experience_years': 6,
            'title': 'Senior Stylist',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        profile = BarberProfile.objects.get(user__phone='+8801755000004')
        self.assertEqual(profile.bio, 'Colour and balayage.')
        self.assertEqual(profile.specialties, ['Balayage', 'Keratin'])
        self.assertEqual(profile.experience_range, '5_10')
        # The job title lives on the employment, where the salon can see it.
        employment = SalonEmployee.objects.get(pk=self.employment_id)
        self.assertEqual(employment.title, 'Senior Stylist')

    def test_cannot_touch_what_the_salon_owns(self):
        response = self.client.patch(PROFILE, {
            'business_name': 'My Own Salon',
            'audience': 'men',
            'accepting_clients': False,
            'commission_rate': 99,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        profile = BarberProfile.objects.get(user__phone='+8801755000004')
        self.assertEqual(profile.business_name, '')
        self.assertEqual(profile.audience, 'women')  # still the salon's
        self.assertTrue(profile.accepting_clients)
        employment = SalonEmployee.objects.get(pk=self.employment_id)
        self.assertEqual(employment.commission_rate, 40)

    def test_cannot_edit_the_salon_itself(self):
        self.client.patch(PROFILE, {'tagline': 'Mine now'}, format='json')
        salon = Salon.objects.get(name='Glow Beauty Parlour')
        self.assertEqual(salon.tagline, '')

    def test_cannot_reach_the_owners_roster(self):
        response = self.client.get('/api/salon/employees/')
        self.assertEqual(response.status_code, 403, response.data)

    def test_is_answered_with_its_own_name_not_the_salons(self):
        """The profile screen heads itself with `display_name`. An employee has
        no trading name of their own, and reading the salon's there told a
        stylist she was called Glow Beauty Parlour."""
        response = self.client.get(PROFILE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['account']['name'], 'Hasan Mahmud')
        self.assertEqual(response.data['barber']['display_name'], 'Hasan Mahmud')
        self.assertEqual(response.data['barber']['business_name'], '')
        # The salon is still there to be named as the place they work.
        self.assertEqual(response.data['salon']['name'], 'Glow Beauty Parlour')

    def test_sets_its_own_name_and_contact_number(self):
        response = self.client.patch(PROFILE, {
            'name': 'Hasan M. Mahmud',
            'contact_phone': '01755000099',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['account']['name'], 'Hasan M. Mahmud')

        profile = BarberProfile.objects.get(user__phone='+8801755000004')
        self.assertEqual(profile.contact_phone, '+8801755000099')

    def test_cannot_change_what_it_is_cleared_to_perform(self):
        """"What you do" is the salon's price list narrowed to this chair, and
        eligibility is written on the service. Hours are refused the same way
        by `/api/schedule/me/` — see `Apps.schedules.tests`."""
        from Apps.services.models import Service

        salon = Salon.objects.get(name='Glow Beauty Parlour')
        service = Service.objects.create(
            salon=salon, name='Balayage', price='4500.00', duration_minutes=90,
        )

        response = self.client.patch(
            f'/api/services/{service.pk}/',
            {'price': '1.00', 'eligible_employee_ids': [self.employment_id]},
            format='json',
        )
        self.assertEqual(response.status_code, 403, response.data)
        service.refresh_from_db()
        self.assertEqual(str(service.price), '4500.00')
        self.assertFalse(service.eligible_employees.exists())

    def test_cannot_move_itself_to_another_chair(self):
        """Where they work is the employment row, and it is the owner's."""
        response = self.client.patch(
            f'/api/salon/employees/{self.employment_id}/',
            {'title': 'Owner', 'commission_rate': 100},
            format='json',
        )
        self.assertEqual(response.status_code, 403, response.data)
        employment = SalonEmployee.objects.get(pk=self.employment_id)
        self.assertEqual(employment.title, 'Stylist')
        self.assertEqual(employment.commission_rate, 40)


class OwnerEditsEmployeeTests(AuthTestCase):
    """An owner made the account, so they can fill in the card behind it."""

    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.as_user(self.owner)
        created = self.client.post('/api/salon/employees/', {
            'phone': '01755000005', 'name': 'Rima Akter',
            'title': 'Stylist', 'password': 'chairside2026', 'commission_rate': 35,
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.employment_id = created.data['id']
        self.chair = f'/api/salon/employees/{self.employment_id}/'

    def test_writes_the_job_and_the_person_in_one_patch(self):
        response = self.client.patch(self.chair, {
            'title': 'Senior Colourist',
            'commission_rate': 45,
            'name': 'Rima Akter Chowdhury',
            'bio': 'Ten years of colour work.',
            'specialties': ['Balayage', 'Keratin'],
            'experience_years': 10,
            'avatar': TINY_PNG,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['title'], 'Senior Colourist')
        self.assertEqual(response.data['user']['name'], 'Rima Akter Chowdhury')
        self.assertEqual(response.data['profile']['bio'], 'Ten years of colour work.')

        employment = SalonEmployee.objects.get(pk=self.employment_id)
        self.assertEqual(employment.commission_rate, 45)
        profile = BarberProfile.objects.get(user=employment.user)
        self.assertEqual(profile.specialties, ['Balayage', 'Keratin'])
        self.assertEqual(profile.experience_years, 10)
        # The band follows the number, the same as on a self-edit.
        self.assertEqual(profile.experience_range, '10_plus')

    def test_refuses_a_blank_name(self):
        response = self.client.patch(self.chair, {'name': '   '}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(
            SalonEmployee.objects.get(pk=self.employment_id).user.name,
            'Rima Akter',
        )

    def test_cannot_reach_a_chair_in_somebody_elses_salon(self):
        other = self.make_owner(phone='01912000077')
        self.as_user(other)
        response = self.client.patch(self.chair, {'bio': 'Mine now'}, format='json')
        self.assertEqual(response.status_code, 404, response.data)
