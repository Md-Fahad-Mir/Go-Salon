"""Shared scaffolding: a salon that is actually open, with a menu and a chair."""

from __future__ import annotations

from datetime import date, timedelta

from django.test import override_settings

from Apps.services.models import Service
from Apps.tenants.models import CustomerTenantMembership, Tenant
from Apps.users.models import BarberProfile, Salon, SalonEmployee, User
from Apps.users.tests.base import AuthTestCase

WEEK = ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')

#: Far enough ahead that "too soon" never interferes, and a fixed weekday so a
#: test run on a Friday does not land on a closed day.
def next_monday() -> date:
    from django.utils import timezone

    today = timezone.localdate()
    return today + timedelta(days=(7 - today.weekday()) % 7 or 7)


def all_week(start='10:00', end='20:00') -> dict:
    return {'days': [
        {'day': day, 'is_closed': False, 'intervals': [{'start': start, 'end': end}]}
        for day in WEEK
    ]}


@override_settings(SMS_PROVIDER='locmem')
class BookingTestCase(AuthTestCase):
    """An owner with a salon, opening hours, a menu and one chair; plus a
    customer to book it."""

    def setUp(self):
        super().setUp()
        self.owner_session = self.make_owner()
        self.owner = User.objects.get(pk=self.owner_session['user']['id'])
        self.salon = Salon.objects.get(owner=self.owner)

        self.as_user(self.owner_session)
        self.client.put('/api/schedule/me/', all_week(), format='json')
        self.cut = self._service('Ladies cut', '900.00', 60)
        self.colour = self._service('Colour', '3500.00', 90, buffer=20)
        self.chair = self._hire('01755000004', 'Hasan Mahmud')

        self.customer_session = self.make_customer()
        self.customer = User.objects.get(pk=self.customer_session['user']['id'])
        self.tenant = Tenant.objects.get(salon=self.salon)
        self.join(self.customer)
        self.day = next_monday()

    def join(self, customer: User, tenant=None) -> CustomerTenantMembership:
        """Put a customer on the salon's books, the way scanning its QR would.

        Standing in for the join endpoint, which Step 6d builds. Written out in
        the fixture rather than made to happen automatically — no signal, no
        side effect of booking — because a customer joining a salon is a thing
        they *do*, and a test that gets it for free would stop noticing when
        the real endpoint stops doing it.
        """
        membership, _ = CustomerTenantMembership.objects.get_or_create(
            customer=customer, tenant=tenant or self.tenant,
        )
        return membership

    def make_customer(self, **overrides) -> dict:
        """A customer who has already joined this salon.

        Tests routinely make a second or third customer to prove one cannot
        see another's bookings, and every one of them needs to be on the
        salon's books before they can book anything — a real customer scans
        the QR code, and `TenantContext` refuses anyone who has not.

        Joining here rather than in each test keeps that a property of the
        fixture, which is what it is. Customers made before `self.tenant`
        exists (the one in `setUp`) are joined explicitly there instead.
        """
        session = super().make_customer(**overrides)
        tenant = getattr(self, 'tenant', None)
        if tenant is not None:
            self.join(User.objects.get(pk=session['user']['id']), tenant)
        return session

    def tenant_of(self, business) -> Tenant:
        """The tenant of a `Salon` or a `BarberProfile`."""
        key = 'salon' if isinstance(business, Salon) else 'barber_profile'
        return Tenant.objects.get(**{key: business})

    def customer_at(self, business, customer=None, session=None) -> Tenant:
        """Join the customer to a business and act as them *there*.

        A customer who has scanned two salons belongs to both, and the
        fallback in `tenant_of_request` cannot pick between them — nor should
        it. So this names the tenant on the request as well as creating the
        membership, which is the pair a real client will send once Step 6d
        gives it somewhere to put the identifier.
        """
        tenant = self.tenant_of(business)
        self.join(customer or self.customer, tenant)
        self.as_user(session or self.customer_session, tenant=tenant)
        return tenant

    # --- building the salon ------------------------------------------------

    def _service(self, name: str, price: str, minutes: int, buffer: int = 0) -> Service:
        response = self.client.post('/api/services/', {
            'name': name, 'price': price, 'duration_minutes': minutes,
            'buffer_minutes': buffer,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return Service.objects.get(pk=response.data['id'])

    def _hire(self, phone: str, name: str) -> SalonEmployee:
        response = self.client.post('/api/salon/employees/', {
            'phone': phone, 'name': name, 'password': 'chairside2026',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return SalonEmployee.objects.get(pk=response.data['id'])

    def verify(self, phone: str) -> User:
        user = User.objects.get(phone=phone)
        user.is_phone_verified = True
        user.save(update_fields=['is_phone_verified'])
        return user

    # --- booking -----------------------------------------------------------

    def slots(self, *, listing='salon', services=None, employee=None, day=None):
        params = {
            'listing': listing if '-' in listing else f'salon-{self.salon.id}',
            'date': (day or self.day).isoformat(),
        }
        if services:
            params['service_ids'] = ','.join(str(s.id) for s in services)
        if employee:
            params['employee'] = employee.id
        response = self.client.get('/api/bookings/availability/', params)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['slots']

    def free_times(self, **kwargs) -> list[str]:
        return [slot['time'] for slot in self.slots(**kwargs) if slot['available']]

    def book(self, *, time='11:00', services=None, employee=None, day=None,
             listing=None, notes='', expect=201):
        payload = {
            'listing': listing or f'salon-{self.salon.id}',
            'date': (day or self.day).isoformat(),
            'time': time,
            'service_ids': [s.id for s in (services or [self.cut])],
            'notes': notes,
        }
        if employee:
            payload['employee'] = employee.id
        response = self.client.post('/api/bookings/', payload, format='json')
        if expect is not None:
            self.assertEqual(response.status_code, expect, response.data)
        return response
