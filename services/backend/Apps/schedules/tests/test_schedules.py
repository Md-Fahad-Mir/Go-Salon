"""Working hours: intervals, closed days, and the inheritance rule."""

from __future__ import annotations

from Apps.schedules.models import WorkingDay
from Apps.users.models import User
from Apps.users.tests.base import AuthTestCase

MINE = '/api/schedule/me/'


def week(**days) -> dict:
    """A payload for just the days named, e.g. week(mon=[('09:00','17:00')])."""
    payload = []
    for key, intervals in days.items():
        if intervals is None:
            payload.append({'day': key, 'is_closed': True, 'intervals': []})
            continue
        payload.append({
            'day': key,
            'is_closed': False,
            'intervals': [{'start': start, 'end': end} for start, end in intervals],
        })
    return {'days': payload}


class BarberScheduleTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.as_user(self.make_barber())

    def test_a_business_that_never_set_hours_is_shown_a_starting_week(self):
        response = self.client.get(MINE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['source'], 'default')
        self.assertEqual(len(response.data['days']), 7)
        friday = next(d for d in response.data['days'] if d['day'] == 'fri')
        self.assertTrue(friday['is_closed'])

    def test_saves_a_week_and_reads_it_back(self):
        response = self.client.put(MINE, week(
            mon=[('09:00', '13:00'), ('16:00', '20:00')],
            fri=None,
        ), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['source'], 'own')

        monday = next(d for d in response.data['days'] if d['day'] == 'mon')
        self.assertEqual(monday['intervals'],
                         [{'start': '09:00', 'end': '13:00'},
                          {'start': '16:00', 'end': '20:00'}])
        friday = next(d for d in response.data['days'] if d['day'] == 'fri')
        self.assertTrue(friday['is_closed'])
        self.assertEqual(friday['intervals'], [])

    def test_a_split_shift_is_stored_as_two_intervals(self):
        self.client.put(MINE, week(tue=[('10:00', '14:00'), ('17:00', '21:00')]),
                        format='json')
        day = WorkingDay.objects.get(barber__user__phone='+8801811111111', weekday=2)
        self.assertEqual(day.intervals.count(), 2)

    def test_refuses_a_shift_that_ends_before_it_starts(self):
        response = self.client.put(MINE, week(mon=[('18:00', '09:00')]), format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'interval_backwards')

    def test_refuses_overlapping_shifts(self):
        response = self.client.put(
            MINE, week(mon=[('09:00', '14:00'), ('13:00', '18:00')]), format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'intervals_overlap')
        self.assertIn('overlap', response.data['detail'])

    def test_refuses_an_open_day_with_no_hours(self):
        response = self.client.put(
            MINE, {'days': [{'day': 'mon', 'is_closed': False, 'intervals': []}]},
            format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'day_without_hours')

    def test_refuses_a_closed_day_that_also_has_hours(self):
        response = self.client.put(MINE, {'days': [{
            'day': 'mon', 'is_closed': True,
            'intervals': [{'start': '09:00', 'end': '17:00'}],
        }]}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'closed_with_intervals')

    def test_refuses_the_same_day_twice(self):
        response = self.client.put(MINE, {'days': [
            {'day': 'mon', 'is_closed': True, 'intervals': []},
            {'day': 'mon', 'is_closed': False,
             'intervals': [{'start': '09:00', 'end': '17:00'}]},
        ]}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'duplicate_day')

    def test_refuses_a_day_that_is_not_one(self):
        response = self.client.put(MINE, week(caturday=[('09:00', '17:00')]),
                                   format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_saving_a_day_again_replaces_its_hours(self):
        self.client.put(MINE, week(mon=[('09:00', '13:00'), ('16:00', '20:00')]),
                        format='json')
        response = self.client.put(MINE, week(mon=[('11:00', '19:00')]), format='json')
        monday = next(d for d in response.data['days'] if d['day'] == 'mon')
        self.assertEqual(monday['intervals'], [{'start': '11:00', 'end': '19:00'}])

    def test_days_not_sent_keep_what_they_had(self):
        self.client.put(MINE, week(mon=[('09:00', '17:00')], tue=[('09:00', '17:00')]),
                        format='json')
        response = self.client.put(MINE, week(tue=[('11:00', '15:00')]), format='json')
        monday = next(d for d in response.data['days'] if d['day'] == 'mon')
        self.assertEqual(monday['intervals'], [{'start': '09:00', 'end': '17:00'}])

    def test_a_business_cannot_clear_its_hours_away(self):
        self.client.put(MINE, week(mon=[('09:00', '17:00')]), format='json')
        response = self.client.delete(MINE)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'cannot_clear_schedule')

    def test_a_customer_has_no_hours_to_keep(self):
        self.as_user(self.make_customer())
        self.assertEqual(self.client.get(MINE).status_code, 403)


class EmployeeScheduleTests(AuthTestCase):
    """Inheritance is the absence of an override, not a copy of one."""

    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.as_user(self.owner)
        made = self.client.post('/api/salon/employees/', {
            'phone': '01755000004', 'name': 'Hasan', 'password': 'chairside2026',
        }, format='json')
        self.chair = made.data['id']
        # The salon keeps 10–8, shut on Friday.
        self.client.put(MINE, week(
            sun=[('10:00', '20:00')], mon=[('10:00', '20:00')],
            tue=[('10:00', '20:00')], wed=[('10:00', '20:00')],
            thu=[('10:00', '20:00')], fri=None, sat=[('10:00', '20:00')],
        ), format='json')

        user = User.objects.get(phone='+8801755000004')
        user.is_phone_verified = True
        user.save(update_fields=['is_phone_verified'])
        self.employee = self.sign_in(user.phone).data

    def test_an_employee_works_the_salons_hours_by_default(self):
        self.as_user(self.employee)
        response = self.client.get(MINE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['source'], 'salon')
        monday = next(d for d in response.data['days'] if d['day'] == 'mon')
        self.assertEqual(monday['intervals'], [{'start': '10:00', 'end': '20:00'}])

    def test_changing_the_salons_hours_moves_everyone_who_never_set_their_own(self):
        self.as_user(self.owner)
        self.client.put(MINE, week(mon=[('08:00', '16:00')]), format='json')

        self.as_user(self.employee)
        monday = next(d for d in self.client.get(MINE).data['days'] if d['day'] == 'mon')
        self.assertEqual(monday['intervals'], [{'start': '08:00', 'end': '16:00'}])

    def test_an_employee_cannot_set_hours_of_their_own(self):
        """A chair inside a shop cannot be open when the shop is shut."""
        self.as_user(self.employee)
        response = self.client.put(MINE, week(mon=[('12:00', '18:00')]), format='json')
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(response.data['code'], 'salon_sets_hours')
        # And the refusal changed nothing: they still read the salon's week.
        monday = next(d for d in self.client.get(MINE).data['days'] if d['day'] == 'mon')
        self.assertEqual(monday['intervals'], [{'start': '10:00', 'end': '20:00'}])

    def test_an_employee_is_told_their_week_is_not_theirs_to_edit(self):
        self.as_user(self.employee)
        response = self.client.get(MINE)
        self.assertFalse(response.data['editable'])

    def test_an_employee_has_nothing_to_hand_back(self):
        self.as_user(self.employee)
        response = self.client.delete(MINE)
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(response.data['code'], 'salon_sets_hours')

    def test_an_owner_still_decides_their_own_week(self):
        self.as_user(self.owner)
        response = self.client.put(MINE, week(mon=[('08:00', '16:00')]), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['editable'])

    def test_the_owner_can_set_one_chairs_hours(self):
        self.as_user(self.owner)
        url = f'/api/schedule/employees/{self.chair}/'
        response = self.client.put(url, week(mon=[('14:00', '21:00')]), format='json')
        self.assertEqual(response.status_code, 200, response.data)

        self.as_user(self.employee)
        monday = next(d for d in self.client.get(MINE).data['days'] if d['day'] == 'mon')
        self.assertEqual(monday['intervals'], [{'start': '14:00', 'end': '21:00'}])

    def test_an_employee_cannot_set_anyone_elses(self):
        self.as_user(self.employee)
        response = self.client.put(f'/api/schedule/employees/{self.chair}/',
                                   week(mon=[('14:00', '21:00')]), format='json')
        self.assertEqual(response.status_code, 403, response.data)

    def test_an_owner_cannot_reach_another_salons_chair(self):
        stranger = self.make_owner(phone='01913333333',
                                   business_name='Other Salon')
        self.as_user(stranger)
        response = self.client.put(f'/api/schedule/employees/{self.chair}/',
                                   week(mon=[('14:00', '21:00')]), format='json')
        self.assertEqual(response.status_code, 404, response.data)

    def test_the_roster_says_which_chairs_keep_hours_of_their_own(self):
        """Set by the owner, since a chair's hours are the owner's to set."""
        self.as_user(self.owner)
        self.assertFalse(self.client.get('/api/salon/employees/').data[0]['has_own_schedule'])

        self.client.put(f'/api/schedule/employees/{self.chair}/',
                        week(mon=[('12:00', '18:00')]), format='json')
        row = self.client.get('/api/salon/employees/').data[0]
        self.assertTrue(row['has_own_schedule'])
