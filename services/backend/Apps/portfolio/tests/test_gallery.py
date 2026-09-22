"""Galleries: the cap, and whose pictures are whose."""

from __future__ import annotations

from Apps.portfolio.models import GalleryImage
from Apps.users.models import MAX_BARBER_GALLERY, User
from Apps.users.tests.base import AuthTestCase

GALLERY = '/api/profile/me/gallery/'
TINY_PNG = (
    'data:image/png;base64,'
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
)


class BarberGalleryTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.make_barber())

    def add(self, **overrides):
        return self.client.post(
            GALLERY, {'image': TINY_PNG, 'caption': 'Skin fade', **overrides},
            format='json')

    def test_starts_empty_and_takes_a_picture(self):
        self.assertEqual(self.client.get(GALLERY).data, [])
        response = self.add()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['caption'], 'Skin fade')
        self.assertEqual(len(self.client.get(GALLERY).data), 1)

    def test_takes_an_https_link_too(self):
        response = self.add(image='https://cdn.example.com/cut.jpg')
        self.assertEqual(response.status_code, 201, response.data)

    def test_stops_at_six(self):
        for index in range(MAX_BARBER_GALLERY):
            self.assertEqual(self.add(caption=f'Cut {index}').status_code, 201)
        response = self.add(caption='One too many')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['code'], 'gallery_full')
        self.assertEqual(GalleryImage.objects.count(), MAX_BARBER_GALLERY)

    def test_removing_one_makes_room_again(self):
        made = [self.add(caption=f'Cut {i}') for i in range(MAX_BARBER_GALLERY)]
        self.client.delete(f'{GALLERY}{made[0].data["id"]}/')
        self.assertEqual(self.add(caption='Now it fits').status_code, 201)

    def test_recaptions_a_picture(self):
        made = self.add()
        response = self.client.patch(f'{GALLERY}{made.data["id"]}/',
                                     {'caption': 'Beard sculpt'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['caption'], 'Beard sculpt')

    def test_refuses_a_blank_picture(self):
        response = self.add(image='')
        self.assertEqual(response.status_code, 400, response.data)

    def test_refuses_something_that_is_not_a_picture(self):
        response = self.add(image='file:///etc/passwd')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'image_invalid')

    def test_refuses_a_picture_that_is_far_too_large(self):
        response = self.add(image='data:image/png;base64,' + 'A' * 1_600_000)
        self.assertEqual(response.status_code, 400, response.data)

    def test_never_touches_someone_elses(self):
        mine = self.add()
        self.as_user(self.make_owner())
        self.assertEqual(self.client.get(GALLERY).data, [])
        self.assertEqual(
            self.client.delete(f'{GALLERY}{mine.data["id"]}/').status_code, 404)
        self.assertEqual(GalleryImage.objects.count(), 1)

    def test_a_customer_has_no_gallery(self):
        self.as_user(self.make_customer())
        self.assertEqual(self.client.get(GALLERY).status_code, 403)

    def test_the_profile_carries_the_gallery(self):
        self.add()
        profile = self.client.get('/api/profile/me/')
        self.assertEqual(len(profile.data['barber']['gallery']), 1)


class SalonGalleryTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.make_owner())

    def test_the_shopfront_hangs_off_the_salon(self):
        response = self.client.post(
            GALLERY, {'image': TINY_PNG, 'caption': 'The front room'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        image = GalleryImage.objects.get(pk=response.data['id'])
        self.assertIsNotNone(image.salon_id)
        self.assertIsNone(image.barber_id)

        profile = self.client.get('/api/profile/me/')
        self.assertEqual(len(profile.data['salon']['gallery']), 1)


class EmployeeGalleryTests(AuthTestCase):
    """An employee shows their own work, not the salon's shopfront."""

    def setUp(self):
        super().setUp()
        self.as_user(self.make_owner())
        self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan', 'password': 'chairside2026',
        }, format='json')
        user = User.objects.get(phone='+8801755000004')
        user.is_phone_verified = True
        user.save(update_fields=['is_phone_verified'])
        self.as_user(self.sign_in(user.phone).data)

    def test_pictures_belong_to_the_person_not_the_shop(self):
        response = self.client.post(GALLERY, {'image': TINY_PNG}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        image = GalleryImage.objects.get(pk=response.data['id'])
        self.assertIsNotNone(image.barber_id)
        self.assertIsNone(image.salon_id)
