"""What the business made, and who is allowed to ask.

These cover `Apps/bookings/reports.py` — the two endpoints behind the owner's
Analytics screen and an employee's Performance screen. The rules pinned down
here are the ones that were wrong before the module existed: revenue that
quietly included the platform's fee, a week measured off whichever clock the
caller happened to be standing next to, and a chair's takings readable by the
chair beside it.

Every row is made through the real endpoints — a booking prices its own basket,
`complete` stamps the till — because a report that agrees with hand-built rows
and disagrees with the ones the app writes is no report at all. The single
exception is the moment the money was taken: nothing in the API can say "this
was rung up on Tuesday", and which day a row lands on is the whole subject.

Money is compared as a number rather than as a string. The figures are decimal
strings and the values are asserted exactly, but the *scale* they arrive at is
a separate question with a separate answer — see `MoneyFormatTests`.

TWO DEFECTS THESE TESTS FOUND, AND NOW GUARD

`MoneyFormatTests` and `ARetiredPaymentMethodTests` were written against faults
in `reports.py` — one payload carrying two spellings of a taka, and two rows
both called `unrecorded` — and were marked `expectedFailure` while the module
was somebody else's to edit. The module has since been fixed: `_taka` quantizes
every money string to two places, and `_by_payment` folds the unknown methods
together after grouping rather than relabelling row by row. The decorators are
gone and these are ordinary tests now, which is what keeps the two faults from
coming back.
"""

from __future__ import annotations

from datetime import datetime, time as wall_clock, timedelta, timezone as utc_zone
from decimal import Decimal

from django.utils import timezone

from Apps.bookings.models import Appointment, business_tz
from Apps.users.models import BarberProfile

from .base import BookingTestCase, all_week

ANALYTICS = '/api/bookings/analytics/'
PERFORMANCE = '/api/bookings/performance/'


class ReportTestCase(BookingTestCase):
    """The salon from `BookingTestCase` with a second chair, both stylists
    signed in, and one way to put money through the till."""

    def setUp(self):
        super().setUp()
        self.as_user(self.owner_session)
        self.second_chair = self._hire('01755000007', 'Nadia Sultana')
        self.set_rate(self.chair, 40)
        self.set_rate(self.second_chair, 25)

        self.verify('+8801755000004')
        self.verify('+8801755000007')
        self.stylist = self.sign_in('+8801755000004').data
        self.colleague = self.sign_in('+8801755000007').data

    # --- building the day's takings ----------------------------------------

    def set_rate(self, employment, rate: int) -> None:
        self.as_user(self.owner_session)
        response = self.client.patch(
            f'/api/salon/employees/{employment.id}/',
            {'commission_rate': rate}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        employment.refresh_from_db()

    def take(self, *, at='11:00', services=None, employee=None, day=None,
             customer=None, paid_with=None, tip=None, rung_up=None) -> dict:
        """One appointment, booked and then closed off at the counter.

        `rung_up` moves `completed_at` afterwards. `complete` always stamps the
        present moment, so it is the only way to say the money was taken on a
        day other than today — which is exactly what these reports bucket by.
        """
        self.as_user(customer or self.customer_session)
        booked = self.book(time=at, services=services or [self.cut],
                           employee=employee, day=day).data
        return self.close_off(booked['id'], paid_with=paid_with, tip=tip,
                              rung_up=rung_up)

    def walk_in(self, *, by=None, name='Rahim Mia', phone='', services=None,
                employee=None, paid_with=None, tip=None, rung_up=None) -> dict:
        """Somebody added at the counter. An owner may leave the chair
        unassigned, which is the only way a real row ends up with no stylist."""
        self.as_user(by or self.owner_session)
        payload = {
            'customer_name': name,
            'customer_phone': phone,
            'service_ids': [s.id for s in (services or [self.cut])],
        }
        if employee is not None:
            payload['employee'] = employee.id
        response = self.client.post('/api/bookings/walk-in/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return self.close_off(response.data['id'], paid_with=paid_with, tip=tip,
                              rung_up=rung_up)

    def close_off(self, appointment_id: int, *, by=None, paid_with=None, tip=None,
                  rung_up=None) -> dict:
        self.as_user(by or self.owner_session)
        payload = {}
        if paid_with is not None:
            payload['paid_with'] = paid_with
        if tip is not None:
            payload['tip'] = tip
        response = self.client.post(f'/api/bookings/{appointment_id}/complete/',
                                    payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        if rung_up is not None:
            Appointment.objects.filter(pk=appointment_id).update(completed_at=rung_up)
        return response.data

    # --- reading the reports back ------------------------------------------

    def report(self, url: str, session, *, period='week', expect=200):
        self.as_user(session)
        response = self.client.get(url, {'period': period})
        if expect is not None:
            self.assertEqual(response.status_code, expect, response.data)
        return response

    def analytics(self, session, **kwargs) -> dict:
        return self.report(ANALYTICS, session, **kwargs).data

    def performance(self, session, **kwargs) -> dict:
        return self.report(PERFORMANCE, session, **kwargs).data

    # --- saying what a figure should be ------------------------------------

    def assertMoney(self, value, expected: str) -> None:
        """Money is a decimal string — never a float, which is what a client
        that did its own arithmetic used to receive."""
        self.assertIsInstance(value, str, f'{value!r} is not a decimal string')
        self.assertEqual(Decimal(value), Decimal(expected),
                         f'{value!r} is not {expected}')

    def assertTakings(self, part: dict, *, revenue: str, bookings: int) -> None:
        self.assertMoney(part['revenue'], revenue)
        self.assertEqual(part['bookings'], bookings)

    def assertHeadline(self, data: dict, *, revenue: str, bookings: int,
                       fees: str | None = None, tips: str | None = None,
                       ticket: str | None = None) -> dict:
        head = data['headline']
        self.assertMoney(head['revenue'], revenue)
        self.assertEqual(head['bookings'], bookings)
        if fees is not None:
            self.assertMoney(head['platform_fees'], fees)
        if tips is not None:
            self.assertMoney(head['tips'], tips)
        if ticket is not None:
            self.assertMoney(head['average_ticket'], ticket)
        return head

    # --- the salon's own clock ---------------------------------------------

    def business_today(self):
        return timezone.now().astimezone(business_tz()).date()

    def on_day(self, report: dict, day) -> dict:
        """The one series entry for a day, or a failure naming the day."""
        wanted = day.isoformat()
        for entry in report['series']:
            if entry['date'] == wanted:
                return entry
        self.fail(f'{wanted} is not in the series at all')

    def staff_row(self, report: dict, employment) -> dict:
        for row in report['by_staff']:
            if row['employee_id'] == str(employment.id):
                return row
        self.fail(f'{employment.user.name} is not in the staff ranking')


class ScopeTests(ReportTestCase):
    """Who the figures are about. This is the whole reason both reports start
    from `access.scoped` rather than from a salon lookup of their own."""

    def setUp(self):
        super().setUp()
        # One customer at Hasan's chair, another at Nadia's, so "only your own"
        # has somebody to be true about in both directions.
        self.take(at='11:00', services=[self.cut], employee=self.chair)
        self.other_customer = self.make_customer(
            phone='01777000999', name='Rumi Chowdhury', email='rumi@example.com')
        self.take(at='12:00', services=[self.colour], employee=self.second_chair,
                  customer=self.other_customer)

    def test_the_owner_sees_the_whole_salon(self):
        data = self.analytics(self.owner_session)
        self.assertEqual(data['viewpoint'], 'owner')
        self.assertHeadline(data, revenue='4400.00', bookings=2)
        self.assertEqual({row['name'] for row in data['by_staff']},
                         {'Hasan Mahmud', 'Nadia Sultana'})

    def test_an_employee_sees_only_their_own_chair(self):
        data = self.analytics(self.stylist)
        self.assertEqual(data['viewpoint'], 'employee')
        self.assertHeadline(data, revenue='900.00', bookings=1)
        # Not the salon's total, and not a word about the chair next door.
        self.assertEqual([row['name'] for row in data['by_staff']], ['Hasan Mahmud'])
        self.assertEqual([line['name'] for line in data['by_service']], ['Ladies cut'])

    def test_the_other_chair_is_a_different_answer_to_the_same_question(self):
        data = self.analytics(self.colleague)
        self.assertHeadline(data, revenue='3500.00', bookings=1)
        self.assertEqual([row['name'] for row in data['by_staff']], ['Nadia Sultana'])

    def test_another_salons_owner_sees_none_of_it(self):
        stranger = self.make_owner(phone='01913333333', business_name='Other Salon')
        data = self.analytics(stranger)
        self.assertEqual(data['viewpoint'], 'owner')
        self.assertHeadline(data, revenue='0.00', bookings=0)
        self.assertEqual(data['by_staff'], [])
        self.assertEqual(data['by_service'], [])
        self.assertEqual(data['by_payment'], [])
        self.assertTakings(data['unassigned'], revenue='0.00', bookings=0)

    def test_a_customer_is_answered_about_themselves_and_not_the_business(self):
        data = self.analytics(self.customer_session)
        self.assertEqual(data['viewpoint'], 'customer')
        # What they spent, not what the salon took.
        self.assertHeadline(data, revenue='900.00', bookings=1)
        self.assertNotIn('Nadia Sultana', [row['name'] for row in data['by_staff']])
        self.assertEqual([line['name'] for line in data['by_service']], ['Ladies cut'])

    def test_an_empty_report_still_has_every_day_of_the_window(self):
        """Nothing to show is not the same as nothing to render."""
        stranger = self.make_owner(phone='01913334444', business_name='Quiet Salon')
        data = self.analytics(stranger)
        self.assertEqual(len(data['series']), 7)
        self.assertEqual({Decimal(entry['revenue']) for entry in data['series']},
                         {Decimal('0')})
        self.assertEqual(data['returning'],
                         {'repeat': 0, 'first_time': 0, 'repeat_share': 0})

    def test_a_period_we_do_not_report_on_is_refused(self):
        response = self.report(ANALYTICS, self.owner_session, period='year', expect=400)
        self.assertEqual(response.data['code'], 'bad_period')
        self.assertIn('period', response.data['errors'])

    def test_a_month_runs_from_the_first_to_today(self):
        data = self.analytics(self.owner_session, period='month')
        today = self.business_today()
        self.assertEqual(data['period'], 'month')
        self.assertEqual(data['from'], today.replace(day=1).isoformat())
        self.assertEqual(data['to'], today.isoformat())
        self.assertEqual(len(data['series']), today.day)

    def test_signing_out_closes_both_reports(self):
        self.client.credentials()
        self.assertEqual(self.client.get(ANALYTICS).status_code, 401)
        self.assertEqual(self.client.get(PERFORMANCE).status_code, 401)


class PerformanceAccessTests(ReportTestCase):
    """`/performance/` is one person's own record. Everybody else is refused
    rather than quietly handed whatever room they can see."""

    def setUp(self):
        super().setUp()
        self.take(at='11:00', services=[self.cut], employee=self.chair)

    def test_it_answers_the_employee_whose_record_it_is(self):
        data = self.performance(self.stylist)
        self.assertEqual(data['viewpoint'], 'employee')
        self.assertHeadline(data, revenue='900.00', bookings=1)
        self.assertEqual(data['salon'], self.salon.name)

    def test_an_owner_is_refused(self):
        """An owner's numbers are the salon's. Answering here would put the
        whole floor's takings under a heading that says "you"."""
        response = self.report(PERFORMANCE, self.owner_session, expect=403)
        self.assertEqual(response.data['code'], 'permission_denied')

    def test_a_customer_is_refused(self):
        response = self.report(PERFORMANCE, self.customer_session, expect=403)
        self.assertEqual(response.data['code'], 'permission_denied')

    def test_an_independent_barber_is_refused(self):
        barber = self.make_barber()
        response = self.report(PERFORMANCE, barber, expect=403)
        self.assertEqual(response.data['code'], 'permission_denied')

    def test_a_period_we_do_not_report_on_is_refused_before_anything_else(self):
        response = self.report(PERFORMANCE, self.stylist, period='year', expect=400)
        self.assertEqual(response.data['code'], 'bad_period')


class RevenueTests(ReportTestCase):
    """What the money means: the salon's own prices, and nothing else."""

    def test_revenue_is_the_services_and_excludes_the_platform_fee(self):
        """R1. A cut and a colour are 4400 of the salon's money; the 50 on top
        is the platform's. Counting it as revenue tells an owner they earned
        what they never received — and then takes commission out of it."""
        row = self.take(at='11:00', services=[self.cut, self.colour])
        self.assertEqual(row['subtotal'], '4400.00')
        self.assertEqual(row['platform_fee'], '50.00')
        self.assertEqual(row['total'], '4450.00')

        self.assertHeadline(self.analytics(self.owner_session),
                            revenue='4400.00', fees='50.00', bookings=1)

    def test_every_booking_carries_its_own_fee_out_of_the_revenue(self):
        self.take(at='11:00', services=[self.cut])
        self.take(at='12:00', services=[self.cut])
        self.take(at='13:00', services=[self.colour])

        # 900 + 900 + 3500 taken, three fees of 50 that were never the salon's.
        self.assertHeadline(self.analytics(self.owner_session),
                            revenue='5300.00', fees='150.00', bookings=3)

    def test_the_average_ticket_is_quoted_to_the_whole_taka(self):
        self.take(at='11:00', services=[self.cut])
        self.take(at='12:00', services=[self.cut])
        self.take(at='13:00', services=[self.colour])

        # 5300 over three, rounded — a ticket is not quoted in poisha.
        self.assertHeadline(self.analytics(self.owner_session),
                            revenue='5300.00', bookings=3, ticket='1767')

    def test_a_tip_is_reported_and_never_counted_as_revenue(self):
        """R2. A tip is money the customer handed to a person."""
        self.take(at='11:00', services=[self.cut], tip='200.00')

        self.assertHeadline(self.analytics(self.owner_session),
                            revenue='900.00', tips='200.00', bookings=1,
                            ticket='900')

    def test_a_tip_is_never_commissioned(self):
        """R2 where it costs somebody money: 40% of the cut, not 40% of the cut
        plus the fee plus the tip."""
        self.take(at='11:00', services=[self.cut], employee=self.chair,
                  tip='200.00')

        row = self.staff_row(self.analytics(self.owner_session), self.chair)
        self.assertMoney(row['revenue'], '900.00')
        self.assertEqual(row['commission_rate'], 40)
        self.assertMoney(row['commission'], '360')     # not 460, and not 380

    def test_nothing_but_completed_work_is_counted(self):
        """An approved booking is a promise, not takings."""
        self.as_user(self.customer_session)
        self.book(time='11:00', services=[self.cut])
        self.take(at='13:00', services=[self.cut])

        self.assertHeadline(self.analytics(self.owner_session),
                            revenue='900.00', bookings=1)

    def test_a_cancelled_booking_is_not_takings_either(self):
        self.as_user(self.customer_session)
        booked = self.book(time='11:00', services=[self.cut]).data
        self.client.post(f'/api/bookings/{booked["id"]}/cancel/', {}, format='json')

        self.assertHeadline(self.analytics(self.owner_session),
                            revenue='0.00', bookings=0)


class StaffTests(ReportTestCase):
    """Whose chair the money came off, and what is owed on it."""

    def test_each_chair_is_ranked_with_its_own_commission(self):
        self.take(at='11:00', services=[self.colour], employee=self.second_chair)
        self.take(at='12:00', services=[self.cut], employee=self.chair)

        data = self.analytics(self.owner_session)
        self.assertEqual([row['name'] for row in data['by_staff']],
                         ['Nadia Sultana', 'Hasan Mahmud'])
        self.assertMoney(self.staff_row(data, self.chair)['commission'], '360')
        self.assertMoney(self.staff_row(data, self.second_chair)['commission'], '875')

    def test_commission_is_quoted_at_todays_rate_not_the_rate_on_the_day(self):
        """R5. Nothing records the split as it stood when the work was done, so
        changing it today changes what the report says about last week. The
        screen has to say "at your current rate", because this is the only
        thing the database can honestly tell it."""
        self.take(at='11:00', services=[self.cut], employee=self.chair)
        self.assertMoney(
            self.staff_row(self.analytics(self.owner_session), self.chair)['commission'],
            '360')

        self.set_rate(self.chair, 50)
        again = self.staff_row(self.analytics(self.owner_session), self.chair)
        self.assertEqual(again['commission_rate'], 50)
        self.assertMoney(again['commission'], '450')

    def test_unassigned_revenue_is_kept_out_of_the_staff_ranking(self):
        """R6. It is money, not a person: a row in the ranking would take the
        top of the list and give the salon a stylist called nobody."""
        self.walk_in(services=[self.colour])           # no chair named
        self.take(at='11:00', services=[self.cut], employee=self.chair)

        data = self.analytics(self.owner_session)
        self.assertTakings(data['unassigned'], revenue='3500.00', bookings=1)
        self.assertEqual([row['name'] for row in data['by_staff']], ['Hasan Mahmud'])
        self.assertNotIn('', [row['name'] for row in data['by_staff']])
        self.assertNotIn(None, [row['employee_id'] for row in data['by_staff']])

    def test_the_staff_rows_and_the_unassigned_caption_add_up_to_the_headline(self):
        """The reason unassigned comes back at all: the arithmetic on the
        screen has to reconcile with the total printed above it."""
        self.walk_in(services=[self.colour])
        self.take(at='11:00', services=[self.cut], employee=self.chair)
        self.take(at='12:00', services=[self.cut], employee=self.second_chair)

        data = self.analytics(self.owner_session)
        counted = sum(Decimal(row['revenue']) for row in data['by_staff'])
        counted += Decimal(data['unassigned']['revenue'])
        self.assertEqual(counted, Decimal(data['headline']['revenue']))
        self.assertEqual(
            sum(row['bookings'] for row in data['by_staff'])
            + data['unassigned']['bookings'],
            data['headline']['bookings'])

    def test_an_employee_never_carries_the_salons_unassigned_money(self):
        self.walk_in(services=[self.colour])
        self.take(at='11:00', services=[self.cut], employee=self.chair)

        data = self.analytics(self.stylist)
        self.assertTakings(data['unassigned'], revenue='0.00', bookings=0)
        self.assertHeadline(data, revenue='900.00', bookings=1)


class PaymentTests(ReportTestCase):
    """R4. A blank method is nobody having said, and nobody having said is not
    cash. Calling it cash invents a fact about the till."""

    def methods(self, data: dict) -> dict:
        return {row['method']: row for row in data['by_payment']}

    def test_a_booking_closed_without_a_method_is_unrecorded_not_cash(self):
        self.take(at='11:00', services=[self.cut])  # closed off saying nothing

        methods = self.methods(self.analytics(self.owner_session))
        self.assertEqual(set(methods), {'unrecorded'})
        self.assertTakings(methods['unrecorded'], revenue='900.00', bookings=1)
        self.assertNotIn('cash', methods)

    def test_cash_is_only_ever_cash_somebody_actually_recorded(self):
        self.take(at='11:00', services=[self.cut], paid_with='cash')
        self.take(at='12:00', services=[self.cut])
        self.take(at='13:00', services=[self.colour], paid_with='bkash')

        methods = self.methods(self.analytics(self.owner_session))
        self.assertEqual(set(methods), {'cash', 'bkash', 'unrecorded'})
        self.assertTakings(methods['cash'], revenue='900.00', bookings=1)
        self.assertTakings(methods['unrecorded'], revenue='900.00', bookings=1)
        self.assertTakings(methods['bkash'], revenue='3500.00', bookings=1)

    def test_the_split_is_revenue_so_it_adds_up_to_the_headline(self):
        self.take(at='11:00', services=[self.cut], paid_with='cash', tip='100.00')
        self.take(at='12:00', services=[self.colour], paid_with='nagad')

        data = self.analytics(self.owner_session)
        paid = sum(Decimal(row['revenue']) for row in data['by_payment'])
        self.assertEqual(paid, Decimal(data['headline']['revenue']))


class ServiceTests(ReportTestCase):
    def test_revenue_is_split_by_the_name_the_service_was_sold_as(self):
        self.take(at='11:00', services=[self.cut, self.colour])
        self.take(at='13:00', services=[self.cut])

        lines = {row['name']: row
                 for row in self.analytics(self.owner_session)['by_service']}
        self.assertTakings(lines['Colour'], revenue='3500.00', bookings=1)
        self.assertTakings(lines['Ladies cut'], revenue='1800.00', bookings=2)

    def test_repricing_the_menu_does_not_reprice_what_was_already_sold(self):
        self.take(at='11:00', services=[self.cut])
        self.as_user(self.owner_session)
        self.client.patch(f'/api/services/{self.cut.id}/',
                          {'price': '1500.00'}, format='json')

        data = self.analytics(self.owner_session)
        self.assertTakings(data['by_service'][0], revenue='900.00', bookings=1)
        self.assertHeadline(data, revenue='900.00', bookings=1)


class TheDayTheMoneyWasTakenTests(ReportTestCase):
    """R3. `date` is the day the chair was booked; `completed_at` is the day
    the money was taken. In this database they are routinely weeks apart."""

    def test_work_booked_for_next_month_counts_on_the_day_it_was_paid_for(self):
        """The real shape of the data, and the trap the whole module exists to
        avoid: bucketing by `date` files this under a day that has not
        happened, and drops it out of the week it was actually taken in."""
        far_off = self.business_today() + timedelta(days=30)
        row = self.take(at='11:00', services=[self.cut], day=far_off)
        self.assertEqual(row['date'], far_off.isoformat())

        data = self.analytics(self.owner_session)
        self.assertNotIn(far_off.isoformat(), [e['date'] for e in data['series']])
        self.assertHeadline(data, revenue='900.00', bookings=1)
        self.assertTakings(self.on_day(data, self.business_today()),
                           revenue='900.00', bookings=1)

    def test_the_day_is_the_salons_own_day_not_the_servers(self):
        """Half past six in the evening in London is half past midnight in
        Dhaka, the next day. The salon took that money tomorrow."""
        today = self.business_today()
        yesterday = today - timedelta(days=1)
        rung_up = datetime.combine(yesterday, wall_clock(18, 30), tzinfo=utc_zone.utc)
        self.assertEqual(rung_up.date(), yesterday)                    # UTC's answer
        self.assertEqual(rung_up.astimezone(business_tz()).date(), today)  # the salon's

        self.take(at='11:00', services=[self.cut], rung_up=rung_up)

        data = self.analytics(self.owner_session)
        self.assertTakings(self.on_day(data, today), revenue='900.00', bookings=1)
        self.assertTakings(self.on_day(data, yesterday), revenue='0.00', bookings=0)

    def test_the_series_has_one_entry_for_every_day_including_the_quiet_ones(self):
        """A chart that carries only the days something happened on is a chart
        with a different x-axis every time you look at it."""
        today = self.business_today()
        self.take(at='11:00', services=[self.cut],
                  rung_up=timezone.now() - timedelta(days=2))

        data = self.analytics(self.owner_session)
        self.assertEqual([entry['date'] for entry in data['series']],
                         [(today - timedelta(days=6 - n)).isoformat() for n in range(7)])
        self.assertEqual(data['from'], (today - timedelta(days=6)).isoformat())
        self.assertEqual(data['to'], today.isoformat())

        self.assertTakings(self.on_day(data, today - timedelta(days=2)),
                           revenue='900.00', bookings=1)
        self.assertTakings(self.on_day(data, today), revenue='0.00', bookings=0)
        self.assertEqual(sum(entry['bookings'] for entry in data['series']), 1)

    def test_money_taken_before_the_window_is_not_this_weeks(self):
        self.take(at='11:00', services=[self.cut],
                  rung_up=timezone.now() - timedelta(days=8))
        self.take(at='13:00', services=[self.cut])

        self.assertHeadline(self.analytics(self.owner_session),
                            revenue='900.00', bookings=1)

    def test_the_month_reaches_back_further_than_the_week(self):
        taken_earlier = timezone.now() - timedelta(days=8)
        if taken_earlier.astimezone(business_tz()).month != self.business_today().month:
            self.skipTest('a week back is already last month')
        self.take(at='11:00', services=[self.cut], rung_up=taken_earlier)

        self.assertHeadline(self.analytics(self.owner_session, period='week'),
                            revenue='0.00', bookings=0)
        self.assertHeadline(self.analytics(self.owner_session, period='month'),
                            revenue='900.00', bookings=1)


class ReturningCustomerTests(ReportTestCase):
    """Who had been here before. "Here" is this business, and "before" is an
    earlier completed visit by the same identity."""

    def test_a_first_visit_is_not_a_returning_one(self):
        self.take(at='11:00', services=[self.cut])

        self.assertEqual(self.analytics(self.owner_session)['returning'],
                         {'repeat': 0, 'first_time': 1, 'repeat_share': 0})

    def test_the_second_visit_by_the_same_customer_counts_as_a_regular(self):
        self.take(at='11:00', services=[self.cut])
        self.take(at='13:00', services=[self.cut])

        self.assertEqual(self.analytics(self.owner_session)['returning'],
                         {'repeat': 1, 'first_time': 1, 'repeat_share': 50})

    def test_a_walk_in_is_recognised_by_the_number_taken_at_the_counter(self):
        self.walk_in(name='Rahim Mia', phone='01766001122')
        self.walk_in(name='Rahim Mia', phone='01766001122')

        returning = self.analytics(self.owner_session)['returning']
        self.assertEqual(returning['repeat'], 1)
        self.assertEqual(returning['first_time'], 1)

    def test_a_walk_in_with_no_number_is_neither(self):
        """Nothing to match on is not the same as somebody new, twice over."""
        self.walk_in(name='Rahim Mia')
        self.walk_in(name='Karim Uddin')

        returning = self.analytics(self.owner_session)['returning']
        self.assertEqual(returning['repeat'], 0)
        self.assertEqual(returning['first_time'], 2)

    def test_a_customer_known_at_another_salon_is_new_at_this_one(self):
        other_owner = self.make_owner(phone='01913333333', business_name='Other Salon')
        self.as_user(other_owner)
        self.client.put('/api/schedule/me/', all_week(), format='json')
        their_cut = self._service('Trim', '500.00', 60)
        their_chair = self._hire('01755000088', 'Shahnaz Begum')

        self.as_user(self.customer_session)
        elsewhere = self.client.post('/api/bookings/', {
            'listing': f'salon-{their_chair.salon_id}',
            'date': self.day.isoformat(), 'time': '11:00',
            'service_ids': [their_cut.id],
        }, format='json')
        self.assertEqual(elsewhere.status_code, 201, elsewhere.data)
        self.close_off(elsewhere.data['id'], by=other_owner)

        # The same customer, later that day, at our salon: still new here.
        self.take(at='13:00', services=[self.cut])

        self.assertEqual(self.analytics(self.owner_session)['returning'],
                         {'repeat': 0, 'first_time': 1, 'repeat_share': 0})

    def test_two_lone_barbers_do_not_share_each_others_regulars(self):
        """Every one of their rows has `salon_id IS NULL`. Matching the
        business on that column alone would make every barber in the country
        a colleague, and every stranger a regular."""
        first = self.lone_barber(phone='01811111111')
        second = self.lone_barber(phone='01822222222', name='Imran Hossain',
                                  business_name="Imran's Chair", service='Beard trim')

        self.visit(first, at='11:00')
        self.visit(second, at='13:00')

        self.assertEqual(self.analytics(second['session'])['returning'],
                         {'repeat': 0, 'first_time': 1, 'repeat_share': 0})

    def test_a_lone_barbers_own_customer_does_come_back(self):
        barber = self.lone_barber(phone='01811111111')
        self.visit(barber, at='11:00')
        self.visit(barber, at='13:00')

        self.assertEqual(self.analytics(barber['session'])['returning'],
                         {'repeat': 1, 'first_time': 1, 'repeat_share': 50})

    # --- a barber working alone --------------------------------------------

    def lone_barber(self, *, phone: str, name='Rafiqul Karim',
                    business_name="Rafiq's Chair", service='Skin fade') -> dict:
        session = self.make_barber(phone=phone, name=name,
                                   business_name=business_name,
                                   email=f'{phone}@example.com')
        self.as_user(session)
        self.client.put('/api/schedule/me/', all_week(), format='json')
        menu = self._service(service, '600.00', 60)
        profile = BarberProfile.objects.get(user__phone=f'+88{phone}')
        return {'session': session, 'service': menu, 'profile': profile}

    def visit(self, barber: dict, *, at: str) -> dict:
        self.as_user(self.customer_session)
        response = self.client.post('/api/bookings/', {
            'listing': f'barber-{barber["profile"].id}',
            'date': self.day.isoformat(), 'time': at,
            'service_ids': [barber['service'].id],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return self.close_off(response.data['id'], by=barber['session'])


class PerformanceShapeTests(ReportTestCase):
    """What an employee's own screen is handed."""

    def setUp(self):
        super().setUp()
        self.take(at='11:00', services=[self.cut], employee=self.chair,
                  paid_with='cash', tip='150.00')
        self.take(at='12:00', services=[self.colour], employee=self.second_chair)

    def test_it_reports_the_chair_and_nothing_beside_it(self):
        data = self.performance(self.stylist)
        self.assertHeadline(data, revenue='900.00', bookings=1)
        self.assertEqual([line['name'] for line in data['by_service']], ['Ladies cut'])
        self.assertEqual(len(data['series']), 7)
        self.assertEqual(data['from'],
                         (self.business_today() - timedelta(days=6)).isoformat())
        self.assertEqual(data['to'], self.business_today().isoformat())

    def test_the_fee_is_not_theirs_and_the_tip_is_theirs_in_full(self):
        self.assertHeadline(self.performance(self.stylist), revenue='900.00',
                            fees='50.00', tips='150.00', bookings=1)

    def test_commission_is_their_own_rate_on_their_own_revenue(self):
        data = self.performance(self.stylist)
        self.assertEqual(data['commission_rate'], 40)
        self.assertMoney(data['commission'], '360')   # 40% of 900, not of 1100
        self.assertEqual(data['salon'], self.salon.name)

    def test_the_rate_it_quotes_is_the_one_in_force_today(self):
        """R5, from the other side of the counter."""
        self.set_rate(self.chair, 55)
        data = self.performance(self.stylist)
        self.assertEqual(data['commission_rate'], 55)
        self.assertMoney(data['commission'], '495')

    def test_a_chair_with_nothing_yet_reports_zero_rather_than_nothing(self):
        """A screen showing "—" where it should show zero reads as broken."""
        self._hire('01755000033', 'Tania Rahman')
        self.verify('+8801755000033')
        newcomer = self.sign_in('+8801755000033').data

        data = self.performance(newcomer)
        self.assertHeadline(data, revenue='0.00', fees='0.00', tips='0.00',
                            bookings=0, ticket='0')
        self.assertEqual(data['by_service'], [])
        self.assertEqual(len(data['series']), 7)
        self.assertEqual(data['commission_rate'], 0)
        self.assertMoney(data['commission'], '0')


class MoneyFormatTests(ReportTestCase):
    """One payload, one spelling of a taka.

    The fault these were written against: a `series` array came back carrying
    two different spellings of a taka.
    `_series` writes the literal `'0.00'` for a day nothing happened on, and
    `str(...)` of the aggregate for a day something did — and the aggregate is
    not rescaled, because Django only quantizes a decimal it reads straight off
    a column, never one an expression computed. So a week reads

        [{'revenue': '0.00'}, ..., {'revenue': '900'}, {'revenue': '0.00'}]

    and a screen that prints what it is handed shows "৳900" sitting under
    "৳0.00". The same is true of every other money figure in both payloads:
    `headline.revenue` was `'0'` for an empty week and `'4400'` for a busy one.

    Nothing there was a wrong *number* — the arithmetic is all correct, which
    is why the rest of this file compares values rather than text. It was a
    wrong *contract*: an API that promises a decimal string should send the
    same one twice. `reports.py::_taka` now quantizes each figure to two places
    as it is stringified; `average_ticket` and `commission` stay quoted to the
    whole taka on purpose.
    """

    #: `average_ticket` and `commission` are deliberately quoted to the whole
    #: taka — a ticket is not priced in poisha — so they are not in this.
    TWO_PLACES = ('revenue', 'platform_fees', 'tips')

    def spellings(self, data: dict) -> dict:
        """Every money string in the payload, filed under the scale it came in
        at. More than one key here is more than one spelling of a taka."""
        found: dict[int, set[str]] = {}

        def note(path: str, value: str) -> None:
            found.setdefault(Decimal(value).as_tuple().exponent, set()).add(
                f'{path}={value}')

        for key in self.TWO_PLACES:
            note(f'headline.{key}', data['headline'][key])
        for entry in data['series']:
            note(f"series[{entry['date']}]", entry['revenue'])
        for row in data['by_staff']:
            note(f"by_staff[{row['name']}]", row['revenue'])
        for row in data['by_service']:
            note(f"by_service[{row['name']}]", row['revenue'])
        for row in data['by_payment']:
            note(f"by_payment[{row['method']}]", row['revenue'])
        note('unassigned', data['unassigned']['revenue'])
        return found

    def test_a_quiet_day_and_a_busy_one_are_written_to_the_same_scale(self):
        today = self.business_today()
        self.take(at='11:00', services=[self.cut], employee=self.chair,
                  paid_with='cash', rung_up=timezone.now() - timedelta(days=2))

        data = self.analytics(self.owner_session)
        busy = self.on_day(data, today - timedelta(days=2))
        quiet = self.on_day(data, today)

        # The numbers are right either way — it is only how they are written.
        self.assertEqual(Decimal(busy['revenue']), Decimal('900'))
        self.assertEqual(Decimal(quiet['revenue']), Decimal('0'))

        found = self.spellings(data)
        self.assertEqual(sorted(found), [-2],
                         f'one payload, {len(found)} spellings of a taka: '
                         f'{ {scale: sorted(v)[:3] for scale, v in found.items()} }')

    def test_even_a_week_with_nothing_in_it_is_written_two_ways(self):
        """The same defect with no timing in it at all.

        A brand-new salon has taken nothing, and `headline.revenue` still comes
        back as `'0'` beside a series of `'0.00'` — `Coalesce`'s literal zero is
        no more rescaled than a `Sum` is. This is the reproduction to run: it
        needs no rows, no clock and no window.
        """
        quiet = self.make_owner(phone='01913335555', business_name='New Salon')
        data = self.analytics(quiet)

        self.assertEqual(data['headline']['revenue'], '0.00')
        self.assertEqual(sorted(self.spellings(data)), [-2])


class TheShapeOfThePayloadTests(ReportTestCase):
    """The keys themselves.

    Both screens are wired field by field against this contract, and a renamed
    or dropped key does not raise anything on the way through — it arrives as
    `undefined`, renders as a blank panel or a zero, and looks like a quiet
    week. Nothing else in this file would notice, so the shape is asserted
    here on its own.
    """

    ANALYTICS_KEYS = {
        'viewpoint', 'period', 'from', 'to', 'headline', 'returning', 'series',
        'by_staff', 'unassigned', 'by_service', 'by_payment',
    }
    PERFORMANCE_KEYS = {
        'viewpoint', 'period', 'from', 'to', 'headline', 'series', 'by_service',
        'commission_rate', 'commission', 'salon',
    }
    HEADLINE_KEYS = {'revenue', 'platform_fees', 'tips', 'bookings', 'average_ticket'}

    def setUp(self):
        super().setUp()
        self.take(at='11:00', services=[self.cut], employee=self.chair,
                  paid_with='cash', tip='50.00')

    def test_analytics_answers_with_exactly_the_keys_the_screen_reads(self):
        data = self.analytics(self.owner_session)
        self.assertEqual(set(data), self.ANALYTICS_KEYS)
        self.assertEqual(set(data['headline']), self.HEADLINE_KEYS)
        self.assertEqual(set(data['returning']),
                         {'repeat', 'first_time', 'repeat_share'})
        self.assertEqual(set(data['series'][0]), {'date', 'revenue', 'bookings'})
        self.assertEqual(set(data['by_staff'][0]),
                         {'employee_id', 'name', 'revenue', 'bookings',
                          'commission_rate', 'commission'})
        self.assertEqual(set(data['unassigned']), {'revenue', 'bookings'})
        self.assertEqual(set(data['by_service'][0]), {'name', 'revenue', 'bookings'})
        self.assertEqual(set(data['by_payment'][0]), {'method', 'revenue', 'bookings'})

    def test_performance_answers_with_exactly_the_keys_the_screen_reads(self):
        data = self.performance(self.stylist)
        self.assertEqual(set(data), self.PERFORMANCE_KEYS)
        self.assertEqual(set(data['headline']), self.HEADLINE_KEYS)
        self.assertEqual(set(data['series'][0]), {'date', 'revenue', 'bookings'})
        self.assertEqual(set(data['by_service'][0]), {'name', 'revenue', 'bookings'})

    def test_an_employees_own_record_does_not_carry_the_salons_ranking(self):
        """`by_staff` on this payload would be the whole floor's takings
        arriving on a screen headed "you"."""
        data = self.performance(self.stylist)
        for absent in ('by_staff', 'unassigned', 'returning', 'by_payment'):
            self.assertNotIn(absent, data)

    def test_every_count_is_a_number_and_every_sum_is_a_decimal_string(self):
        """A float anywhere here is the client-side arithmetic coming back."""
        data = self.analytics(self.owner_session)
        head = data['headline']
        for key in ('revenue', 'platform_fees', 'tips', 'average_ticket'):
            self.assertIsInstance(head[key], str, key)
        self.assertIsInstance(head['bookings'], int)
        self.assertNotIsInstance(head['bookings'], bool)
        for entry in data['series']:
            self.assertIsInstance(entry['revenue'], str)
            self.assertIsInstance(entry['bookings'], int)
        row = data['by_staff'][0]
        self.assertIsInstance(row['employee_id'], str)
        self.assertIsInstance(row['commission_rate'], int)
        self.assertIsInstance(row['commission'], str)
        self.assertIsInstance(row['revenue'], str)

    def test_asking_for_no_period_at_all_is_answered_with_the_week(self):
        """The screens open on the week before anybody has chosen anything."""
        for url, session in ((ANALYTICS, self.owner_session),
                             (PERFORMANCE, self.stylist)):
            self.as_user(session)
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['period'], 'week')
            self.assertEqual(len(response.data['series']), 7)


class TheLetGoEmployeeTests(ReportTestCase):
    """A chair that was closed. The person keeps their account and their app;
    what they must not keep is the salon's figures."""

    def setUp(self):
        super().setUp()
        self.take(at='11:00', services=[self.cut], employee=self.chair)

    def let_go(self, employment) -> None:
        self.as_user(self.owner_session)
        response = self.client.delete(f'/api/salon/employees/{employment.id}/')
        self.assertEqual(response.status_code, 204, response.data)

    def test_their_own_record_closes_with_them(self):
        """No active employment is no viewpoint, and `performance` is refused
        rather than answering about a chair they no longer sit in."""
        self.let_go(self.chair)
        response = self.report(PERFORMANCE, self.stylist, expect=403)
        self.assertEqual(response.data['code'], 'permission_denied')

    def test_they_can_no_longer_read_the_takings_off_the_analytics_endpoint(self):
        """`analytics` answers any role, so the closed chair has to fall out of
        the scope rather than out of the routing.

        Ending the employment hands a hired barber their own trade back, so the
        viewpoint becomes `barber` and the book it opens on is their own — which
        is empty, because every one of these rows belongs to the salon.
        """
        self.let_go(self.chair)
        data = self.analytics(self.stylist)
        self.assertNotEqual(data['viewpoint'], 'employee')
        self.assertHeadline(data, revenue='0.00', bookings=0)
        self.assertEqual(data['by_staff'], [])
        self.assertEqual(data['by_service'], [])
        self.assertTakings(data['unassigned'], revenue='0.00', bookings=0)

    def test_the_salon_keeps_the_money_that_was_taken_at_that_chair(self):
        """Ending the employment ends the access, not the history: the work
        was done and the salon took the money."""
        self.let_go(self.chair)
        data = self.analytics(self.owner_session)
        self.assertHeadline(data, revenue='900.00', bookings=1)
        self.assertMoney(self.staff_row(data, self.chair)['revenue'], '900.00')


class ARetiredPaymentMethodTests(ReportTestCase):
    """EXPECTED FAILURE — a latent defect in `_by_payment`, not in this test.

    `_by_payment` groups on the stored column and *then* renames anything
    outside `PaymentMethod.choices` to `unrecorded`. Two different stored
    values that both fold into `unrecorded` therefore come back as two rows
    both calling themselves `unrecorded`: the grouping happened before the
    renaming, so nothing merges them.

        [{'method': 'unrecorded', 'revenue': '900', 'bookings': 1},
         {'method': 'unrecorded', 'revenue': '900', 'bookings': 1}]

    Today's API cannot produce this — the serializer validates `paid_with`
    against the same choices — so it is latent rather than live. It becomes
    reachable the moment a method is retired from `PaymentMethod` (the `known`
    set exists precisely because the author expected that to happen), or data
    is imported from anywhere else. A screen keying its rows by `method` then
    prints "Not recorded" twice and duplicates a React key.

    `_by_payment` now folds the unknown rows into one bucket after grouping,
    which is what this guards.
    """

    def test_a_method_no_longer_on_the_menu_does_not_split_the_unrecorded_row(self):
        self.take(at='11:00', services=[self.cut])                 # nobody said
        paid = self.take(at='12:00', services=[self.cut], paid_with='rocket')
        # Rocket is withdrawn: the row keeps the word, the menu no longer has it.
        Appointment.objects.filter(pk=paid['id']).update(paid_with='obsolete')

        rows = self.analytics(self.owner_session)['by_payment']
        methods = [row['method'] for row in rows]
        self.assertNotIn('cash', methods)
        self.assertEqual(methods.count('unrecorded'), 1,
                         f'one bucket per method, got {rows}')
        self.assertTakings(
            next(row for row in rows if row['method'] == 'unrecorded'),
            revenue='1800.00', bookings=2)
