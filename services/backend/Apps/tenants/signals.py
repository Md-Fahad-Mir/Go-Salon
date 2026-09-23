"""A business never exists without its tenant, however it was made.

Registration provisions one explicitly, which is where the interesting version
of this lives — see `SalonOwnerRegistrationSerializer.build_profile`. These
receivers are the floor under that: a `Salon` typed into Django admin, one
created from a shell, one restored by a fixture or an import script. None of
those go anywhere near a serializer, and each is a way for a business to end up
on the platform with nothing to file its rows under.

Rather than teaching every one of those call sites about tenancy, the rule is
attached to the act of creating the row. `post_save` with `created=True` is the
narrowest hook that catches all of them, and because provisioning is idempotent
the receivers are harmless when registration has already done the work a moment
earlier.

WHAT THIS DOES NOT CATCH

`bulk_create` does not send `post_save`. A `Salon` or `BarberProfile` inserted
that way still arrives without a tenant, and `tenant_for` will say so loudly
the first time a row is filed under it. Nothing in this project bulk-creates
either model; it is written down here because the next person to reach for it
should know.
"""

from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from Apps.users.models import BarberProfile, Salon

from .provisioning import is_independent_business, provision_for_barber, provision_for_salon


@receiver(post_save, sender=Salon, dispatch_uid='tenants.provision_salon')
def provision_salon_tenant(sender, instance, created, **kwargs):
    """A salon is always a business, so a new one always gets a tenant."""
    if not created:
        return
    # Cheap guard rather than relying on `_allocate`'s own: registration has
    # usually just made this one, and there is no reason to go and look again.
    if getattr(instance, 'tenant', None) is not None:
        return
    provision_for_salon(instance)


@receiver(post_save, sender=BarberProfile, dispatch_uid='tenants.provision_barber')
def provision_barber_tenant(sender, instance, created, **kwargs):
    """A barber profile gets one only if it is a trade rather than a record.

    Every hired stylist is given a profile when they are taken on, and it must
    stay tenantless — their salon is the business. The test is delegated to
    `is_independent_business` rather than rewritten here, so this receiver and
    the backfill cannot come to disagree about what counts as a business.
    """
    if not created:
        return
    if getattr(instance, 'tenant', None) is not None:
        return
    if not is_independent_business(instance):
        return
    provision_for_barber(instance)
