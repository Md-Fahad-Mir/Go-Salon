"""Which tenant a request is acting in, established once, at the edge.

The client states it — `X-Tenant-Id` — and the server verifies it against a
membership record before anything downstream trusts it. Those are two separate
halves and both are required: a stated tenant with no membership behind it is
refused, and there is no route by which a client's assertion alone reaches a
queryset.

WHY A PERMISSION CLASS AND NOT MIDDLEWARE

Because middleware cannot see who is asking. Django runs it before DRF
authenticates, so `request.user` at that point is whatever
`AuthenticationMiddleware` put there from the session — for this project's
JWT-only clients, an unauthenticated `SimpleLazyObject`. Measured, not assumed:
a probe middleware on a request carrying a valid bearer token reports
`is_authenticated = False`. A membership check needs the account, so it cannot
run there.

`Apps/users/ws_auth.py::JWTAuthMiddleware` looks like a counter-example and is
not. It is a *Channels* middleware, and it does the authentication itself —
it calls `JWTAuthentication` directly and puts the result on the scope. An
HTTP middleware doing the same would be a second authentication stack beside
DRF's, which is exactly what that module's docstring says it exists to avoid.

Nor an authentication class: those answer "who is this?", and DRF walks them
until one succeeds. This answers "where are they standing?", which is a
question about authorisation and only has meaning once identity is settled.

WHAT IT REFUSES, AND WITH WHICH STATUS

  400  an account that belongs to several tenants and named none — there is
       nothing to resolve and guessing would be the bug this replaces
  404  an id that is unknown *or* inactive, deliberately not distinguished:
       telling the two apart would let anyone enumerate which salons exist
  403  a real tenant the account does not belong to. Never a fallback to one
       they do belong to — a silent redirect is how a cross-tenant link
       becomes a cross-tenant read

WHEN THE HEADER IS ABSENT

Three different situations, and they get three different answers:

  one tenant     use it. The convenience Step 6c leaned on, so a one-salon
                 owner need not announce which salon they mean. Not a way
                 round the check — it can only ever pick a tenant the account
                 already belongs to.
  several        400. There is a choice to be made and it is not this layer's
                 to make; guessing is the bug Step 6c spent itself removing.
  none at all    proceed with no tenant. A platform admin, or a customer who
                 has not joined anywhere yet — asking them to name a salon
                 would be asking for one that does not exist. Every
                 tenant-scoped read then answers empty, because `scoped`
                 refuses a `None` tenant outright and the owner lookups
                 return `None`.

`StrictTenantContext` below drops the first of those.

ORDER MATTERS WHERE THIS IS LISTED

After `IsAuthenticated`, so a missing token is still a 401 rather than a 403.
After the role classes too, so a customer reaching a provider-only endpoint is
told they are not a provider rather than asked which salon they mean — the
role is the more fundamental refusal and the more useful thing to hear.
"""

from __future__ import annotations

from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission

from .context import belongs_to, tenants_of
from .models import Tenant

#: The header a client names its tenant in. One place, so the tests and the
#: eventual frontend cannot disagree about the spelling.
TENANT_HEADER = 'X-Tenant-Id'


class TenantContext(BasePermission):
    """Resolves and verifies the tenant, then puts it on the request.

    Composes with the role permissions rather than replacing them: a view
    lists `(IsAuthenticated, IsSalonOrParlorOwner, TenantContext)` and each
    still answers its own question, in that order.
    """

    #: When no header is sent, fall back to the account's only tenant.
    allow_sole_tenant_fallback = True

    message = 'You do not have access to that salon.'

    def has_permission(self, request, view) -> bool:
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            # `IsAuthenticated` is what refuses this; saying so here as well
            # would turn a 401 into a 403 and cost the client the difference.
            return False

        raw = request.headers.get(TENANT_HEADER)

        if not raw:
            if not self.allow_sole_tenant_fallback:
                raise ValidationError(
                    {TENANT_HEADER: ['Say which salon this request is about.']},
                    code='tenant_required',
                )

            belongs = tenants_of(user)
            if len(belongs) == 1:
                request.tenant = belongs[0]
                return True

            if belongs:
                # Several, and none named. There is a choice to make and it is
                # not this layer's to make — that guess is the bug Step 6c
                # spent itself removing.
                raise ValidationError(
                    {TENANT_HEADER: ['Say which salon this request is about.']},
                    code='tenant_required',
                )

            # None at all: a platform admin, or a customer who has not joined
            # anywhere yet. Asking them to name a salon would be asking for
            # something that does not exist, so the request proceeds with no
            # tenant and every tenant-scoped read answers empty — `scoped`
            # refuses a `None` tenant outright, and the owner lookups return
            # None, so nothing downstream can mistake this for access.
            request.tenant = None
            return True

        tenant = Tenant.objects.filter(pk=_as_int(raw), is_active=True).first()
        if tenant is None:
            # Unknown and suspended answer the same, on purpose.
            raise NotFound('No such salon.', code='tenant_not_found')

        if not belongs_to(user, tenant):
            raise PermissionDenied(self.message, code='not_a_member')

        request.tenant = tenant
        return True


class StrictTenantContext(TenantContext):
    """`TenantContext` with no fallback: the header is required, always.

    For endpoints where guessing is never acceptable even for an account with
    one tenant. Nothing uses it yet; it exists so that tightening a view later
    is a one-word change rather than an argument about where the rule lives.
    """

    allow_sole_tenant_fallback = False


class OptionalTenantContext(TenantContext):
    """Verify a tenant if one is named; carry on without if not.

    For the handful of endpoints that have to answer before a tenant has been
    chosen — `/api/profile/me/` is the case this exists for, since the app
    draws the signed-in account from it on the way in, and an owner of two
    salons has not yet said which one they are opening.

    The distinction is only about the *absence* of a header. A header that is
    present is resolved and membership-checked exactly as everywhere else: an
    unknown id is still a 404 here and somebody else's salon is still a 403.
    What changes is that no header means no tenant, rather than a 400 — and
    the view then does whatever it did before this step, which for
    `profile_payload` is to fall back to the account's only tenant and
    otherwise report nothing.
    """

    def has_permission(self, request, view) -> bool:
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return False
        if not request.headers.get(TENANT_HEADER):
            return True
        return super().has_permission(request, view)


def _as_int(raw: str) -> int:
    """The header as a primary key, or a value that matches nothing.

    A non-numeric id is not a bad request — it is an id for a salon that does
    not exist, and it gets the same 404 as any other, so a client cannot learn
    the shape of the key space by malforming it.
    """
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0
