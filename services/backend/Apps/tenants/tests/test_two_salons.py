"""An owner with two salons gets the one they asked for.

Every test here is the same shape, and it is the shape of the bug. Each of
these call sites used to answer "which business is this?" with
`user.salons.first()`, and `Salon.Meta.ordering` is `('name',)` — so the answer
was *the alphabetically first salon this person owns*. With one salon that is
indistinguishable from correct, which is why it survived. With two it silently
writes to the wrong shop.

So each fixture makes two salons named so that the one under test is **not**
the first alphabetically: `Zebra Cuts` is asked for, `Alpha Salon` is what the
old code would have returned. A test that passes because both salons happen to
be the same one proves nothing, so the assertions always name which.
"""

from __future__ import annotations

from Apps.portfolio.models import GalleryImage
from Apps.schedules.models import WorkingDay
from Apps.services.models import Service
from Apps.tenants.models import Tenant
from Apps.users.models import Salon, SalonEmployee, User
from Apps.users.tests.base import AuthTestCase

GALLERY = '/api/profile/me/gallery/'
TINY_PNG = (
    'data:image/png;base64,'
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
)
WEEK = ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')


class TwoSalonOwnerTests(AuthTestCase):
    """One owner, two salons, and every write aimed at the second one."""

    def setUp(self):
        super().setUp()
        self.session = self.make_owner(business_name='Alpha Salon')
        self.owner = User.objects.get(pk=self.session['user']['id'])
        self.first = Salon.objects.get(owner=self.owner, name='Alpha Salon')

        # The second shop, made the way Django admin would — the post_save
        # receiver from Step 6a-3 provisions its tenant.
        self.second = Salon.objects.create(owner=self.owner, name='Zebra Cuts')

        self.first_tenant = Tenant.objects.get(salon=self.first)
        self.second_tenant = Tenant.objects.get(salon=self.second)
        # The premise of every test below: the old `.first()` would pick Alpha.
        self.assertEqual(
            Salon.objects.filter(owner=self.owner).first().pk, self.first.pk,
            'fixture no longer reproduces the bug: Alpha must sort first',
        )

    # -- 2. services/views.py::service_owner ------------------------------

    def test_a_service_is_added_to_the_salon_the_request_names(self):
        self.as_user(self.session, tenant=self.second_tenant)
        made = self.client.post('/api/services/', {
            'name': 'Hot towel shave', 'price': '450.00', 'duration_minutes': 30,
        }, format='json')
        self.assertEqual(made.status_code, 201, made.data)

        service = Service.objects.get(pk=made.data['id'])
        self.assertEqual(service.salon_id, self.second.pk)
        self.assertEqual(service.tenant_id, self.second_tenant.pk)
        # The old behaviour, stated as the thing that must not happen.
        self.assertNotEqual(service.salon_id, self.first.pk)
        self.assertFalse(Service.objects.filter(salon=self.first).exists())

    def test_the_price_list_shows_only_the_named_salons_services(self):
        """Two shops, two menus, and never both at once.

        `visible_services` answered an owner with `filter(salon__owner=user)`
        — every salon they own — so a two-salon owner saw one merged price
        list with no way to tell which shop a line belonged to.
        """
        self.as_user(self.session, tenant=self.first_tenant)
        self.client.post('/api/services/', {
            'name': 'Alpha trim', 'price': '300.00', 'duration_minutes': 30,
        }, format='json')

        self.as_user(self.session, tenant=self.second_tenant)
        self.client.post('/api/services/', {
            'name': 'Zebra fade', 'price': '450.00', 'duration_minutes': 30,
        }, format='json')

        # Each shop's list has exactly its own line.
        self.as_user(self.session, tenant=self.second_tenant)
        names = [row['name'] for row in self.client.get('/api/services/').data]
        self.assertEqual(names, ['Zebra fade'])

        self.as_user(self.session, tenant=self.first_tenant)
        names = [row['name'] for row in self.client.get('/api/services/').data]
        self.assertEqual(names, ['Alpha trim'])

    def test_one_salons_service_cannot_be_read_or_edited_from_the_other(self):
        """`ServiceDetailView` shares `visible_services`, so it inherits this.

        Confirmed rather than assumed: the detail view looks its row up
        *through* the same helper, so a line belonging to the other shop is a
        404 on GET, PATCH and DELETE alike.
        """
        self.as_user(self.session, tenant=self.first_tenant)
        made = self.client.post('/api/services/', {
            'name': 'Alpha only', 'price': '300.00', 'duration_minutes': 30,
        }, format='json')
        self.assertEqual(made.status_code, 201, made.data)
        pk = made.data['id']

        self.as_user(self.session, tenant=self.second_tenant)
        self.assertEqual(self.client.get(f'/api/services/{pk}/').status_code, 404)
        self.assertEqual(
            self.client.patch(f'/api/services/{pk}/', {'price': '1.00'},
                              format='json').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/services/{pk}/').status_code, 404)

        # Still intact, and still readable from its own shop.
        self.as_user(self.session, tenant=self.first_tenant)
        still = self.client.get(f'/api/services/{pk}/')
        self.assertEqual(still.status_code, 200, still.data)
        self.assertEqual(still.data['price'], '300.00')

    # -- 3. schedules/views.py::own_owner ---------------------------------

    def test_opening_hours_are_set_on_the_salon_the_request_names(self):
        self.as_user(self.session, tenant=self.second_tenant)
        saved = self.client.put('/api/schedule/me/', {'days': [
            {'day': 'mon', 'is_closed': False,
             'intervals': [{'start': '09:00', 'end': '17:00'}]},
        ]}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)

        self.assertTrue(WorkingDay.objects.filter(salon=self.second).exists())
        self.assertFalse(WorkingDay.objects.filter(salon=self.first).exists())
        day = WorkingDay.objects.get(salon=self.second, weekday=1)
        self.assertEqual(day.tenant_id, self.second_tenant.pk)

    def test_each_salons_hours_are_read_back_separately(self):
        for tenant, start in ((self.first_tenant, '08:00'),
                              (self.second_tenant, '14:00')):
            self.as_user(self.session, tenant=tenant)
            self.client.put('/api/schedule/me/', {'days': [
                {'day': 'tue', 'is_closed': False,
                 'intervals': [{'start': start, 'end': '20:00'}]},
            ]}, format='json')

        self.as_user(self.session, tenant=self.second_tenant)
        week = self.client.get('/api/schedule/me/').data
        tuesday = next(d for d in week['days'] if d['day'] == 'tue')
        self.assertEqual(tuesday['intervals'][0]['start'], '14:00')

    # -- 4. portfolio/views.py::gallery_owner -----------------------------

    def test_a_picture_is_filed_under_the_salon_the_request_names(self):
        self.as_user(self.session, tenant=self.second_tenant)
        made = self.client.post(GALLERY, {'image': TINY_PNG}, format='json')
        self.assertEqual(made.status_code, 201, made.data)

        image = GalleryImage.objects.get(pk=made.data['id'])
        self.assertEqual(image.salon_id, self.second.pk)
        self.assertEqual(image.tenant_id, self.second_tenant.pk)
        self.assertFalse(GalleryImage.objects.filter(salon=self.first).exists())

        # And the other shop's gallery does not show it.
        self.as_user(self.session, tenant=self.first_tenant)
        self.assertEqual(self.client.get(GALLERY).data, [])

    # -- 6. serializers.py::SalonWriteSerializer.save ---------------------

    def test_renaming_edits_the_salon_the_request_names(self):
        self.as_user(self.session, tenant=self.second_tenant)
        saved = self.client.patch('/api/profile/me/', {
            'business_name': 'Zebra Cuts Renamed', 'tagline': 'Second shop',
        }, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)

        self.second.refresh_from_db()
        self.first.refresh_from_db()
        self.assertEqual(self.second.name, 'Zebra Cuts Renamed')
        self.assertEqual(self.second.tagline, 'Second shop')
        # The alphabetically-first shop is untouched — the whole point.
        self.assertEqual(self.first.name, 'Alpha Salon')
        self.assertEqual(self.first.tagline, '')

    # -- 5 & 7. get_profile / profile_payload -----------------------------

    def test_the_profile_payload_describes_the_salon_the_request_names(self):
        self.as_user(self.session, tenant=self.second_tenant)
        payload = self.client.get('/api/profile/me/').data
        self.assertEqual(payload['salon']['name'], 'Zebra Cuts')

        self.as_user(self.session, tenant=self.first_tenant)
        payload = self.client.get('/api/profile/me/').data
        self.assertEqual(payload['salon']['name'], 'Alpha Salon')

    def test_an_owner_of_two_salons_is_told_nothing_rather_than_guessed_at(self):
        """No tenant named, two to choose from: the payload carries no salon.

        The old code answered this with the alphabetically first shop, which
        reads as a fact and is a coin toss. Silence is the honest answer until
        the request says which — and Step 6d makes it say.
        """
        self.as_user(self.session)
        payload = self.client.get('/api/profile/me/').data
        self.assertIsNone(payload['salon'])

    # -- unlisted site: users/views.py::SalonEmployeeListCreateView._salon --

    def test_a_new_chair_is_hired_into_the_salon_the_request_names(self):
        self.as_user(self.session, tenant=self.second_tenant)
        hired = self.client.post('/api/salon/employees/', {
            'phone': '01755000077', 'name': 'Nusrat Jahan',
            'password': 'chairside2026',
        }, format='json')
        self.assertEqual(hired.status_code, 201, hired.data)

        employment = SalonEmployee.objects.get(pk=hired.data['id'])
        self.assertEqual(employment.salon_id, self.second.pk)
        self.assertFalse(SalonEmployee.objects.filter(salon=self.first).exists())

    def test_the_request_body_cannot_choose_the_salon(self):
        """`salon` in the body used to pick the shop. It no longer does.

        Which business a request acts in is not something a client asserts
        next to its credentials — it comes from the tenant context and is
        checked against ownership.
        """
        self.as_user(self.session, tenant=self.second_tenant)
        hired = self.client.post('/api/salon/employees/', {
            'phone': '01755000078', 'name': 'Imran Hossain',
            'password': 'chairside2026',
            'salon': self.first.pk,          # ignored
        }, format='json')
        self.assertEqual(hired.status_code, 201, hired.data)
        self.assertEqual(
            SalonEmployee.objects.get(pk=hired.data['id']).salon_id,
            self.second.pk,
        )


class TwoBarberTenantTests(AuthTestCase):
    """The barber half of the same question.

    A barber is their own business, so they can only ever be one tenant — but
    the resolution still has to *check* that, rather than handing back their
    profile whatever tenant was named.
    """

    def test_a_barber_cannot_write_into_another_barbers_tenant(self):
        mine = self.make_barber()
        theirs = self.make_barber(
            phone='01811111133', email='other@example.com',
            business_name="Somebody Else's Chair",
        )
        other_profile = User.objects.get(
            pk=theirs['user']['id']).barber_profile
        other_tenant = Tenant.objects.get(barber_profile=other_profile)

        self.as_user(mine, tenant=other_tenant)
        refused = self.client.post('/api/services/', {
            'name': 'Sneaky fade', 'price': '100.00', 'duration_minutes': 30,
        }, format='json')
        # Refused at the edge by `TenantContext` since Step 6d-1, rather than
        # reaching the view and coming back as 409 "set your business up" —
        # which was the right outcome for the wrong reason. 403 is what being
        # outside somebody else's tenant actually is.
        self.assertEqual(refused.status_code, 403, refused.data)
        self.assertEqual(refused.data['code'], 'not_a_member')
        self.assertFalse(Service.objects.filter(barber=other_profile).exists())
