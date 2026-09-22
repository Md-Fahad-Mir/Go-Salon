# GO SALON — MULTI-TENANCY ARCHITECTURE AUDIT

**Status:** read-only analysis. No file in `services/` was modified, no code generated, no migration created, no package installed, no database written.
**Audited tree:** `Eureka-Salon-Automation/services/` at commit `4339409`.
**Audience:** the engineer who will implement multi-tenancy later.

Conventions used throughout:

- **FACT** — verified by reading the code. A file and symbol is cited.
- **ASSUMPTION** — my inference, not established by the codebase.
- **UNCLEAR FROM CODEBASE** — the code does not answer it; you must.
- **RECOMMENDATION** — architectural opinion, clearly separated from fact.

---

## 1. Executive Summary

**The project is called "Eureka", not "Go Salon", in every file.** `services/frontend/package.json` names the app `eureka-app`, the AI service is `Hair AI Analysis API`, the admin console is `Eureka Admin Dashboard`, and the SMS copy says "Your Eureka verification code is …" (`Apps/users/services/otp.py`). I have audited this repository as the system you mean by "Go Salon". If there is a second, different Go Salon codebase, this report does not describe it.

**There is no tenancy of any kind in the codebase today.** A repository-wide search for `tenant`, `subdomain`, `get_host`, `HTTP_HOST` and `request.headers` across `services/backend/Apps`, `services/backend/core`, `services/frontend/src` and `services/admin-dashboard/src` returns **zero hits**. Nothing reads the hostname. `ALLOWED_HOSTS` defaults to `localhost,127.0.0.1` and `CORS_ALLOWED_ORIGINS` is an explicit list with no regex support configured.

**But the codebase is unusually well positioned for the change.** It already has a consistent, database-enforced notion of "which business does this row belong to": a polymorphic `(salon, barber)` pair guarded by a `CheckConstraint` named `…_has_exactly_one_owner` / `…_has_exactly_one_business` on `Service`, `GalleryImage` and `Appointment`, and a three-way version on `WorkingDay`. Every appointment-derived read in the entire backend flows through **one function**, `Apps/bookings/access.py::scoped(user)`, which the realtime layer and the reviews app both deliberately reuse rather than reimplement. That single choke point is the most valuable asset you have for this migration.

**The five findings that will decide the project:**

1. **The product is a two-sided marketplace, not a set of isolated salon apps.** `GET /api/directory/` returns *every* salon and barber on the platform to *any* authenticated user, with phone numbers, staff, prices, hours and galleries (`Apps/directory/views.py::DirectoryListView`). A customer searches across businesses, compares them and books one. `Apps/reviews/ratings.py::scores_for` aggregates ratings across all salons and all barbers in two queries. If each salon gets its own subdomain and its own isolated data, **the customer-facing half of this product has no home**. This is a product decision, not a technical one, and it blocks every other decision. See §36 Q1.

2. **A "business" is already two different things and neither is a tenant.** `Salon` (with staff) and `BarberProfile` (a lone barber, no staff) are both first-class businesses that take bookings. `BarberProfile` is *also* the personal trade record of every salon employee — 21 of the 28 `BarberProfile` rows in the development database belong to `salon_employee` users (`Apps/users/serializers.py::SalonEmployeeCreateSerializer.create` creates one for every hire). Whatever a "tenant" becomes, this dual role must be resolved first.

3. **Identity is global and single-role, and the schema enforces it.** `User.phone` is `unique=True` platform-wide; `User.role` is one `CharField`; and `SalonEmployee` carries `UniqueConstraint(fields=('user',), condition=Q(is_active=True), name='unique_active_employment_per_user')` — **one person cannot hold two jobs**, at database level. Multi-salon staff, or a customer who is also a barber, requires dropping or rewriting that constraint.

4. **There is no payment system and no storage system to make tenant-aware.** No payment gateway, no webhook handler, no transaction model, no subscription model exist anywhere (`grep -ri "webhook|stripe|sslcommerz|razorpay|paypal|subscription"` over the backend returns only the `PaymentMethod` *label* choices and frontend mock data). `api.payments.charge` in `services/frontend/src/utils/api.ts` is a `setTimeout` returning a fake reference. All images are **base64 `data:` URLs stored in `TEXT` columns** — 2.4 MB of the 3.7 MB development database is the `portfolio_galleryimage.image` column. There is no `MEDIA_ROOT`, no upload endpoint, no S3, no Cloudinary (`Apps/common/images.py` says so explicitly). These are greenfield, which is good news for tenancy and bad news for the schedule.

5. **The AI service is entirely unauthenticated and the credit system is client-side only.** `services/ai/main.py` exposes `POST /analyze` and `POST /generate` with no auth of any kind — only a CORS origin list stands between the internet and your OpenRouter key. `User.try_on_credits` exists as a column but is **never decremented anywhere in the backend** (`grep -rn try_on_credits` finds only the model, the serializer read, the registration default and the admin). Credit enforcement lives in the browser store. This is already a live cost-and-abuse exposure, independent of tenancy.

**Verdict in one line:** the existing project can be migrated — it should not be rewritten — but "convert to multi-tenancy" as literally stated would remove the marketplace, and the real work is not the tenant column, it is the four systems that do not exist yet (payments, storage, AI accounting, a real admin backend).

---

## 2. Current Architecture

### 2.1 Repository layout

```
Eureka-Salon-Automation/
└── services/
    ├── backend/            Django 6.1 + DRF + Channels    (~14,350 LOC Python)
    ├── frontend/           React 19 + Vite 8 PWA          (customer + provider apps)
    ├── admin-dashboard/    React 19 + Vite 8              (NO BACKEND — all mock)
    └── ai/                 FastAPI + OpenRouter           (stateless, no database)
```

There is **no** `docker-compose.yml`, no `.github/`, no CI pipeline, no nginx or reverse-proxy config, no Procfile, no Kubernetes manifest, no Terraform. The only container definition in the repository is `services/ai/Dockerfile`. **There is no deployment configuration to modify** — §29 is therefore a greenfield design, not a migration.

### 2.2 Request flow, as it actually is

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │ BROWSER (one origin: localhost:5174 in dev)                         │
 │  React 19 SPA  ·  zustand persist → localStorage "eureka.app"       │
 │  BrowserRouter, ~60 routes, role-guarded client-side                │
 └───────┬──────────────────────────────────────┬──────────────────────┘
         │ VITE_API_BASE_URL                    │ VITE_AI_API_URL
         │ Bearer <access JWT>                  │ NO CREDENTIALS AT ALL
         │                                      │ multipart: customer photo
         ▼                                      ▼
 ┌───────────────────────────────┐   ┌──────────────────────────────────┐
 │ DJANGO 6.1 / DRF (:8000)      │   │ FASTAPI (:8001)  services/ai     │
 │  daphne ASGI                  │   │  POST /analyze   POST /generate  │
 │  6 middleware (stock only)    │   │  stateless — nothing persisted   │
 │  DEFAULT_PERM = IsAuthenticated│   │  CORS origin list is the only    │
 │  JWTAuthentication            │   │  access control                  │
 └──────┬──────────────────┬─────┘   └───────────────┬──────────────────┘
        │ HTTP             │ WebSocket               │
        │ /api/...         │ /ws/bookings/           ▼
        │                  │ OriginValidator  ┌──────────────────┐
        │                  │ + JWTAuthMiddleware│ OpenRouter API │
        ▼                  ▼                  │ vision + image   │
 ┌────────────────────────────────┐           └──────────────────┘
 │ SQLite  db.sqlite3  (3.7 MB)   │
 │  hard-coded in settings.py     │      ┌───────────────────────────┐
 │  no env override, no Postgres  │      │ channels layer:           │
 └────────────────────────────────┘      │ InMemoryChannelLayer      │
                                         │ (Redis only if REDIS_URL) │
 ┌────────────────────────────────┐      └───────────────────────────┘
 │ SMS provider (console in dev)  │
 │ Apps/users/services/sms.py     │      ┌───────────────────────────┐
 │ no real gateway configured     │      │ admin-dashboard (:5173)   │
 └────────────────────────────────┘      │ NO network calls at all   │
                                         └───────────────────────────┘
```

### 2.3 Stack facts

| Concern | Current implementation | Source |
|---|---|---|
| Backend framework | Django `>=6.1.1` | `services/backend/pyproject.toml` |
| API framework | djangorestframework `>=3.18.1` | same |
| Auth library | djangorestframework-simplejwt `>=5.5.1`, with `token_blacklist` installed | `core/settings.py` INSTALLED_APPS |
| Realtime | `channels[daphne] >=4.3.2` | `pyproject.toml`, `core/asgi.py` |
| CORS | `django-cors-headers >=4.9.0` | `core/settings.py` MIDDLEWARE |
| Python | `requires-python = ">=3.13"`, `uv.lock` present | `pyproject.toml` |
| Database | **SQLite**, `BASE_DIR / 'db.sqlite3'`, hard-coded | `core/settings.py` DATABASES |
| Database env override | **none** — no `DATABASE_URL`, no `dj-database-url` | `core/settings.py`, `.env.example` |
| Object storage | **none**. No `MEDIA_ROOT`, no `DEFAULT_FILE_STORAGE`, no Pillow in backend | `Apps/common/images.py` docstring |
| Background workers | **none**. No Celery, no RQ, no cron, no `@receiver`, no `post_save`/`pre_save` | repo-wide grep |
| Caching | **none used**. No `CACHES` setting; DRF throttles fall back to default `LocMemCache` | `core/settings.py` |
| Payments | **none**. `PaymentMethod` is a label enum only | `Apps/bookings/models.py` |
| AI | separate FastAPI service, OpenRouter (`openai/gpt-4o` vision, `google/gemini-3.1-flash-image`) | `services/ai/.env.example` |
| Frontend | React 19.2, Vite 8, React Router 7, zustand 5, TypeScript strict | `services/frontend/package.json` |
| Admin console | React 19 + Recharts, **no backend, no fetch, no auth** | `services/admin-dashboard/README.md` |
| Deployment | **nothing committed** | repo-wide find |
| Tests | 24 Django test modules, ~4,700 LOC, no frontend tests | `Apps/*/tests/` |

### 2.4 Django apps

`INSTALLED_APPS` app entries (`core/settings.py`): `Apps.users`, `Apps.services`, `Apps.schedules`, `Apps.portfolio`, `Apps.directory`, `Apps.bookings`, `Apps.reviews`.

`Apps.common` is a plain package (not installed, no models) holding `images.py` (the `ImageRefField`) and `text.py` (`StringListField`).
`Apps.directory` has **no models and no migrations** — it is a read-only projection over `users`, `services`, `schedules`, `portfolio` and `reviews`.

### 2.5 Middleware — the tenant-resolution gap

```python
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
```

**FACT: every entry is stock Django. There is no custom middleware in this project at all**, and therefore no request-level context object, no thread-local, no `request.tenant`, and nothing to extend. Tenant resolution has to be built from nothing — which is simpler than unpicking something wrong, but it means §5 is new construction.

---

## 3. Current Database Architecture

### 3.1 The ownership pattern that already exists

This is the single most important structural fact in the audit. The codebase has no `tenant_id`, but it does have a **rigorously enforced polymorphic business owner**:

| Model | Owner columns | Enforcement |
|---|---|---|
| `Service` | `barber` XOR `salon` | `CheckConstraint(name='service_belongs_to_exactly_one_owner')` + `clean()` |
| `GalleryImage` | `barber` XOR `salon` | `CheckConstraint(name='gallery_image_has_exactly_one_owner')` + `clean()` |
| `Appointment` | `salon` XOR `barber` | `CheckConstraint(name='appointment_has_exactly_one_business')` + `clean()` |
| `WorkingDay` | `salon` XOR `barber` XOR `employment` | `CheckConstraint(name='working_day_has_exactly_one_owner')` |

Everything else reaches its owner transitively: `WorkingInterval → WorkingDay`, `AppointmentService → Appointment`, `AppointmentNotification → Appointment`, `Review → Appointment`.

`Apps/reviews/models.py` documents this deliberately and at length: *"a denormalised salon id is a second version of the truth waiting to disagree with the first, and the appointment is already the row every permission rule in this project is written against."* Any tenant design that denormalises a `tenant_id` onto `Review` is arguing with an explicit, reasoned decision — worth knowing before you make it.

### 3.2 Full model table

| Model | File | Current purpose | Tenant type | Current owner | Required change | Risk |
|---|---|---|---|---|---|---|
| `User` | `Apps/users/models.py` | Account. Phone is the username. One role. | **CROSS-TENANT** | — (global) | Decide: global identity + membership table, or per-tenant accounts. Affects `phone` uniqueness. | **HIGH** |
| `CustomerProfile` | same | Gender, hair type/length, location, avatar | USER-SPECIFIC | `user` (1-1) | None if customers stay global | LOW |
| `BarberProfile` | same | **Two jobs:** an independent barber's business *and* every employee's personal trade record | **UNCLEAR / TENANT-ROOT + USER-SPECIFIC** | `user` (1-1) | Must be split or disambiguated before tenancy | **HIGH** |
| `Salon` | same | The shop. `owner` FK → User | **TENANT ROOT** | `owner` | Becomes the tenant, or gains FK to a new `Tenant`. Needs `slug`, `is_active`, `plan` | **HIGH** |
| `SalonEmployee` | same | Employment: salon × user × title × commission | **TENANT MEMBERSHIP** (it already is one) | `salon` | Constraints must change if staff may work at 2 salons | **HIGH** |
| `OTPCode` | same | Hashed one-time code, purpose, attempts | GLOBAL (auth) | `user` | None | LOW |
| `ServiceCategory` | `Apps/services/models.py` | Price-list heading. `owner=NULL` → shared catalogue | **GLOBAL when owner is NULL, USER-SPECIFIC otherwise** | nullable `owner` → User | Decide global vs per-tenant; fix the NULL uniqueness hole (§17) | MEDIUM |
| `Service` | same | One price-list line | TENANT-SPECIFIC | `barber` XOR `salon` | Add/derive tenant; `eligible_employees` M2M must stay in-tenant | MEDIUM |
| `Service.eligible_employees` | same (M2M) | Which chairs may perform it. **Empty = all active staff** | TENANT-SPECIFIC | implied by `salon` | Cross-tenant write already blocked in serializer `__init__`; keep | MEDIUM |
| `WorkingDay` | `Apps/schedules/models.py` | One weekday, open or closed | TENANT-SPECIFIC | `salon` XOR `barber` XOR `employment` | Tenant-derive; unique constraints already partial and correct | MEDIUM |
| `WorkingInterval` | same | One stretch of a day | TENANT-SPECIFIC (derived) | `day` | None beyond cascade | LOW |
| `GalleryImage` | `Apps/portfolio/models.py` | Portfolio photo as a `data:` URL | TENANT-SPECIFIC | `barber` XOR `salon` | Tenant-derive; storage rework is the real work (§23) | MEDIUM |
| `Appointment` | `Apps/bookings/models.py` | The booking. Money, times, status, walk-in flag | **CROSS-TENANT** (global customer × tenant business) | `salon` XOR `barber`, plus `customer`, `employee` | Add tenant column + rebuild the 3 composite indexes | **HIGH** |
| `AppointmentService` | same | Frozen bill line (price/duration at booking time) | TENANT-SPECIFIC (derived) | `appointment` | None | LOW |
| `AppointmentNotification` | same | SMS attempt + outcome record | TENANT-SPECIFIC (derived) | `appointment` | Per-tenant SMS sender ID would change this | LOW |
| `Review` | `Apps/reviews/models.py` | 1–5 stars + text + business reply | TENANT-SPECIFIC (derived, deliberately) | `appointment` (1-1) | None if you honour the model's stated design | LOW–MED |
| `OutstandingToken` / `BlacklistedToken` | simplejwt | Refresh-token ledger | **GLOBAL** | `user` | Tokens are platform-wide today; see §7/§16 | **HIGH** |

**No model in the codebase contains AI-generated data, payment transactions, subscriptions, chat/messages, reports, or settings.** Those seven categories from your brief do not exist. Analytics are computed on the fly in `Apps/bookings/reports.py`; there is no reports table.

### 3.3 Development data profile (read-only query of `db.sqlite3`)

| Table | Rows | Note |
|---|---|---|
| `users_user` | 57 | 22 `salon_employee`, 12 `customer`, 12 `salon_owner`, 9 `barber`, 2 `admin` |
| `users_salon` | 7 | **12 owner accounts but only 7 salons — 5 owners have no salon** |
| `users_salonemployee` | 18 | 0 users with >1 employment row, active or historic |
| `users_barberprofile` | 28 | 21 belong to `salon_employee`, 6 to `barber`, **1 to a `salon_owner`** |
| `bookings_appointment` | 17 | 14 salon, 3 barber; 4 have `customer_id IS NULL` (walk-in guests) |
| `portfolio_galleryimage` | 51 | all 51 are `data:` URLs; 2.44 MB of characters |
| `services_service` | 24 | |
| `services_servicecategory` | 8 | **7 shared (`owner IS NULL`)** + 1 private |
| `reviews_review` | 7 | |
| `token_blacklist_outstandingtoken` | 794 | 426 blacklisted |

Salons-per-owner distribution: **every owner who has a salon has exactly one.** No owner in the data has two. The `Salon.owner` ForeignKey permits many; the code does not.

**This is development data, not production.** Volumes are trivial (17 appointments). Migration risk from data volume is near zero; migration risk from *ambiguity* (the 5 salonless owners, the 1 owner with a barber profile) is real and is what §30 addresses.

### 3.4 What the existing schema does *not* have

- No `slug`, no `subdomain`, no `domain`, no `custom_domain` on any model.
- No `Tenant`, `Organization`, `Account`, `Workspace` or `Company` model.
- No `is_active` / `suspended` / `plan` / `trial_ends_at` on `Salon`. The only status field is `verification` (`unverified/pending/verified/rejected`), set by a human in Django admin — `Apps/users/models.py::VerificationStage` notes the self-service route was deliberately removed.
- No soft delete anywhere. `on_delete=CASCADE` throughout, with `SET_NULL` on `Service→category`, `Appointment→employee`, `AppointmentService→service`, `Review→replied_by`, `BarberProfile→category`.
- **No UUID primary keys.** Every model uses Django's default sequential `AutoField`. Directory ids are `salon-<pk>` / `barber-<pk>` and are trivially enumerable.

---

## 4. Current Authentication

### 4.1 Mechanism

**FACT:** phone-number identity + password, gated by SMS OTP, issuing JWT pairs.

- `AUTH_USER_MODEL = 'users.User'`; `USERNAME_FIELD = 'phone'`; `REQUIRED_FIELDS = ['name']`.
- `Apps/users/phone.py::normalize_phone` forces every number to Bangladeshi E.164 (`+8801XXXXXXXXX`) on `clean()` **and** `save()`. Non-BD numbers are rejected outright.
- `DEFAULT_AUTHENTICATION_CLASSES = ('rest_framework_simplejwt.authentication.JWTAuthentication',)` — **JWT only**. Sessions exist for Django admin only.
- `DEFAULT_PERMISSION_CLASSES = ('rest_framework.permissions.IsAuthenticated',)` — closed by default; a view must opt out. This is a genuinely good baseline.

### 4.2 Token design — the critical fact for §15

`Apps/users/views.py::issue_tokens`:

```python
refresh = RefreshToken.for_user(user)
refresh['role'] = user.role
return {'access': str(refresh.access_token), 'refresh': str(refresh)}
```

**The JWT carries exactly two meaningful claims: `user_id` and `role`.** There is no tenant claim, no salon id, no audience, no issuer, no host binding. Settings: 15-minute access, 30-day refresh, `ROTATE_REFRESH_TOKENS=True`, `BLACKLIST_AFTER_ROTATION=True`, `UPDATE_LAST_LOGIN=True`, `SIGNING_KEY` falls back to `SECRET_KEY`.

**Consequence for subdomains:** a token minted at `salon-a.gosalon.com` is byte-for-byte valid at `salon-b.gosalon.com`. Nothing in the token, and nothing in `JWTAuthentication`, would notice. This is the single most important authentication change required.

### 4.3 The flows

| Flow | Endpoint | Behaviour |
|---|---|---|
| Register | `POST /api/auth/register/{customer,barber,salon-owner}/` | Creates the account **unverified**, issues an OTP, returns **no session**. Three public roles only — `PUBLIC_REGISTRATION_ROLES` excludes employee and admin. |
| Verify | `POST /api/auth/otp/verify/` | Spends the code, sets `is_phone_verified`, **issues the first token pair**. |
| Login | `POST /api/auth/login/` | Phone + password. Password is checked *before* any account state is revealed (deliberate — no account enumeration). Refuses inactive (`account_disabled`) and unverified (`PhoneNotVerified` → 403, so the client can route to the code screen). |
| Refresh | `POST /api/auth/token/refresh/` | Stock `TokenRefreshView`. |
| Logout | `POST /api/auth/logout/` | Blacklists the refresh token. |
| Forgot password | forgot → verify-otp → reset | `verify-otp` returns a `TimestampSigner` token (salt `users.password-reset`, 900 s) so the OTP is never replayed. Reset calls `revoke_all_sessions(user)`. |
| Change password | `POST /api/auth/password/change/` | Revokes every session, then issues a fresh pair to the caller. |

`Apps/users/views.py::PublicAPIView` sets `authentication_classes = ()` and returns a `WWW-Authenticate: Bearer` header so DRF emits 401 rather than 403 — a small, correct detail.

### 4.4 Employee account creation — the only non-self-service path

`SalonEmployeeCreateSerializer` (`Apps/users/serializers.py`) is the whole of it: an owner POSTs a phone to `/api/salon/employees/`. Two branches:

- **Unknown number** → creates a `User` with `role=SALON_EMPLOYEE`, `is_phone_verified=False`, the owner's chosen initial password, **plus a `BarberProfile`** seeded from the salon's `audience`, `area`, `city`.
- **Known number** → must not be `salon_owner`, `admin` or `customer`, and must not already have an active employment. Their `role` is flipped to `SALON_EMPLOYEE`; their existing `BarberProfile` is kept intact.

Deleting an employment (`SalonEmployeeDetailView.delete`) is a **soft end**: `is_active=False`, `ended_at=now`, and if the user has a `BarberProfile` their role reverts to `BARBER`.

This is already a tenant-membership lifecycle in everything but name.

### 4.5 WebSocket authentication

`Apps/users/ws_auth.py::JWTAuthMiddleware` puts the token's user on `scope['user']` using the *same* `JWTAuthentication` backend as REST. Token travels in the handshake subprotocol (`bearer`, `<token>`) with a query-string fallback, explicitly to keep credentials out of access logs. `core/asgi.py` wraps the router in `OriginValidator(..., settings.CORS_ALLOWED_ORIGINS)`.

**FACT:** `OriginValidator` is fed the literal `CORS_ALLOWED_ORIGINS` list. Under `*.gosalon.com` this list cannot be enumerated, so this line is a hard blocker for wildcard subdomains (§29).

---

## 5. Current Authorization

### 5.1 The three layers

**Layer 1 — role permission classes** (`Apps/users/permissions.py`): `IsCustomer`, `IsBarberOrHairstylist`, `IsSalonOrParlorOwner`, `IsSalonOrParlorEmployee`, `IsAdmin`, `IsProvider`, `IsPhoneVerified`. All are `has_permission`-only; **there is not a single `has_object_permission` in the codebase.**

**Layer 2 — queryset scoping.** This is where real authorization happens, and it is done well. `Apps/bookings/access.py::scoped(user)` returns `(queryset, viewpoint)`:

```
CUSTOMER        → Appointment.filter(customer=user)                    'customer'
SALON_OWNER     → Appointment.filter(salon__owner=user)                'owner'
BARBER          → filter(barber=profile) | filter(employee=employment) 'barber'
SALON_EMPLOYEE  → Appointment.filter(employee=employment)              'employee'
anything else   → none()                                              'none'
```

Every booking view looks its row up *through* this queryset (`BookingActionView.appointment`), so another business's booking is a **404, not a 403** — deliberate, and documented in the module docstring. `Apps/reviews/views.py` reuses it (`Review.objects.filter(appointment__in=visible)`). `Apps/bookings/reports.py` builds every analytics figure from it. `Apps/bookings/realtime.py::recipients` runs each broadcast candidate back through it so a socket can never deliver a row the API would 404.

**One scoping function, four consumers, zero duplicates.** This is the asset.

**Layer 3 — action predicates** (`access.py`): `is_customer_of`, `runs_business` (owner OR lone barber OR the assigned chair), and `Apps/reviews/permissions.py::may_reply` (narrower than `runs_business`, and refuses to let a stylist overwrite the owner's reply).

### 5.2 Per-app scoping outside bookings

| App | Scoping function | Basis |
|---|---|---|
| services | `Apps/services/views.py::visible_services(user)` | barber → own profile; owner → `salon__owner=user`; employee → `salon_id=employment.salon_id` (read-only); customer → `none()` |
| schedules | `Apps/schedules/views.py::own_owner(user)` | `.salons.first()` / `barber_profile` / active employment |
| portfolio | `Apps/portfolio/views.py::gallery_owner(user)` | owner → salon; everyone else → own `barber_profile`. **No id is ever taken from the request.** |
| users (staff) | inline `SalonEmployee.objects.filter(pk=pk, salon__owner=request.user)` | owner only |
| directory | **none — deliberately global** | see §5.3 |
| reviews (listing) | **none — deliberately global** | see §5.3 |

### 5.3 The three deliberately-unscoped endpoints

These are correct for a marketplace and are exactly what breaks under tenancy:

1. `GET /api/directory/` and `/api/directory/<listing_id>/` — any authenticated account, every business.
2. `GET /api/bookings/availability/?listing=salon-N&date=…` — any authenticated account, any business's slot-by-slot occupancy including `employee_ids`.
3. `GET /api/reviews/listing/<professional_id>/` — any authenticated account, any business's reviews.

`DirectoryListView`'s docstring is explicit about the trade: *"It is not open to the world: these rows carry business phone numbers, and an anonymous endpoint returning those is a scraping target."* Authentication is the only gate; there is no rate limit beyond the global `240/min` user throttle.

### 5.4 Cross-tenant write protection — already present

Two serializers narrow their `PrimaryKeyRelatedField` querysets in `__init__`, which is exactly the right pattern:

- `Apps/services/serializers.py::ServiceSerializer.__init__` — `eligible_employee_ids` is narrowed to `SalonEmployee.objects.filter(salon__owner=user, is_active=True)` (or `none()` for non-owners), and `category_id` to shared-or-own. Comment: *"otherwise a service could be pinned to another salon's staff."*
- `Apps/users/serializers.py::BarberProfileWriteSerializer.__init__` — same narrowing for `category_id`.

`Apps/bookings/serializers.py::WalkInCreateSerializer.validate` takes the business from `request.user`, never from the body, and documents why.

**FACT: I found no unnarrowed writable relation field in the backend.** The write side is in better shape than the read side.

---

## 6. Current API Architecture

Style: **`GenericAPIView` / `APIView` with hand-written `get`/`post`/`patch`/`delete`.** There is not a single `ModelViewSet`, `ViewSet` or DRF `router` in the project — `core/urls.py` includes seven `urls.py` modules of explicit `path()` entries under a flat `/api/` prefix. There is no API versioning (`/api/v1/` does not exist).

Pagination is hand-rolled where it exists (`Apps/reviews/views.py::_page`, 20/page) and absent elsewhere: `BookingListCreateView.get` slices `query[:200]`, `DirectoryListView` caps at `MAX_LIMIT = 100`. Error envelope is uniform — `{"detail", "code", "errors"}` via `Apps/users/exceptions.py::api_exception_handler`.

Throttling (`core/settings.py`): `anon 60/min`, `user 240/min`, plus scopes `login`, `register`, `otp`, `password_reset`. **The throttle cache is Django's default `LocMemCache`** because no `CACHES` is configured — per-process, so throttling is already unreliable across workers.

Full endpoint inventory is in §18.

---

## 7. Current Booking Architecture

### 7.1 Entity graph

```
User(customer) ──┐                         Salon ───── SalonEmployee ──── User(staff)
  (nullable:     │                           │  owner FK    │  (one active
   walk-ins)     │                           │              │   employment max)
                 ▼                           ▼              ▼
             Appointment ──── salon XOR barber ──── employee (nullable, SET_NULL)
              │  │  │                              (must belong to the same salon —
              │  │  │                               enforced in Appointment.clean())
              │  │  └── items → AppointmentService → service (SET_NULL)
              │  └───── notifications → AppointmentNotification
              └──────── review (1-1) → Review
                        rescheduled_from (1-1 self) → the superseded row
```

### 7.2 The booking lifecycle

`AppointmentStatus`: `pending → approved → completed`, plus `rejected`, `cancelled`, `rescheduled`. `LIVE_STATUSES = (pending, approved)` is what holds a chair.

- **Create** (`POST /api/bookings/`) — **customers only**; the view refuses any other role before the serializer runs. `BookingCreateSerializer` resolves `listing` (`salon-3` / `barber-9`) via `parse_listing`, enforces the horizon (`BOOKING_HORIZON_DAYS=60`) and the past, verifies every `service_id` is on *that* business's menu, and narrows `employee` to `SalonEmployee.filter(pk=…, salon=salon, is_active=True)`.
- **Slot defence** — `Apps/bookings/services.py::create_appointment` is `@transaction.atomic` and **re-runs `first_free_chair()` inside the transaction**, because the slot list the customer was looking at is stale by definition. Refusals are typed: `off_grid`, `outside_hours`, `nobody_available`, `closed`, `too_soon`, `taken`.
- **Walk-in** (`POST /api/bookings/walk-in/`) — a deliberately separate path (`create_walk_in`). No slot grid, no lead time, lands `approved`. Business and chair come from `request.user`. A phone number that matches a `CUSTOMER` account links the visit to it.
- **Reschedule** — creates a **new row** carrying the *frozen* prices (`Line.frozen`), marks the old one `rescheduled`, links via `rescheduled_from`, and publishes two socket events. Refuses if any line's `service_id` has gone NULL.
- **Cancel** — customer self-service only before `starts_at - cancellation_window_hours`; past it, a 409 `call_to_cancel` carrying `business_name`, `business_phone` and `cancel_deadline`.
- **Complete** — records optional `paid_with` and `tip`.

### 7.3 Availability

`Apps/bookings/availability.py` asks four questions per slot: open? an eligible chair? that chair free (prep time included)? still bookable (`BOOKING_LEAD_MINUTES=45`)? Grid step `BOOKING_SLOT_MINUTES=15`. Chairs are narrowed by **intersection** across the basket (`chairs_for`), and an empty `eligible_employees` means *all active staff*. Employee hours inherit the salon's week unless the chair has one of its own — the week-level test, not the day-level one, with a comment explaining the bug that taught them the difference.

### 7.4 Money on a booking

`subtotal` (sum of frozen line prices) + `platform_fee` (`BOOKING_PLATFORM_FEE=50`, a flat integer from settings, stamped onto the row at creation) = `total`. `tip` is stored separately and `Apps/bookings/reports.py` documents at length that it is never revenue and never commissioned.

**There is no money movement.** No charge, no payout, no ledger, no reconciliation. `platform_fee` is a number on a row that nobody collects.

### 7.5 Realtime

`Apps/bookings/realtime.py::publish` fires on `transaction.on_commit`, never raises, and sends **one message per recipient** (not per room) because the `can` block is a statement about the reader. Groups are `bookings.user.<id>` — per account, and the docstring explains why not per salon: *"an employee promoted, a barber who also rents a chair somewhere, an owner with two salons — each of those makes a room-shaped group either leak or miss."*

**That reasoning is already tenancy reasoning.** The author anticipated multi-salon users and chose the per-account group precisely to survive it.

---

## 8. Current Payment Architecture

**FACT: there is none.**

What exists:

| Thing | Where | What it actually is |
|---|---|---|
| `PaymentMethod` enum | `Apps/bookings/models.py` | Five labels — `cash`, `bkash`, `nagad`, `rocket`, `card`. A blank value is documented as *"nobody said"*, explicitly not cash. |
| `Appointment.paid_with` / `.tip` | same | Two columns written at the counter by `CompleteView`. |
| `Appointment.platform_fee` | same | A flat `BOOKING_PLATFORM_FEE` copied onto the row. Never charged to anyone. |
| `reports._by_payment` | `Apps/bookings/reports.py` | Groups completed appointments by `paid_with`, folding unknown values into an `unrecorded` bucket. |
| `api.payments.charge` | `services/frontend/src/utils/api.ts` | **Mock.** `await delay(1600)` then a fabricated reference string. |
| `api.credits.purchase` | same | Calls the mock charge, returns `CREDIT_PACK_SIZE`. Never touches the backend. |
| `PayoutSheet`, `PaymentAccountsSection` | `services/frontend/src/components/` | UI over mock data in `src/mockData/providers.ts`. |

What does **not** exist anywhere in the repository: a payment gateway SDK or HTTP client, a webhook endpoint or URL route, an IPN/callback handler, a signature-verification helper, a `Transaction`/`Payment`/`Invoice`/`Payout` model, a `Subscription`/`Plan`/`Billing` model, an idempotency key, a refund path, a settlement or reconciliation job.

**Consequence:** §21 cannot describe "how payments should be made tenant-aware", because there is nothing to make aware. It is a design brief for a system you have not built, and the tenancy decisions (who is the merchant of record — the platform or each salon?) must be made *before* it is built, not retrofitted.

---

## 9. Current AI Architecture

### 9.1 The service

`services/ai/` is a **standalone FastAPI application** (`main.py`, 519 lines) with two endpoints and no database:

- `POST /analyze` — multipart. One photo, or up to `MAX_ANGLE_IMAGES=8` labelled head angles (`front`, `front_left`, … `front_right`). Calls OpenRouter vision (`OPENROUTER_MODEL`, default `openai/gpt-4o`) via `hair_code.py::analyze`, optionally enriches with YouTube tutorial links, returns recommendations with stable ids.
- `POST /generate` — multipart. The customer's photo plus the chosen style and the observed hair attributes; calls the image model (`OPENROUTER_IMAGE_MODEL`, default `google/gemini-3.1-flash-image`) via `hair_generate.py`. Returns the render as **base64 in the JSON response**.

Supporting modules: `openrouter.py` (client), `image_io.py` (validation, EXIF rotation, resize), `hair_code.py` (43 KB — analysis and prompting), `hair_generate.py` (31 KB — the image edit), `hair_analysis_final.py`.

### 9.2 What it persists

**Nothing.** `/generate`'s docstring: *"The photo never leaves memory here: it is validated, sent to the image model and returned as base64 in the response. Nothing is written to disk or kept."* `/analyze` writes temp files and `unlink`s them in a `finally` block. There is no database connection, no ORM, no storage client.

### 9.3 What protects it

**CORS, and nothing else.**

```python
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins,
                   allow_origin_regex=allowed_origin_regex,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
```

There is no `Depends(...)` auth dependency, no API key check, no JWT verification, no rate limit, no per-user accounting on either endpoint. CORS is a browser-side control; `curl` ignores it entirely. Anyone who can reach port 8001 can spend your OpenRouter budget without limit.

### 9.4 Credits

`User.try_on_credits` is a `PositiveIntegerField(default=0)` set once at customer registration from `STARTING_TRY_ON_CREDITS=3`. **The backend never reads it for a decision and never decrements it.** Verified by full-repo grep: the only occurrences are the model field, the registration default, two serializer field lists, and the admin fieldset.

Credit enforcement is entirely in `services/frontend/src/store/useTryOnStore.ts` / `useAppStore.ts`, persisted to `localStorage`. It can be defeated by clearing storage, editing it, or skipping the SPA and calling `:8001` directly.

### 9.5 Where AI results live

In the browser. `services/frontend/src/utils/storage.ts::photoStore` keeps source photos as Blobs in **IndexedDB** (`eureka-photos`), with an in-memory `Map` fallback. Renders live in the zustand store as `AIGeneration` records under `STORAGE_KEYS.app` (`eureka.app`) in `localStorage`, archived per-account on sign-out.

**There is no AI history, usage log, credit ledger or generated-image record on the server.** §22's isolation question therefore has no existing data to isolate — it is a build, not a migration.

---

## 10. Current File / Media Architecture

**FACT: there is no file storage. Images are strings in the database.**

`Apps/common/images.py` is the whole of it, and it is explicit:

> *"An avatar, a cover or a gallery shot is kept as a string: either a `data:` URL — which is exactly what the frontend's existing cropper produces — or an ordinary https link to a file hosted elsewhere. There is no upload endpoint, no media root and no Pillow. […] A real deployment with many photographs should move these to object storage and keep the URL here; the field is a string either way, so that migration is a backfill rather than a redesign."*

`ImageRefField` is a `TextField` with a validator accepting exactly three shapes: a `data:image/(png|jpe?g|webp|gif);base64,…` URL, an `https?://` link, or an icon name matching `^[a-z][a-z0-9-]{1,39}$`. Cap: `MAX_IMAGE_CHARS = 1_500_000` (~1 MB photo).

Fields using it: `CustomerProfile.avatar`, `BarberProfile.avatar`, `BarberProfile.cover_image`, `Salon.avatar`, `Salon.cover_image`, `ServiceCategory.icon`, `GalleryImage.image`.

Measured in the development database:

| Column | Rows | Total chars | Max | `data:` | `http` |
|---|---|---|---|---|---|
| `portfolio_galleryimage.image` | 51 | 2,442,953 | 117,615 | **51** | 0 |
| `users_salon.avatar` | 7 | 150,101 | 38,835 | **7** | 0 |
| `users_barberprofile.avatar` | 28 | 161,823 | 34,407 | 6 | 1 |
| `users_customerprofile.avatar` | 14 | 72,095 | 36,395 | 2 | 1 |

**Every gallery image is inline base64.** The `data:` URL is embedded in the JSON of `/api/directory/`, `/api/directory/<id>/` and `/api/profile/me/` — `Apps/directory/serializers.py::_gallery` returns `image` verbatim. A 50-listing directory page carrying twelve gallery images each is a multi-megabyte response.

Gallery caps: `MAX_BARBER_GALLERY = 6`, `MAX_SALON_GALLERY = 12`, enforced in `Apps/portfolio/views.py::GalleryView.post`.

**Implications for §23:** there are no filenames, no paths, no URLs, no buckets, no prefixes and no signed URLs — so "are filenames predictable?" and "can users access another tenant's files?" have the same answer: **file-level access control does not exist, because there are no files.** Access control is whatever the endpoint returning the row does. Today that means: anything in `/api/directory/` is readable by every authenticated account on the platform.

---

## 11. Current Frontend Architecture

### 11.1 The customer + provider app (`services/frontend`)

React 19.2 · Vite 8 · React Router 7 (`BrowserRouter`) · zustand 5 · TypeScript strict. ~230 `.tsx` files. Bilingual (en/bn) with an i18n check script. PWA with a service worker reading the Vite manifest.

**One SPA serves all five roles.** Routing is flat and path-based, guarded client-side by `services/frontend/src/components/RouteGuards.tsx`: `RequireAuth`, `PublicOnly`, `CustomerOnly`, `ProviderOnly`, `AdminOnly`, `RoleOnly({allow})`, `WomensStylistOnly`, `RequirePendingVerification`. The module's own docstring: *"They are not the security boundary — the backend's permissions are."* Correct.

Route families: `/auth/*`, customer (`/home`, `/search`, `/professional/:id`, `/booking/:professionalId/*`, `/bookings`, `/ai-tryon/*`, `/profile/*`), provider (`/pro/*` — 24 routes including `/pro/salon/*` for owners and `/pro/shift`, `/pro/performance` for employees), and `/admin-console`.

### 11.2 Session handling

`services/frontend/src/store/useAppStore.ts` — zustand with `persist` to `localStorage` under key `eureka.app`. It holds `user`, `accessToken`, `refreshToken`, `isAuthenticated`, `authStatus`, plus an `archive: Record<userId, AccountData>` that parks a signed-out account's local data and restores it on sign-in.

`services/frontend/src/utils/apiClient.ts` — the single HTTP client. `BASE_URL` is `import.meta.env.VITE_API_BASE_URL` read **once at module load**. Attaches `Bearer`, and on 401 performs a **single-flight** refresh (`inFlightRefresh`) so three concurrent 401s do not burn three rotating refresh tokens. Distinguishes "server refused the refresh" (clear session) from "could not reach the server" (leave session alone) — a good distinction.

`services/frontend/src/utils/realtimeClient.ts` — derives the socket URL from `BASE_URL` (`http://host/api` → `ws://host/ws/bookings/`), sends the token as the second subprotocol, pings every 25 s, exponential backoff 1 s → 30 s, and sets a `gap` flag so every reconnect ends in a REST re-read rather than guessing what was missed.

### 11.3 What is real vs mock

`services/frontend/src/utils/api.ts` states it plainly. **Real** against Django: auth, profile, directory, services, schedules, portfolio, bookings, reviews, reports. **Real** against FastAPI: `api.tryOn` (browser → `:8001` directly, no backend in between). **Mock**: `api.hairstyles` (from `src/mockData`), `api.payments`, `api.credits`.

### 11.4 The admin dashboard (`services/admin-dashboard`)

`README.md`: *"**There is no backend.** Every record is seeded from `src/mockData/` into a Zustand store and mutated in memory; a page reload resets the demo. No `fetch`, no API client, no auth."*

Pages: Overview, Users, Salons, Bookings, Transactions, Hairstyles, Moderation, Notifications, Settings, AuditLog. Runs at `localhost:5173/admin`. Mock data files include `transactions.ts`, `moderation.ts`, `auditLog.ts` — features with **no backend counterpart whatsoever**.

### 11.5 Domain handling

**FACT: zero.** No `window.location.hostname`, no `location.host`, no subdomain parsing, no tenant context, no per-tenant theming in either React app. Both read a single hard-coded `VITE_API_BASE_URL` / `VITE_AI_API_URL` from build-time env. `vite.config.ts` sets `server.allowedHosts: true` (dev convenience only).

Branding is a single global theme: `src/styles/theme.css` custom properties, light/dark swapped by a class on `<html>`, with the mood read from `localStorage` by an inline script in `index.html` before React mounts.

---

## 12. Multi-Tenancy Requirements

Restating your brief as testable requirements, and marking which the codebase can answer.

| # | Requirement | Status today |
|---|---|---|
| R1 | `salon-a.gosalon.com` resolves to tenant "Salon A" server-side | **Absent.** No middleware, no host read, no slug field. |
| R2 | The backend determines the tenant *independently of the client* | **Absent.** Nothing to validate against. |
| R3 | Salon A can never read Salon B's data | **Partially present** for appointment-derived data via `access.scoped`; **absent** for directory, availability and listing reviews, which are global by design. |
| R4 | Salon A can never write Salon B's data | **Largely present.** Writable relation fields are narrowed in serializer `__init__`; walk-ins take the business from the caller. |
| R5 | A tenant can be provisioned, suspended and deleted | **Absent.** No `is_active`, no plan, no lifecycle. Salon creation is a side effect of owner registration. |
| R6 | Per-tenant branding on the subdomain | **Absent.** One global theme; `Salon.avatar`/`cover_image`/`tagline` exist but are never used as app chrome. |
| R7 | Tokens are bound to a tenant | **Absent.** JWT carries `user_id` + `role` only. |
| R8 | Platform admin can act across tenants | **Partially present.** Django admin (`/admin/`) sees everything; the React admin console has no backend. |
| R9 | Media is isolated per tenant | **Not applicable yet.** There is no media layer. |
| R10 | Background work carries tenant context | **Not applicable.** No background workers exist. |
| R11 | Cache keys are tenant-scoped | **Not applicable.** No application caching exists. |

**The honest summary:** of eleven requirements, three are partially met, four are absent, and four are not applicable because the subsystem does not exist. The work is dominated by construction, not by retrofit.

### 12.1 The requirement the brief does not state, and must

Multi-tenancy answers *"whose data is this?"*. It does **not** answer *"who may browse across tenants?"* — and this product's customer journey is entirely cross-tenant:

- `HomePage` calls `api.professionals.nearby(point)` → `GET /api/directory/?sort=distance` — every business, sorted by distance.
- `SearchPage` calls `api.professionals.search(point, filters)` — filters by type, audience, area, free-text and open-now **across the whole platform**.
- `useDirectoryStore` caches listings by id so the booking wizard can look any business up.
- `Apps/reviews/ratings.py::scores_for(salon_ids=[...], barber_ids=[...])` computes ratings for a whole results page in two queries — a single `GROUP BY` spanning every business on the page.

Under strict per-subdomain isolation, none of this has a host to run on. §36 Q1 is therefore the gating question for the entire project.

---

## 13. Tenant Architecture Options

Evaluated **against this codebase**, not in the abstract.

### Option A — Shared database, shared schema, `tenant_id` column

**How it would work here.** Introduce a `Tenant` model (or promote `Salon`). Add a tenant foreign key to `Appointment`, `Service`, `GalleryImage`, `WorkingDay`, `SalonEmployee` and `ServiceCategory` — or derive it through the existing `salon`/`barber` columns, which already carry the information. Resolve the tenant in new middleware from `request.get_host()`. Extend `access.scoped()` and each app's `visible_*` function with a tenant filter. Add a default manager or an explicit base queryset that requires a tenant.

**Code changes.** Moderate and *localised*, because the scoping choke points already exist: `Apps/bookings/access.py::scoped`, `Apps/services/views.py::visible_services`, `Apps/schedules/views.py::own_owner`, `Apps/portfolio/views.py::gallery_owner`. Plus the three global endpoints (§5.3) and every `user.salons.first()` call site (7 of them — §19.4).

**Database changes.** One additive migration per app: nullable FK → backfill → non-null → index. Composite indexes on `Appointment` must be rebuilt to lead with the tenant column. No table is re-partitioned; no data moves.

**Security.** Isolation is **code-enforced, not database-enforced**. One forgotten `.filter(tenant=…)` is a cross-tenant leak. Mitigations that fit this codebase: keep `scoped()` as the only entry point and make the base queryset private; add PostgreSQL Row-Level Security once you are on Postgres (belt and braces); and add the §31 negative test matrix to CI.

**Migration complexity.** **Lowest of the three.** 46 existing migrations stay valid; you add to them.

**Operational complexity.** Lowest. One database, one connection pool, one `migrate`, one backup.

**Scalability.** Good to very large row counts with correct composite indexes. All existing cross-business queries (directory, `scores_for`, platform analytics) keep working unchanged and stay cheap.

**Backup/restore.** Platform-wide backup is trivial. **Per-tenant restore is hard** — you must reconstruct a consistent subgraph by hand. If "restore one salon to yesterday" is a product promise, this option costs you.

**Cost.** Lowest. One Postgres instance serves all tenants.

**Local dev.** Easiest. One database; seed several tenants; `salon-a.localhost:8000` works with `ALLOWED_HOSTS=['.localhost']`.

**Production.** Simplest. One rollout, one migration window.

### Option B — PostgreSQL schema-per-tenant (`django-tenants`)

**How it would work here.** Move to PostgreSQL (mandatory — currently SQLite). Split `INSTALLED_APPS` into `SHARED_APPS` (public schema: `users`, `contenttypes`, `auth`, `token_blacklist`, the tenant/domain models) and `TENANT_APPS` (per-schema: `services`, `schedules`, `portfolio`, `bookings`, `reviews`). Add `django_tenants.middleware.main.TenantMainMiddleware` first in `MIDDLEWARE`, and a `Domain` model mapping `salon-a.gosalon.com` → schema `salon_a`.

**The specific problems this codebase presents.**

1. **`BarberProfile` cannot be placed.** It is simultaneously a tenant root (an independent barber's business) and a per-user record belonging to a *different* tenant's employee. In `SHARED_APPS` it cannot be a tenant root; in `TENANT_APPS` an employee's trade record would be duplicated or lost when they change salons — which `SalonEmployeeDetailView.delete` explicitly protects against ("A barber who was hired gets their own trade back").
2. **Cross-tenant aggregation becomes impossible in one query.** `Apps/reviews/ratings.py::scores_for` and `Apps/directory/views.py::DirectoryListView` span all businesses. Under schema-per-tenant, that is a loop over N schemas per search request, or a denormalised public-schema mirror of every listing — a second source of truth, which is the exact thing `Apps/reviews/models.py` argues against.
3. **The customer's own booking list spans tenants.** `scoped()` for a `CUSTOMER` is `Appointment.filter(customer=user)` — one query today, N schema queries under Option B. `/api/bookings/` for a customer who has visited three salons would have to fan out.
4. **A lone barber is a tenant too.** 9 of 57 dev users are `BARBER` with their own diary, menu and hours. Schema-per-barber means one Postgres schema per self-employed individual — the table count grows as `~17 tables × tenants`, and `migrate_schemas` time grows with it.

**Security.** Strongest practical isolation short of separate databases: a missing filter cannot cross a schema boundary. This is a genuine advantage and the main reason to consider it.

**Migration complexity.** **High.** Every one of the 46 migrations must be re-attributed to shared or tenant; existing rows must be routed into per-tenant schemas; the `Appointment → User` FK must become a cross-schema reference (supported tenant→public, but it constrains what can move).

**Operational complexity.** High. `migrate_schemas` across N schemas, per-schema failure handling, connection-pool pressure (`search_path` switching per request), schema-aware backups.

**Scalability.** Fine to hundreds of tenants; degrades on migration time and catalogue bloat beyond low thousands.

**Backup/restore.** **Best of the three for per-tenant restore** — `pg_dump -n salon_a`.

**Cost.** One Postgres instance, but larger; more DBA time.

**Local dev.** Harder — requires Postgres, `.localhost` wildcard hosts *and* a `Domain` row per test tenant. Django's `TestCase` needs `django-tenants`' own test case classes; **all 24 existing test modules would need rework**.

**Production.** Migration windows lengthen with tenant count.

### Option C — Database per tenant

**How it would work here.** A `Tenant` registry in a control database; a Django database router resolving the connection from `request` tenant; `DATABASES` populated dynamically at runtime.

**The specific problems.** `core/settings.py` declares a single static `DATABASES['default']`. There is **no router, no connection-registration code and no tenant-aware `migrate` wrapper** in the project — all three are new. Every cross-business feature (directory, ratings, a customer's own booking list, platform analytics) becomes an N-database fan-out or must move to a separate aggregate store. Django cannot enforce a ForeignKey across databases, so `Appointment.customer → User` must become a loose integer reference with application-level integrity — which removes the `CASCADE` guarantees the schema relies on.

**Security.** Strongest. **Migration complexity.** Highest. **Operational complexity.** Highest — N migrations, N backups, N connection pools. **Cost.** Highest, and it grows per tenant. **Local dev.** Painful. **Production.** A per-tenant provisioning pipeline you do not have.

### Comparison

| Criterion | A: shared + `tenant_id` | B: schema-per-tenant | C: database-per-tenant |
|---|---|---|---|
| Fits the existing `salon`/`barber` XOR pattern | **Yes, directly** | Awkward (`BarberProfile`) | Awkward |
| Keeps the marketplace working | **Yes, unchanged** | Requires a public mirror | Requires a separate aggregate store |
| Preserves `access.scoped()` as one choke point | **Yes** | Yes, per schema | Yes, per database |
| Preserves the 24 existing test modules | **Mostly** | **No** | **No** |
| Preserves 46 existing migrations | **Yes** | Re-attribution needed | Re-attribution needed |
| Requires PostgreSQL | Recommended | **Mandatory** | **Mandatory** |
| Isolation enforced by | Application code (+ optional RLS) | **Database** | **Database** |
| Per-tenant restore | Hard | **Easy** | **Easiest** |
| Cost per tenant | Near zero | Low | High |
| Lone-barber tenants (9 in dev data) | Natural | One schema each | One database each |

### Technical compatibility conclusion

**FACT:** Option A is the only one of the three that can be implemented without changing what the product *is*. Every cross-business query the customer app depends on — `DirectoryListView`, `scores_for`, a customer's multi-salon booking history — is a single SQL statement today and remains one under Option A, while becoming a fan-out or a denormalised mirror under B and C.

**FACT:** Option B's isolation advantage is real and is not available in Option A without PostgreSQL Row-Level Security.

**RECOMMENDATION (clearly separated from the facts above):** Option A, on PostgreSQL, with RLS added as a second line of defence once the tenant column exists — *provided* the answer to §36 Q1 is that the marketplace survives. If the answer is that each salon is a fully isolated product with no cross-salon browsing, Option B becomes defensible and the `BarberProfile` duality must be resolved first. Do not choose before Q1 is answered.

---

## 14. Subdomain Architecture

### 14.1 Host map

| Host | Serves | Tenant | Auth |
|---|---|---|---|
| `gosalon.com` | Marketing + the cross-business customer marketplace | **none / platform** | customers |
| `admin.gosalon.com` | Platform admin console | **none / platform** | platform admins only |
| `salon-a.gosalon.com` | Salon A's booking page + its staff dashboard | Salon A | Salon A's staff; customers of Salon A |
| `api.gosalon.com` *(suggested)* | The Django API, if you separate it | resolved from `X-Tenant` or path | all |

**UNCLEAR FROM CODEBASE:** whether the API is served from the same host as the SPA (same-origin, path `/api/`) or from a separate host. Today they are separate origins in dev (`:5174` → `:8000`) with CORS. This choice changes §15 materially: same-origin means `Host` alone identifies the tenant; cross-origin means the API host is constant and the tenant must arrive by `Origin`, an explicit header, or a path segment.

### 14.2 Request lifecycle (proposed — none of this exists today)

```
1  Browser         GET https://salon-a.gosalon.com/pro/queue
2  DNS             *.gosalon.com  A/CNAME → edge
3  Cloudflare      wildcard cert *.gosalon.com terminates TLS
                   sets X-Forwarded-Proto / X-Forwarded-Host
                   ⚠ cache key MUST include Host, or Salon A's HTML is
                     served to Salon B (see §27)
4  Reverse proxy   server_name *.gosalon.com → the SPA bundle (static)
                   location /api/ and /ws/  → daphne upstream
                   proxy_set_header Host $host    ← required
5  Frontend        parses window.location.hostname → "salon-a"
                   (NEW — no such code exists today)
                   API base URL and WS URL become tenant-relative
6  Django          SecurityMiddleware
                   CorsMiddleware              ← needs regex for *.gosalon.com
                   ▶ TenantMiddleware (NEW)
                       host = request.get_host()
                       label = host.split('.')[0]
                       tenant = Tenant.objects.get(slug=label, is_active=True)
                       → 404 if unknown, 410 if suspended
                       request.tenant = tenant
                   Session / Common / CSRF / Auth / Messages / XFrame
7  DRF auth        JWTAuthentication → request.user
8  Tenant check    ▶ membership assertion (NEW)
                       does request.user belong to request.tenant?
                       if not → 403, and DO NOT fall back to the user's own tenant
9  Permission      IsAuthenticated + the role classes
10 Queryset        access.scoped(user) AND .filter(tenant=request.tenant)
11 Database        one query, tenant-filtered
```

Steps 5, 6-▶, 8 and the `AND` in 10 are the entire new surface. Steps 1–4 do not exist as configuration anywhere in the repository.

### 14.3 WebSocket lifecycle

`core/asgi.py` wraps the router in `OriginValidator(..., settings.CORS_ALLOWED_ORIGINS)`. A literal list cannot express `*.gosalon.com`, so this must become either a custom validator or `AllowedHostsOriginValidator` driven by a wildcard `ALLOWED_HOSTS`. The tenant would then be resolved in a new ASGI middleware from `scope['headers']['host']`, sitting beside `JWTAuthMiddleware`, and `Apps/bookings/realtime.py::group_for` would become `t<tenant_id>.bookings.user.<id>` if you want channel-layer-level isolation.

### 14.4 Where tenant resolution belongs

**RECOMMENDATION:** a dedicated middleware placed **after `CorsMiddleware` and before `AuthenticationMiddleware`**, setting `request.tenant` and nothing else. Reasons grounded in this codebase:

- It must run before authentication so an authenticated-but-wrong-tenant request can be refused with full knowledge of both facts.
- It must **not** use a thread-local. `Apps/bookings/realtime.py` runs inside `transaction.on_commit` callbacks and `async_to_sync`; `Apps/users/ws_auth.py` runs in an ASGI context with no `request`. A thread-local set by HTTP middleware is not visible there and would silently resolve to the wrong tenant or `None`. Pass the tenant explicitly.
- The membership assertion (step 8) belongs in a **DRF permission class** or an authentication wrapper, not in the middleware, so that `AllowAny` endpoints (login, register, OTP) can opt out deliberately rather than by accident.

---

## 15. Tenant Identification Strategy

| Strategy | How it would work here | Security | Verdict |
|---|---|---|---|
| **Subdomain** (`request.get_host()`) | New middleware; needs a new `Tenant.slug` unique field | **Strong** *if* `ALLOWED_HOSTS` is a real allowlist. With a permissive `ALLOWED_HOSTS` the `Host` header is attacker-controlled, and Django's host validation is the only thing standing between you and `Host: salon-b.gosalon.com` on a request to salon A's proxy. Also requires `proxy_set_header Host $host` — a proxy that rewrites Host silently collapses all tenants into one. | **Primary signal.** |
| **JWT tenant claim** | Add `tenant_id` when minting in `issue_tokens()` | Signed, so not forgeable — but **stale**. A 30-day refresh token would outlive a staff member's dismissal by up to 30 days unless revocation is enforced. `revoke_all_sessions()` already exists and would have to be called on every membership change. | **Secondary — an assertion to cross-check, never the sole source.** |
| **User's salon relationship** (DB lookup) | Already exists: `user.salons`, `user.employments.filter(is_active=True)`, `user.barber_profile` | **Strongest and always current** — it is the live membership record. Costs one query, which `access.scoped()` already performs today. | **Authoritative for authorisation.** |
| **Request header** (`X-Tenant-Id`) | Would need to be added by the SPA | **Weak alone** — fully client-controlled. Useful only for a constant-host API where it is cross-checked against subdomain and membership. | Only as a cross-origin transport for the subdomain signal. |
| **URL path** (`/api/t/salon-a/…`) | Would require rewriting all 7 `urls.py` | Same trust level as a header: client-supplied, must be validated. Breaks every existing client path. | **Not recommended** — high churn, no security gain. |
| **Database lookup by slug** | `Tenant.objects.get(slug=…, is_active=True)` | The resolution step itself. Must be cached carefully (§27) and must 404 on unknown slugs rather than falling back to a default. | Required by all of the above. |

### 15.1 How the backend must validate independently

The brief's rule — *do not rely on the frontend to say which tenant is being accessed* — resolves concretely here to:

1. **Resolve** the tenant from `request.get_host()` only. Never from a body field, a query parameter, or an unvalidated header.
2. **Guard the host.** `ALLOWED_HOSTS` must be `['.gosalon.com']` (Django's leading-dot wildcard), not `['*']`. With `['*']` the `Host` header becomes an unauthenticated tenant selector.
3. **Assert membership against the database**, not the token: `SalonEmployee.objects.filter(user=request.user, salon=tenant, is_active=True).exists()` or `tenant.owner_id == request.user.id`. This is the authoritative check and it is always current.
4. **Cross-check the token claim.** If the JWT carries `tenant_id` and it disagrees with the host, refuse — do not prefer either. Disagreement means a stolen or replayed token, or a stale session, and both deserve a 403.
5. **Never fall back.** If the user has no membership in the resolved tenant, return 403/404. Do **not** silently redirect them to their own tenant — a silent fallback is how a cross-tenant link becomes a cross-tenant read.
6. **Refuse a request with no tenant** on tenant-scoped routes, rather than defaulting to "all tenants". The safe default is zero rows, which is what `access.scoped()` already does for unknown roles (`base.none()`).

### 15.2 Anonymous and cross-tenant-by-design routes

These need an explicit, named exemption list, because they legitimately have no tenant or span tenants:

- `POST /api/auth/login/`, `/register/*`, `/otp/*`, `/password/*`, `/token/refresh/` — pre-tenant. **Open question:** does logging in at `salon-a.gosalon.com` scope the session to Salon A? (§36 Q7.)
- `GET /api/bookings/` for a `CUSTOMER` — spans every business they have visited.
- `GET /api/directory/` — the marketplace, if it survives Q1.

Everything not on that list should fail closed.

---

## 16. Authentication Impact

### 16.1 What must change

| Area | File | Change |
|---|---|---|
| Token minting | `Apps/users/views.py::issue_tokens` | Add a tenant claim (and `iss`/`aud` if you bind tokens to hosts) |
| Login | `Apps/users/views.py::LoginView` + `LoginSerializer` | Decide whether a login at `salon-a` is refused for a non-member, and what a multi-membership user is issued |
| Verify-OTP session | `OTPVerifyView` | Same decision — it also mints the first pair |
| Change-password re-issue | `ChangePasswordView` | Same |
| Session revocation | `revoke_all_sessions` | Must now also fire when a membership changes — hiring, firing, role change |
| WS auth | `Apps/users/ws_auth.py` | Resolve and assert the tenant from the handshake host |
| Origin validation | `core/asgi.py` | `CORS_ALLOWED_ORIGINS` list → wildcard-capable validator |

### 16.2 The multi-membership problem

`SalonEmployee` today carries `UniqueConstraint(fields=('user',), condition=Q(is_active=True), name='unique_active_employment_per_user')`, and `Apps/bookings/access.py` reads `user.employments.filter(is_active=True).first()` in three places. `Apps/schedules/views.py::own_owner`, `Apps/services/views.py::visible_services` and `Apps/users/serializers.py::active_employment` do the same.

If one person may work at two salons:

- that constraint must be dropped (a `(user, salon)` unique remains),
- every `.first()` on `employments` becomes a tenant-qualified `.get()`,
- `Apps/users/serializers.py::profile_payload` must stop returning a single `employment`/`salon` and become tenant-aware,
- and `Apps/bookings/access.py::scoped` for `BARBER` — which today ORs the barber's own diary with their single employment — must OR over the tenant's employment only.

If one person may **not** work at two salons, none of that changes and the constraint becomes a documented tenancy invariant. **This one answer (§36 Q3) moves several days of work.**

### 16.3 Role vs membership

`User.role` is one global `CharField`. Under tenancy, "role" is properly a property of a *membership*, not of a person — the same human could be a customer at Salon A and a stylist at Salon B. Today `SalonEmployeeCreateSerializer` **flips the user's global role** to `SALON_EMPLOYEE` on hire and `SalonEmployeeDetailView.delete` flips it back to `BARBER` on departure. That mutation is only coherent while one person has one job.

**RECOMMENDATION:** if multi-membership is allowed, move `role` onto the membership row and keep `User.role` only as a coarse account type (or drop it). This is a large change — `Apps/users/permissions.py`, every `RoleOnly` guard in the frontend, `HOME_ROUTE_FOR[role]`, and the `role` claim in the JWT all read it.

### 16.4 Session storage across subdomains

`localStorage` is per-origin. `salon-a.gosalon.com` and `salon-b.gosalon.com` have **separate** `eureka.app` stores, and so does `gosalon.com`. Today's session therefore does **not** follow a user across subdomains.

Three options, each with a consequence:

- **Keep it per-origin.** Simplest and safest; a user signs in per salon. The `archive` mechanism in `useAppStore` already handles multiple accounts on one origin, so this needs no frontend rework.
- **Cookie on `.gosalon.com`.** Gives SSO across subdomains, but requires moving off `Authorization: Bearer` to cookies, which means `CORS_ALLOW_CREDENTIALS=True` (currently `False`, deliberately), CSRF protection on every mutating endpoint, and `SameSite` tuning. A significant security-model change.
- **A central auth host + redirect flow.** Most work, cleanest result.

**UNCLEAR FROM CODEBASE / §36 Q7.**

---

## 17. Authorization Impact

### 17.1 What survives unchanged

The whole of §5's layer-2 design. `access.scoped()` needs one additional filter, not a rewrite, and its four consumers (bookings views, reviews views, reports, realtime) inherit it for free. That is the difference between a two-week job and a two-month one.

### 17.2 What must change

| Location | Current behaviour | Under tenancy |
|---|---|---|
| `Apps/bookings/access.py::scoped` | Filters by the user's relationship only | `AND tenant = request.tenant`; refuse when the user has no membership in it |
| `Apps/bookings/access.py::business_of` | `user.salons.first()` | Must select the *requested* tenant's salon |
| `Apps/services/views.py::visible_services` | Role-based | Add tenant |
| `Apps/services/views.py::service_owner` | `user.salons.first()` | Tenant-qualified |
| `Apps/schedules/views.py::own_owner` / `salon_owner_of` | `.first()` on salons/employments | Tenant-qualified |
| `Apps/portfolio/views.py::gallery_owner` | `user.salons.first()` | Tenant-qualified |
| `Apps/users/views.py::SalonEmployeeListCreateView._salon` | `request.data.get('salon')` filtered through `request.user.salons` | Should take the salon from `request.tenant`, not the body |
| `Apps/users/serializers.py::active_employment` | `.first()` | Tenant-qualified |
| `Apps/users/permissions.py` (all classes) | Role only | Add a `IsTenantMember` and compose it |
| **new** | — | `IsPlatformAdmin` distinct from `IsAdmin`, and a rule for whether platform admins bypass tenant scoping |

### 17.3 The `.first()` inventory — 7 call sites that assume one salon per owner

```
Apps/bookings/access.py:66        business_of()          user.salons.first()
Apps/services/views.py:35         service_owner()        user.salons.first()
Apps/schedules/views.py:33        own_owner()            user.salons.first()
Apps/portfolio/views.py:27        gallery_owner()        user.salons.first()
Apps/users/serializers.py:117     UserSerializer.get_profile()   user.salons.first()
Apps/users/serializers.py:856     SalonWriteSerializer.save()    user.salons.first()
Apps/users/serializers.py:1041    profile_payload()      user.salons.first()
```

Plus `Apps/bookings/serializers.py::WalkInCreateSerializer.validate` → `Salon.objects.filter(owner=user).first()`.

`Salon.Meta.ordering = ('name',)`, so `.first()` returns the **alphabetically first** salon. If an owner ever acquires a second salon, these eight call sites silently operate on the wrong one. Every one must become tenant-qualified. This is the single most mechanical and most repetitive part of the migration.

---

## 18. API Impact

`T` = needs tenant context · `G` = legitimately global · `P` = pre-auth

| Endpoint | Method | Current permission | Current behaviour | Tenant? | Required change | Risk |
|---|---|---|---|---|---|---|
| `/api/auth/register/customer/` | POST | AllowAny | Creates user + `CustomerProfile` | **P** | Decide: does registering at `salon-a` bind the customer to it? | MED |
| `/api/auth/register/barber/` | POST | AllowAny | Creates user + `BarberProfile` | **P** | A lone barber is a tenant — this becomes tenant provisioning | **HIGH** |
| `/api/auth/register/salon-owner/` | POST | AllowAny | Creates user + **`Salon`** | **P** | **This is tenant provisioning.** Must allocate a unique slug, guard the second-salon bug (§19.3), and probably move off the public subdomain | **HIGH** |
| `/api/auth/otp/{request,verify,resend}/` | POST | AllowAny | Issue/spend OTP | **P** | None, unless SMS sender ID is per tenant | LOW |
| `/api/auth/login/` | POST | AllowAny | Password → token pair | **P** | Refuse non-members at a tenant host? Which tenant claim? | **HIGH** |
| `/api/auth/token/refresh/` | POST | AllowAny | Rotate | **P** | Must not let a token widen its tenant | **HIGH** |
| `/api/auth/logout/` | POST | IsAuthenticated | Blacklist refresh | G | None | LOW |
| `/api/auth/me/` | GET | IsAuthenticated | `UserSerializer` — embeds `salon`/`employment` | **T** | `get_profile` must answer for the current tenant | MED |
| `/api/auth/password/*` | POST | AllowAny / IsAuth | Reset / change | **P** | None | LOW |
| `/api/profile/me/` | GET, PATCH | IsAuthenticated | Serializer chosen by `request.user.role` | **T** | `profile_payload` returns one salon + one employment; must be tenant-scoped | **HIGH** |
| `/api/salon/employees/` | GET, POST | IsSalonOwner | Lists `salon__owner=user`; POST reads `request.data['salon']` | **T** | Take the salon from `request.tenant`; this is tenant membership management | **HIGH** |
| `/api/salon/employees/<pk>/` | GET, PATCH, DELETE | IsSalonOwner | Filtered by `salon__owner=request.user` | **T** | Add tenant filter | MED |
| `/api/services/categories/` | GET, POST | IsAuthenticated | Shared (`owner IS NULL`) + own | **G+T** | Decide global catalogue vs per-tenant (§36 Q6) | MED |
| `/api/services/categories/<pk>/` | PATCH, DELETE | IsProvider | `owner=request.user` only | **T** | Owner becomes tenant, not user | MED |
| `/api/services/` | GET, POST | IsProvider | `visible_services(user)` | **T** | Add tenant | MED |
| `/api/services/<pk>/` | GET, PATCH, DELETE | IsProvider | Through `visible_services` | **T** | Add tenant | MED |
| `/api/schedule/me/` | GET, PUT, DELETE | IsProvider | `own_owner(user)` | **T** | Tenant-qualify | MED |
| `/api/schedule/employees/<pk>/` | GET, PUT, DELETE | IsSalonOwner | `salon__owner=request.user` | **T** | Add tenant filter | MED |
| `/api/profile/me/gallery/` | GET, POST | IsProvider | Owner derived from role — **no client id** | **T** | Tenant-qualify the salon lookup | LOW |
| `/api/profile/me/gallery/<pk>/` | PATCH, DELETE | IsProvider | `pk` + owner filter | **T** | Same | LOW |
| **`/api/directory/`** | GET | IsAuthenticated | **Every salon + barber, with phones, staff, prices, hours, galleries** | **G (by design)** | Either move to the platform host, or tenant-filter to one listing — this *is* the Q1 decision | **CRITICAL** |
| **`/api/directory/<listing_id>/`** | GET | IsAuthenticated | **Any business by enumerable id** | **G (by design)** | Same | **CRITICAL** |
| **`/api/bookings/availability/`** | GET | IsAuthenticated | **Any business's occupancy by `listing` param, incl. `employee_ids`** | **G (by design)** | Must assert `listing` belongs to `request.tenant` | **HIGH** |
| `/api/bookings/walk-in/` | POST | IsAuthenticated + role | Business from `request.user` | **T** | Assert the derived business *is* `request.tenant` | MED |
| `/api/bookings/analytics/` | GET | IsAuthenticated | From `scoped()` | **T** | Inherits the `scoped()` fix | MED |
| `/api/bookings/performance/` | GET | IsAuthenticated | From `scoped()`, refuses non-`employee` viewpoint | **T** | Inherits | LOW |
| `/api/bookings/` | GET | IsAuthenticated | `scoped()`, `[:200]` | **T / G for customers** | Owner/employee views tenant-filtered; a customer's own list legitimately spans tenants | **HIGH** |
| `/api/bookings/` | POST | IsAuthenticated (customer only) | `listing` from body, resolved by `parse_listing` | **T** | Assert the listing is `request.tenant` | **HIGH** |
| `/api/bookings/<pk>/` | GET | IsAuthenticated | Through `scoped()` → 404 | **T** | Inherits | LOW |
| `/api/bookings/<pk>/{approve,reject,cancel,complete,reschedule}/` | POST | IsAuthenticated | `scoped()` + `runs_business` / `is_customer_of` | **T** | Inherits | LOW |
| `/api/reviews/` | GET | IsAuthenticated | `Review.filter(appointment__in=scoped)` | **T** | Inherits | LOW |
| **`/api/reviews/listing/<professional_id>/`** | GET | IsAuthenticated | **Any business's reviews by enumerable id** | **G (by design)** | Move to platform host or tenant-filter | **HIGH** |
| `/api/reviews/booking/<pk>/` | POST, PATCH | IsAuthenticated | Through `scoped()` + `may_reply` | **T** | Inherits | LOW |
| `/admin/` | all | staff/superuser | **Every row of every model** | **G** | Needs a tenant-aware admin or must be restricted to `admin.gosalon.com` | **HIGH** |
| `ws://…/ws/bookings/` | WS | JWT | Per-user group | **T** | Tenant in the group name; host-based origin validation | MED |
| `POST :8001/analyze` | POST | **none** | Vision call on a customer photo | **T** | Needs auth, a tenant, and metering | **CRITICAL** |
| `POST :8001/generate` | POST | **none** | Image edit | **T** | Same | **CRITICAL** |

### 18.1 Serializers needing tenant validation

`BookingCreateSerializer.validate_listing` (via `parse_listing`), `AvailabilityQuerySerializer.validate_listing` (same function), `SalonEmployeeCreateSerializer` (which salon), `SalonWriteSerializer.save` (`user.salons.first()`), `profile_payload`, `UserSerializer.get_profile`.

`ServiceSerializer` and `BarberProfileWriteSerializer` already narrow their relation querysets — they need the *owner* concept changed from user to tenant, not new protection.

---

## 19. Database Impact

### 19.1 The new tenant model (does not exist)

At minimum a `Tenant` needs: `slug` (unique, lowercase, DNS-safe, reserved-word blocklist — `www`, `api`, `admin`, `app`, `mail`, `static`, `assets`), `name`, `is_active`, `created_at`, and a link to whichever of `Salon` / `BarberProfile` it represents.

**Two shapes are possible and the choice matters:**

- **(a) `Salon` *is* the tenant**, gaining `slug`/`is_active`. Least new code, but leaves lone barbers (`BarberProfile`) tenant-less — 9 of 57 dev users and 3 of 17 dev appointments.
- **(b) A separate `Tenant` model** with `Salon` and `BarberProfile` each pointing at one. Uniform, handles both business kinds, and gives you somewhere to put plan/billing/branding later. More migration work up front.

**RECOMMENDATION:** (b), because the existing `salon XOR barber` pattern proves the codebase already needs a concept that is "either kind of business", and `Tenant` is exactly that concept finally given a name.

### 19.2 Columns and indexes

If you denormalise `tenant_id` onto the hot tables (recommended for `Appointment`):

`Appointment.Meta.indexes` today:
```python
models.Index(fields=('salon', 'date')),
models.Index(fields=('barber', 'date')),
models.Index(fields=('customer', '-starts_at')),
```
These become `('tenant', 'date')`, `('tenant', 'starts_at')`, `('tenant', 'status', 'date')`, with `('customer', '-starts_at')` retained **unprefixed** because a customer's own history deliberately spans tenants. `status`, `date` and `starts_at` keep their single-column `db_index`.

`Appointment` also gains a constraint asserting `tenant` agrees with `salon`/`barber` — otherwise the denormalised column can drift from the XOR pair, which is precisely the failure `Apps/reviews/models.py` warns about.

### 19.3 Two schema bugs found during the audit

Both are pre-existing and both become worse under tenancy.

**(a) `ServiceCategory` unique constraint is ineffective for the shared catalogue.**

```python
models.UniqueConstraint(fields=('owner', 'name'), name='unique_category_name_per_owner')
```

`owner` is nullable, and in both SQLite and PostgreSQL `NULL != NULL`, so this constraint **does not prevent two shared categories with the same name**. The dev database has 7 shared rows seeded by `Apps/services/migrations/0002_seed_shared_categories.py`; nothing stops an eighth duplicate.

Note the contrast: `Apps/schedules/models.py` gets this right, using `condition=models.Q(salon__isnull=False)` on each of its three unique constraints. The pattern to copy is already in the codebase.

**(b) Salon-owner registration can create a second salon.**

```python
salon, _ = Salon.objects.update_or_create(
    owner=user, name=data['business_name'].strip(), defaults={...})
```

`name` is part of the lookup. Registration takes over an unverified account (`BaseRegistrationSerializer.validate_phone` allows it deliberately), so re-registering the same unverified phone with a different `business_name` creates a **second** `Salon` for that owner. Every reader then uses `.first()` — alphabetical — and may pick the wrong one. The dev data has no such case (all 7 owners with a salon have exactly one), but 5 owners have **zero** salons, which is the mirror-image problem for migration (§30).

### 19.4 Constraint and index change summary

| Change | Where | Reason |
|---|---|---|
| Add `Tenant` table | new app | Tenant root |
| Add `slug` unique + reserved-word validation | `Tenant` | It is the subdomain |
| Add `is_active` | `Tenant` | Suspension |
| Add `tenant` FK + check constraint | `Appointment` | Hot path |
| Add `tenant` FK (or derive) | `Service`, `GalleryImage`, `WorkingDay`, `SalonEmployee`, `ServiceCategory` | Isolation |
| Rebuild 3 composite indexes | `Appointment` | Tenant-leading |
| Drop or rewrite `unique_active_employment_per_user` | `SalonEmployee` | Only if multi-salon staff |
| Fix `unique_category_name_per_owner` | `ServiceCategory` | Partial constraint for NULL owner |
| Decide on `User.phone` uniqueness | `User` | Global identity vs per-tenant accounts |
| Consider UUID or opaque public ids | all | `salon-3` is enumerable (§26) |

---

## 20. Booking Impact

### 20.1 Entity-by-entity

| Entity | Tenant relationship | Change needed |
|---|---|---|
| **Customer** (`User`, nullable on `Appointment`) | **Cross-tenant by nature.** A customer books at several salons; `scoped()` for a customer is `filter(customer=user)` with no business filter. | Keep global. Their booking list must *not* be tenant-filtered, or the customer app breaks. This is the one deliberate cross-tenant read. |
| **Salon** | Tenant root | Gains slug/status |
| **Barber** (`BarberProfile`) | Tenant root **and** employee trade record | Must be disambiguated (§36 Q2) |
| **Service** | Tenant-owned via `salon` XOR `barber` | Tenant filter; `eligible_employees` already in-tenant |
| **Appointment** | Tenant-owned; customer is not | Tenant column + index rebuild |
| **Schedule** (`WorkingDay`/`WorkingInterval`) | Tenant-owned via the 3-way XOR | Tenant filter on `_stretches()` lookups |
| **Payment** | **Does not exist** | See §21 |
| **Cancellation** | A status + reason on `Appointment` | Inherits |
| **Platform fee** | `BOOKING_PLATFORM_FEE`, one global integer in settings | Becomes per-tenant if plans differ (§36 Q9) |

### 20.2 Flow-by-flow

**Booking creation.** `BookingCreateSerializer` resolves `listing` from the request body via `parse_listing`, which does `Salon.objects.filter(pk=int(raw))` with **no ownership or tenant filter**. Under tenancy this must assert the resolved business *is* `request.tenant`. Service validation already restricts ids to that business's menu (`.filter(salon=salon)`), and chair validation already restricts to `salon=salon, is_active=True` — so once the listing is pinned to the tenant, the rest of the serializer is already safe.

**Booking listing.** `BookingListCreateView.get` returns `scoped()` plus optional `status`/`date`/`upcoming` filters, capped at 200. Owner/employee/barber viewpoints must gain the tenant filter; the customer viewpoint must not.

**Booking detail and all five actions.** All go through `BookingActionView.appointment` → `scoped().filter(pk=pk).first()`. **Fixing `scoped()` fixes all six endpoints at once.** This is the highest-leverage change in the codebase.

**Cancellation.** `CancelView` needs no tenant logic of its own — `runs_business()` and `is_customer_of()` are relationship checks and remain correct. The deadline comes from `salon.cancellation_window_hours` or `barber.cancellation_window_hours`, both per-business already.

**Rescheduling.** `booking_service.reschedule` calls `create_appointment` with the *same* `salon`/`barber` off the original row, so a move can never change tenant. Already safe.

**Barber assignment.** `Appointment.clean()` already raises *"That chair belongs to another salon"* when `employee.salon_id != salon_id`. A cross-tenant chair assignment is **already blocked at the model level** — one of the strongest existing isolation guarantees in the project.

**Availability.** `day_availability` filters appointments by `salon=` or `barber=`, so occupancy never crosses businesses. The exposure is at the API edge: `AvailabilityView` accepts any `listing` from any authenticated caller (§18).

**Notifications.** `Apps/bookings/notifications.py::notify` sends via `get_sms_provider()` using one global `SMS_SENDER_ID`. Per-tenant sender IDs or per-tenant SMS accounts would change `notify()` and `AppointmentNotification` (which records `provider` but not an account).

### 20.3 Cross-tenant leakage points in booking

1. `parse_listing` — any business by enumerable pk. **HIGH.**
2. `AvailabilityView` — occupancy and `employee_ids` for any business. **HIGH.**
3. `reports._repeat()` — queries `Appointment.objects` **unscoped**, then narrows by a `Q(salon_id=…, salon_id__isnull=False) | Q(barber_id=…, barber_id__isnull=False)` pair. It is *correct* today (the business pair is always matched, and the comment explains that matching on `salon_id` alone would make every lone barber's customers each other's regulars), but it is the **one place in the reporting layer that starts from the unfiltered manager**. It must gain a tenant filter and must be covered by a negative test. **MEDIUM.**
4. `realtime.recipients()` — safe, because each candidate is re-run through `scoped()`. Inherits the fix. **LOW.**

---

## 21. Payment Impact

Because §8 established that no payment system exists, this section is a **design brief with tenancy constraints**, not an impact analysis. Nothing here describes existing code.

### 21.1 The decision that must come first

**Who is the merchant of record?**

- **(a) Platform-collected.** The platform charges the customer, keeps `platform_fee`, and pays out to salons. Needs: one gateway account, a ledger, a payout engine, KYC per salon, and per-tenant balances. The existing `Appointment.platform_fee` column already assumes this model.
- **(b) Salon-collected.** Each salon holds its own gateway credentials; the platform bills the salon separately (subscription). Needs: encrypted per-tenant credential storage, per-tenant webhook endpoints or a shared endpoint with tenant resolution, and no platform-held funds.
- **(c) Cash/offline only** — which is what the code does today. `paid_with` and `tip` are recorded at the counter; no money moves through the system.

**UNCLEAR FROM CODEBASE.** §36 Q9.

### 21.2 Webhook tenancy — the standard trap

When you build webhooks, the tenant **must not** be read from the URL path or a body field. A webhook is an unauthenticated public endpoint by definition. The correct chain is:

1. Verify the provider's signature over the **raw body**, before parsing, using the secret belonging to the account the signature claims.
2. Look up your own stored transaction by the provider's reference, and read the tenant **from your row**, not from the payload.
3. Enforce idempotency on the provider's event id — retries are guaranteed, and a double-credit is a real financial bug.
4. Never trust an `amount` or `tenant` field in the payload over your own record.

Under model (b), a shared endpoint plus per-tenant secrets means you must identify the tenant *before* verifying the signature in order to know which secret to use — resolve it by the provider's account id in the payload, verify, then confirm it matches your stored row. Per-tenant webhook URLs (`/webhooks/<opaque-token>/`) sidestep this and are simpler to reason about.

### 21.3 Tenancy constraints on the future schema

- Every money row carries `tenant` explicitly, never derived through three joins.
- `platform_fee` must become a per-tenant rate, not `settings.BOOKING_PLATFORM_FEE`, if plans differ. Note `Apps/bookings/reports.py` already sums `platform_fee` **from the row, not from the setting**, *"not recomputed from a setting that may since have moved"* — the reporting layer is already built for a fee that varies. Good.
- Commission (`SalonEmployee.commission_rate`) is already per-employment, and `_by_staff` documents that it is applied at *today's* rate because nothing records the historical rate. If commission ever becomes billable, that gap becomes a correctness problem.
- Subscriptions belong on `Tenant`, not on `User` — an owner with two salons must be billed twice.

---

## 22. AI Impact

### 22.1 What has to be built before isolation is even meaningful

There is nothing to isolate today: the AI service holds no records, and the only server-side artefact is a `try_on_credits` integer nobody decrements. The required build, in order:

1. **Authenticate the AI service.** Either put it behind the Django API (Django validates the JWT, debits a credit, proxies to `:8001` over a private network), or have it verify the same JWT itself using a shared `JWT_SIGNING_KEY`. **RECOMMENDATION:** proxy through Django. It keeps one authority for identity, one place to meter, and lets you take port 8001 off the public internet entirely — which also fixes the current OpenRouter-key exposure.
2. **Meter server-side.** Debit `try_on_credits` inside a transaction *before* the provider call, refund on provider failure. Client-side counting cannot be made correct.
3. **Record the generation.** A model holding tenant, user, source-photo reference, style, result reference, model id, latency and cost. This is the first AI table and the first thing tenancy applies to.
4. **Decide who pays.** Platform-funded credits per customer (today's shape), or per-tenant AI quotas the salon buys. §36 Q10.

### 22.2 Tenancy questions specific to AI, once it exists

- **Is a try-on tenant-scoped at all?** A customer's try-on is arguably a property of the *customer*, not of a salon — they may try a style at home and then book anywhere. If so, AI records stay global and carry an optional `tenant` for attribution only. If salons buy AI credits, it is tenant-scoped and the customer's history fragments across salons.
- **Customer photographs are biometric-adjacent personal data.** Today they are sent from the browser to a third-party model provider with no consent record, no retention policy and no deletion path on the server (the browser holds them in IndexedDB indefinitely). Under a per-salon SaaS, a salon becomes a data controller for its customers' faces. This needs a consent record, a retention policy and a delete path regardless of which tenancy model you pick, and it is a **legal**, not merely technical, requirement.
- **Cost attribution.** `services/ai/main.py` returns `meta.model` and `meta.latency_ms` but nothing is stored, so per-tenant AI spend is currently unknowable.

### 22.3 The 360° capture path

The most recent commit (`4339409`) added 360° capture: up to 8 labelled angles to `/analyze`, and `/generate` accepting a `style_reference` so every angle matches one haircut. Client state lives in `services/frontend/src/utils/threeSixty.ts` and `angles.ts`, photos in IndexedDB. This multiplies both the cost per try-on and the volume of customer photographs sent to the provider — it raises the stakes on §22.1 and §22.2 without changing their shape.

---

## 23. Storage Impact

### 23.1 The current model cannot support multi-tenancy, and cannot support production either

Storing images as base64 `data:` URLs in `TEXT` columns fails for reasons that precede tenancy:

- Every directory response inlines them. A 50-listing page with galleries is multiple megabytes of JSON, uncacheable by any CDN and unservable over a Bangladeshi mobile connection.
- Row size makes `SELECT *` expensive; the ORM's `select_related`/`prefetch_related` chains in `Apps/directory/views.py` pull these columns on every listing.
- Base64 costs ~33% over the raw bytes, on top of the database's own storage and backup.
- There is no way to serve, cache, resize, or expire an image — because there is no image, only a column.

`Apps/common/images.py` anticipates exactly this: *"A real deployment with many photographs should move these to object storage and keep the URL here; the field is a string either way, so that migration is a backfill rather than a redesign."* That is true and is the good news: **`ImageRefField` already accepts an `https://` URL**, so the field does not change — only the writer and a backfill.

### 23.2 Tenant-aware storage design (none of this exists)

**Answering your §13 questions against the current code:**

| Question | Answer today |
|---|---|
| Where are files stored? | In the database, as text. |
| How are paths generated? | There are no paths. |
| Are filenames predictable? | There are no filenames. |
| Are URLs public? | The 3 `http` URLs in the dev data point at external hosts; the rest are inline data. |
| Can users access another tenant's files? | **Yes — via `/api/directory/`,** which returns every business's gallery to every authenticated account. Not a storage flaw; an endpoint-scope flaw. |
| Cloudinary / S3? | Neither. No storage SDK in any dependency list. |
| Tenant-specific folders? | No folders exist. |

**RECOMMENDATION for the target state:**

```
s3://gosalon-media/t/<tenant_uuid>/<kind>/<random-32-hex>.<ext>
                     ▲              ▲       ▲
                     │              │       └ unguessable, never derived from
                     │              │         user input or a sequential id
                     │              └ gallery | avatar | cover | tryon
                     └ tenant UUID, never the slug — a slug can be renamed,
                       and renaming must not move objects
```

Rules that follow from this codebase specifically:

- **Prefix by tenant UUID, not slug.** `Tenant.slug` is the subdomain and is user-visible and potentially renameable; the storage prefix must be stable.
- **Public-read for gallery and avatars** (they already appear in a directory any authenticated user can read) behind a CDN, with a per-tenant path so a bucket policy or a CDN rule *can* be applied later.
- **Private + short-lived signed URLs for customer try-on photos.** These are faces, not shopfronts, and must never share a policy with public gallery images.
- **Never accept a client-supplied path or filename.** Generate server-side; the existing `validate_image_ref` refuses bare filenames for exactly this reason (*"a bare filename would be a path waiting to be dereferenced"*).
- **Validate on upload** — magic bytes, not the extension; re-encode to strip EXIF (which carries GPS). `services/ai/image_io.py::normalize_upload` already does a real decode and applies EXIF rotation; that logic is the model to copy.
- **Backfill path:** write new uploads to object storage → background-convert existing `data:` rows to objects → rewrite the column to the URL → drop nothing (the field stays a `TextField`). No schema change is needed.

### 23.3 Effort note

51 gallery rows + ~22 avatars in the dev database. If production volumes are similar, the backfill is minutes. The work is the upload endpoint, the storage client, the signing, the CDN and the frontend picker change — not the data movement.

---

## 24. Frontend Impact

### 24.1 What must change

| Concern | File | Change |
|---|---|---|
| Tenant detection | **new** | Parse `window.location.hostname`; resolve the label; handle `gosalon.com` (no tenant) and `localhost` |
| API base URL | `src/utils/apiClient.ts` | `BASE_URL` is `const` read once from `import.meta.env` at module load. Must become tenant-derived at runtime — this single line drives every service module |
| WS URL | `src/utils/realtimeClient.ts::socketUrl` | Derives from `BASE_URL`; inherits the fix |
| AI base URL | `src/utils/aiService.ts` | `AI_BASE_URL` from env; must move behind the authenticated API (§22.1) |
| Session storage | `src/store/useAppStore.ts` | `localStorage` is per-origin — decide SSO (§16.4). The key `eureka.app` is shared across all state |
| Tenant context | **new** | A provider exposing tenant name, branding, and "is this the platform host?" |
| Routing | `src/App.tsx` | On a tenant host, marketplace routes (`/search`, `/home` shortlist, `/professional/:id`) either disappear or become single-business |
| Guards | `src/components/RouteGuards.tsx` | Add a tenant-membership guard beside the role guards |
| Branding | `src/styles/theme.css` | Currently one global token set swapped by a class on `<html>`. Per-tenant branding needs runtime CSS custom properties fed from the tenant payload |
| Build/deploy | `vite.config.ts`, `index.html` | One bundle must serve every subdomain (see below) |

### 24.2 The build-time vs runtime problem

`VITE_API_BASE_URL` is a **build-time** substitution. A single built bundle currently cannot point at different API hosts. Three ways out:

- **(a) Derive at runtime from `window.location`** — one bundle, no config; the cleanest fit for `*.gosalon.com` where the API is same-origin under `/api/`.
- **(b) Fetch a small `/config.json` per host at boot** — one bundle, one extra round trip before first paint.
- **(c) Build per tenant** — do not do this; it does not scale past a handful of salons.

**RECOMMENDATION:** (a), with the API served same-origin under `/api/` on every tenant host. It removes CORS from the tenant hosts entirely, which also removes the `CORS_ALLOWED_ORIGINS` wildcard problem in §29 and the `OriginValidator` problem in §14.3.

### 24.3 What does not need to change

The ~230 UI components, the i18n bundles, the styles, the booking wizard's internals, the offline banner, the service worker, the IndexedDB photo store, and the zustand stores' shapes. The frontend's tenancy work is concentrated in about six files plus a new context — the app is not structurally hostile to it.

### 24.4 The admin dashboard

`services/admin-dashboard` has no backend at all. It does not need "tenant changes" — it needs to be **built**, against a platform-admin API that does not yet exist. Treat it as new work, not migration work.

---

## 25. Admin Impact

### 25.1 The five actors, as the code defines them

| Actor | `Role` value | What they can reach today | Under tenancy |
|---|---|---|---|
| **Platform admin** | `admin` (+ `is_staff`/`is_superuser`) | Django admin at `/admin/` — every row of every model. `IsAdmin` exists in `permissions.py` but **is not used by a single view**. `/api/profile/me/` PATCH explicitly refuses them (*"Administrator accounts are managed on the admin site"*) | Needs a real cross-tenant API and a host of its own; needs an audit trail (none exists) |
| **Salon owner** | `salon_owner` | Their salon (`.first()`), its staff, services, schedules, gallery, all its bookings, analytics | Scoped to `request.tenant`; must be able to own several |
| **Salon employee** | `salon_employee` | Only bookings assigned to their chair; salon services **read-only**; salon hours read-only; their own gallery and profile minus employer-owned fields | Scoped to the tenant of their employment |
| **Barber** | `barber` | Their own diary, menu, hours, gallery — and, if also employed, that chair's bookings | Is itself a tenant, or a member of one |
| **Customer** | `customer` | Their own bookings and reviews; the whole directory | Cross-tenant by design |

`Apps/users/permissions.py::IsAdmin` returning `user.role == 'admin' or user.is_superuser` is defined and exported but referenced nowhere in the API layer — confirmed by grep. **There is no admin API.**

### 25.2 Django admin under tenancy

`django.contrib.admin` is registered for `User`, `Salon`, `SalonEmployee`, `OTPCode`, `CustomerProfile`, `BarberProfile`, `Service`, `ServiceCategory`, `WorkingDay`, `Appointment`, `AppointmentNotification`. `Review` and `GalleryImage` are **not** registered.

Under `*.gosalon.com`, `/admin/` would be reachable at **every tenant subdomain** because `core/urls.py` mounts it unconditionally. A staff user visiting `salon-a.gosalon.com/admin/` would see the whole platform. Required change: serve admin only on `admin.gosalon.com` (host-based URLconf or a proxy rule), or add a tenant-aware `ModelAdmin.get_queryset` — and be aware that `AppointmentAdmin.list_display` includes `business_name`, which is a property doing a join per row.

### 25.3 What "platform admin" needs that does not exist

An admin API (zero endpoints today), tenant provisioning/suspension, an audit log (the React console has a mock `auditLog.ts` with no backend), impersonation with consent and logging, cross-tenant search, platform-wide analytics (the only aggregates that exist are per-business, in `reports.py`, built on `scoped()`), and moderation (mock-only).

---

## 26. Security Audit

Severity is stated **for the target multi-tenant SaaS**. Several items are correct, deliberate designs in today's marketplace and are marked as such.

### CRITICAL

| # | Finding | Location | Current behaviour | Issue under tenancy | Required architectural change |
|---|---|---|---|---|---|
| C1 | **AI service is completely unauthenticated** | `services/ai/main.py` | `POST /analyze`, `POST /generate`; CORS origin list is the only control; `allow_credentials=True` with `allow_methods=["*"]` | No user, no tenant, no quota. Anyone reaching :8001 spends the OpenRouter key without limit. `curl` ignores CORS entirely | Put it behind the authenticated API on a private network; verify JWT; meter per user and tenant |
| C2 | **Directory exposes every business to every account** | `Apps/directory/views.py::DirectoryListView`, `DirectoryDetailView` | Returns all salons + barbers with phone, staff names, prices, hours, galleries; detail by enumerable `salon-<pk>` | A competing salon owner enumerates the whole platform's operational data from inside their own subdomain | Move to the platform host, or tenant-filter to one listing. **This is the §36 Q1 decision** |
| C3 | **No tenant binding on JWTs** | `Apps/users/views.py::issue_tokens` | Claims are `user_id` + `role` only | A token minted at `salon-a` is valid verbatim at `salon-b`; nothing in the auth path inspects the host | Tenant claim + host cross-check + live membership assertion (§15.1) |
| C4 | **`DEBUG` defaults to `True`** | `core/settings.py` | `DEBUG = env_bool('DJANGO_DEBUG', True)` — the default when the variable is **absent** is on | A deployment that forgets the variable serves tracebacks with settings, SQL and environment, on every tenant host. Also re-enables `OTPCode.debug_code` plaintext storage and permits `SMS_PROVIDER=console` | Default to `False`; fail loudly on a missing explicit value in production |

### HIGH

| # | Finding | Location | Current behaviour | Issue under tenancy | Required change |
|---|---|---|---|---|---|
| H1 | **Availability discloses any business's occupancy** | `Apps/bookings/views.py::AvailabilityView` + `AvailabilityQuerySerializer.validate_listing` | Any authenticated user, any `listing=salon-N`, per-slot free/taken plus `employee_ids` | Competitive intelligence: how busy is the salon next door, which stylist is idle | Assert the listing belongs to `request.tenant` |
| H2 | **Listing reviews are global** | `Apps/reviews/views.py::_for_listing` | Any authenticated user reads any business's reviews, with reviewer short-names and stylist names | Cross-tenant read of customer-adjacent data | Platform host, or tenant-filter |
| H3 | **Credits are enforced client-side only** | `services/frontend/src/store/*`; `User.try_on_credits` never decremented server-side | Browser counts; server never checks | Unbounded AI spend per account; unattributable per tenant | Server-side debit in a transaction |
| H4 | **`unique_active_employment_per_user` blocks multi-tenant staff** | `Apps/users/models.py` | DB-level: one active job per person | Not a vulnerability — a hard structural limit that will be discovered late if not decided early | Decide §36 Q3 before writing migrations |
| H5 | **Global identity assumptions** | `User.phone unique=True`; `User.role` single field | One phone = one account = one role, platform-wide | A person cannot be a customer at A and a stylist at B | Decide global identity + per-tenant membership (§16.3) |
| H6 | **Django admin mounted on every host** | `core/urls.py` | `path('admin/', admin.site.urls)` unconditionally | `salon-a.gosalon.com/admin/` exposes the entire platform to any staff user | Host-restricted URLconf or proxy rule |
| H7 | **Eight `.salons.first()` call sites** | §17.3 | Alphabetically-first salon silently chosen | Wrong-tenant reads and writes once an owner has two salons | Tenant-qualify all eight |
| H8 | **`Salon.objects.update_or_create(owner, name)` can create a second salon** | `Apps/users/serializers.py::SalonOwnerRegistrationSerializer.build_profile` | Re-registering an unverified phone with a new business name adds a salon | Ambiguous tenant provisioning | Make provisioning explicit and idempotent |
| H9 | **No tenant suspension mechanism** | `Salon` has no `is_active` | A salon cannot be switched off | Non-payment, abuse and offboarding have no lever | Add `is_active` and enforce in the resolver |

### MEDIUM

| # | Finding | Location | Note |
|---|---|---|---|
| M1 | **Sequential integer primary keys everywhere** | all models | `salon-1`, `salon-2`, `/api/bookings/47/` are trivially enumerable. Not a vulnerability by itself — `scoped()` returns 404 for rows you cannot see — but it is the enabler behind C2, H1 and H2, and it leaks volume (row counts) through id magnitude |
| M2 | **`reports._repeat()` starts from the unfiltered manager** | `Apps/bookings/reports.py` | `Appointment.objects.filter(same_business)…` — correct today because the business pair is always matched, but the one reporting query not derived from `scoped()`. Also N+1: one `EXISTS` per completed appointment in the window |
| M3 | **`ServiceCategory` unique constraint ineffective for shared rows** | `Apps/services/models.py` | `(owner, name)` with nullable owner; `NULL != NULL`. Duplicate shared categories are permitted |
| M4 | **Throttling is per-process and not tenant-aware** | `core/settings.py` | No `CACHES` configured → DRF uses `LocMemCache`. Limits are per worker process, and one tenant can consume the platform's budget |
| M5 | **CORS is a literal origin list; `CSRF_TRUSTED_ORIGINS` derives from it** | `core/settings.py` | Cannot express `*.gosalon.com`. `CORS_ALLOWED_ORIGIN_REGEXES` is not used |
| M6 | **WebSocket `OriginValidator` fed the same literal list** | `core/asgi.py` | Same wildcard problem; a permissive fix here opens the socket to any origin |
| M7 | **Images inline in the database and in every directory response** | §10 | No object-level access control is possible; response sizes are unbounded in practice |
| M8 | **Customer photographs to a third-party provider with no consent record** | `services/ai` + frontend | Faces sent to OpenRouter; no consent row, no retention policy, no server-side deletion path |
| M9 | **Channel layer is in-memory by default** | `core/settings.py` | Two workers → each reaches only its own sockets. A correctness bug at any scale beyond one process |
| M10 | **No audit log** | — | Nothing records who changed what. Under tenancy, cross-tenant admin actions must be attributable |

### LOW

| # | Finding | Note |
|---|---|---|
| L1 | `SECRET_KEY` has a committed `django-insecure-…` default | Only reachable if the env var is unset; pairs badly with C4 |
| L2 | `OTPCode.debug_code` stores the plaintext code — **but only when `DEBUG` is true** (`issue_otp`: `debug_code=code if settings.DEBUG else ''`). Correct as written; the risk is entirely C4 |
| L3 | `SMS_PROVIDER=console` refuses to start when `DEBUG` is off (`ConsoleSMSProvider.__init__` raises `ImproperlyConfigured`) — a genuinely good guard |
| L4 | `AppointmentAdmin.list_display` includes the `business_name` property — a join per row on a list page |
| L5 | No API versioning — a tenant-aware contract change has no migration path for old clients |

### Things that are already right and should be preserved

Worth stating explicitly, because a rewrite would lose them:

- `DEFAULT_PERMISSION_CLASSES = IsAuthenticated` — closed by default.
- `scoped()` as a single choke point, reused by four subsystems rather than reimplemented.
- 404-not-403 on unauthorised object access — no existence oracle.
- Writable relation fields narrowed in serializer `__init__` — no cross-owner writes found.
- `Appointment.clean()` rejecting a chair from another salon at model level.
- Walk-in business derived from `request.user`, never the body.
- OTPs stored as hashes, one live code per purpose, attempt and send ceilings, and the code invalidated when delivery fails.
- Login checks the password before revealing anything about the account; forgot-password gives the same answer either way.
- Refresh-token rotation with blacklisting, and `revoke_all_sessions` on password change.
- WebSocket tokens in the subprotocol, not the query string.
- Realtime recipients re-validated through `scoped()` rather than trusted.

---

## 27. Performance & Caching

### 27.1 What exists

**No application caching at all.** No `CACHES` setting, no `django.core.cache` import outside `Apps/users/tests/base.py` (which calls `cache.clear()` between tests), no `cache_page`, no `@lru_cache` on a query, no Redis in use unless `REDIS_URL` is set for the channel layer.

**There are therefore no cache keys to make tenant-aware.** Your `salon_services` → `tenant:{id}:salon_services` example has no counterpart in this codebase.

What does use a cache, implicitly: **DRF throttling**, via Django's default `LocMemCache`. Keys are `throttle_user_<pk>` and `throttle_anon_<ip>` — per user and per IP, not per tenant. Two consequences: limits are per worker process (so `240/min` with 4 workers is really 960/min), and one tenant's traffic consumes a platform-wide budget.

### 27.2 When you add caching, the rules that follow from this codebase

- **Every key gets a tenant prefix**, including throttle scopes: `t:{tenant_id}:throttle:user:{pk}`.
- **Channel-layer groups**: `group_for(user_id)` returns `bookings.user.<id>`. With a shared Redis across tenants these collide only if user ids collide (they cannot, ids are global) — so it is *safe today*, but prefix it anyway (`t{tenant}.bookings.user.{id}`) so that a future per-tenant Redis or a tenant-level broadcast has somewhere to live.
- **CDN/edge cache key must include `Host`.** This is the highest-risk caching mistake available to you: a wildcard-subdomain deployment behind Cloudflare that caches `/index.html` or `/api/directory/` without `Host` in the key will serve Salon A's response to Salon B. Vary on `Host` and never cache authenticated API responses at the edge.
- **`Vary: Origin`** on any CORS-enabled response, or a proxy will cache one tenant's CORS headers for another.

### 27.3 Existing performance characteristics that tenancy will stress

| Item | Location | Note |
|---|---|---|
| Directory does all filtering in Python | `DirectoryListView.get` | Loads **every** salon and barber with 6 prefetches, builds every listing dict, *then* filters by type/audience/area/text/open-now in Python, then slices to `limit`. Fine for 7 salons; it is O(all businesses) per search. Tenant filtering would actually *improve* this dramatically |
| `_matches_query` | same | Python substring search over a joined haystack — no index, no full-text |
| `reports._repeat()` | `reports.py` | One `EXISTS` query per completed appointment in the window |
| `scoped()` prefetches | `access.py` | 10 `select_related` + 1 `prefetch_related` on every booking read — well-tuned, keep |
| `scores_for` | `ratings.py` | Two `GROUP BY` queries for a whole page — good, and **impossible to preserve under Option B/C** |
| Base64 images in list responses | `directory/serializers.py::_gallery` | Response size grows with gallery count; uncacheable |
| SQLite | `settings.py` | Single writer. Concurrent booking writes serialise; `create_appointment` holds a transaction across an availability recomputation. **Postgres is a prerequisite for any multi-tenant load** |

---

## 28. Background Jobs

**FACT: there are none.** Verified by repo-wide grep for `celery`, `Celery`, `crontab`, `@receiver`, `post_save`, `pre_save`, `django_redis`, `apscheduler`, `rq`, `huey` across `services/backend/Apps` and `services/backend/core`. There is no `tasks.py`, no `signals.py`, no `apps.py` `ready()` hook wiring signals, and no management command beyond Django's built-ins.

Everything runs inline in the request:

| Deferred-looking work | Where it actually runs |
|---|---|
| SMS OTP delivery | Inline in `issue_otp`, synchronously, inside the registration/OTP request |
| Booking approval/rejection SMS | Inline in `ApproveView`/`RejectView` via `notify()` |
| Realtime broadcast | `transaction.on_commit` callback, in-process, `async_to_sync` |
| AI analysis and generation | In the browser's request to FastAPI; `run_in_threadpool` off the event loop, but still within the HTTP request |

**Implications:**

1. **There is no tenant context to leak today**, because there is no worker. §19 of your brief is currently not applicable.
2. **When you add workers**, the rule is: pass the tenant **explicitly as a task argument** and re-resolve it inside the task. Do not rely on a thread-local or a `request` — Celery workers have neither. This codebase is already disciplined about this: `realtime.publish` takes the appointment as an argument rather than reading ambient state, and `schedules/services.py` functions take an explicit `owner` dict. Keep that style.
3. **Two pieces of work are already asking to be moved off the request path** and will become the first tasks: SMS delivery (a slow gateway currently stalls a user-facing request; `notify()` already records the failure rather than raising, so it is half-ready) and AI generation (20–60 s of provider latency held open by the browser).
4. **`transaction.on_commit` is the one existing async-ish boundary.** `realtime.publish` runs there and swallows all exceptions deliberately. It runs in the web process with the request's database connection already committed — tenancy-wise it is safe because the appointment object carries its own business, not because anything scopes it.

---

## 29. Deployment & DNS

**FACT: there is no deployment configuration in this repository.** No compose file, no CI, no nginx conf, no Procfile, no IaC. The only container definition is `services/ai/Dockerfile` (multi-stage, non-root, `uvicorn --workers 2`, healthcheck on `/health`). Everything below is therefore a **design**, not a change.

### 29.1 DNS and TLS

```
gosalon.com          A/CNAME → edge        apex: marketing + marketplace
www.gosalon.com      CNAME   → edge
admin.gosalon.com    CNAME   → edge        platform admin (restricted)
api.gosalon.com      CNAME   → edge        only if the API is split off
*.gosalon.com        CNAME   → edge        every tenant
```

- **Wildcard certificate `*.gosalon.com`.** Note it covers exactly one level: `salon-a.gosalon.com` ✓, `a.b.gosalon.com` ✗. If you ever want `booking.salon-a.gosalon.com`, that is a second wildcard.
- Let's Encrypt wildcards require **DNS-01** validation, not HTTP-01. Cloudflare's universal certificate covers one level of subdomain at no cost; deeper needs Advanced Certificate Manager.
- **Custom domains** (a salon bringing `salon-a.com`) need per-domain certificate issuance and a `Domain` table mapping hostname → tenant. **UNCLEAR FROM CODEBASE / §36 Q11.**

### 29.2 Django settings that must change

| Setting | Today | Must become |
|---|---|---|
| `ALLOWED_HOSTS` | `env_list('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1')` | `['.gosalon.com']` — Django's leading-dot wildcard. **Never `['*']`**: the `Host` header would become an unauthenticated tenant selector (§15.1) |
| `CORS_ALLOWED_ORIGINS` | literal list | Either eliminated (same-origin `/api/`) or `CORS_ALLOWED_ORIGIN_REGEXES = [r"^https://[a-z0-9-]+\.gosalon\.com$"]` — note the anchors and the restricted charset; a loose regex matching `gosalon.com.evil.com` is the classic bug |
| `CSRF_TRUSTED_ORIGINS` | derived from `CORS_ALLOWED_ORIGINS` | `['https://*.gosalon.com']` — Django 4+ supports a wildcard here |
| `OriginValidator` origins | `settings.CORS_ALLOWED_ORIGINS` in `core/asgi.py` | `AllowedHostsOriginValidator`, or a custom validator matching the same anchored regex |
| `DATABASES` | hard-coded SQLite | PostgreSQL from `DATABASE_URL`, with `CONN_MAX_AGE` |
| `CHANNEL_LAYERS` | InMemory unless `REDIS_URL` | Redis, mandatory |
| `CACHES` | absent | Redis, for throttling and tenant resolution |
| `DEBUG` | defaults **True** | default `False` |
| `SECURE_PROXY_SSL_HEADER` | set only when `not DEBUG` | Correct as written; verify the proxy actually strips client-supplied `X-Forwarded-Proto` |
| `SECURE_HSTS_INCLUDE_SUBDOMAINS` | `True` when `not DEBUG` | Correct and important for `*.gosalon.com` — but note it commits **every** subdomain to HTTPS, permanently, for the HSTS max-age (1 year as configured) |
| `MEDIA_*` / storage | absent | Object storage backend |

### 29.3 Reverse proxy requirements

Two rules matter more than the rest:

- **`proxy_set_header Host $host;`** — without it the proxy forwards its own upstream name and every tenant collapses into one. This is the single most likely deployment-day failure.
- **Do not let a client-supplied `X-Forwarded-Host` reach Django** unless you explicitly want it and have set `USE_X_FORWARDED_HOST`; today that setting is absent, so Django reads `Host`, which is correct and should stay that way.

WebSocket routes need `proxy_http_version 1.1`, `Upgrade`/`Connection` headers, and a read timeout longer than the 25 s client ping in `realtimeClient.ts`.

### 29.4 Local development

`localhost` subdomains resolve automatically in Chrome, Firefox and Safari (`*.localhost` → `127.0.0.1`, per RFC 6761) — **no `/etc/hosts` edit needed** for `salon-a.localhost`.

```
DJANGO_ALLOWED_HOSTS=.localhost,localhost,127.0.0.1
```

Django's leading-dot form accepts `salon-a.localhost`. Vite already sets `server.allowedHosts: true` and `host: '0.0.0.0'`, so `http://salon-a.localhost:5174` works today without a config change. The frontend's hostname parser must treat a bare `localhost` (no label) as the platform host.

Caveat: cookies on `.localhost` behave inconsistently across browsers. If you choose the shared-cookie SSO option (§16.4), develop against a real domain such as `*.gosalon.test` mapped in `/etc/hosts`, or `*.localtest.me` which resolves to 127.0.0.1 publicly.

### 29.5 Deployment ordering

Because there is nothing to migrate *from*, the sequence is: Postgres first (it gates everything), then Redis, then object storage, then wildcard DNS + TLS, then the tenant resolver. Attempting the tenant work on SQLite will produce a design that does not survive the database change — `create_appointment`'s transaction-scoped availability recheck in particular behaves differently under SQLite's single-writer model than under Postgres row locking.

---

## 30. Data Migration Strategy

No migration code below — a plan only.

### 30.1 What you are actually migrating

The development database holds 57 users, 7 salons, 28 barber profiles, 18 employments, 24 services, 17 appointments, 7 reviews and 51 gallery images. **Volume is a non-issue.** The risk is entirely in ambiguity, and the audit found three concrete ambiguities in this very dataset:

| Ambiguity | Count in dev data | Why it blocks a clean backfill |
|---|---|---|
| Salon-owner accounts with **no salon** | **5 of 12** | A tenant root with nothing to be a tenant of. Provision an empty tenant? Leave them tenant-less? Delete? |
| `BarberProfile` rows belonging to `salon_employee` users | **21 of 28** | These are *not* businesses; they are personal records inside another tenant. Any script that treats "has a BarberProfile" as "is a tenant" creates 21 phantom tenants |
| A `BarberProfile` belonging to a `salon_owner` | **1** | Neither an independent business nor an employee record. Manual classification required |

Plus: 4 of 17 appointments have `customer_id IS NULL` (walk-in guests with only a name), and 794 outstanding refresh tokens carry no tenant.

**Do not write the backfill until every row in these four categories is classified.** A rule that is 95% right produces silent cross-tenant contamination that no test will catch.

**ASSUMPTION:** production data, if any exists, has the same shapes in different proportions. If there is a production database, run the same four queries against it before planning anything.

### 30.2 Ordering

Foreign keys dictate the order; the rule is *parents before children, nullable before non-null*.

```
Phase A — schema, additive only, zero downtime
  A1  Create Tenant (empty)
  A2  Add Tenant.slug (unique), is_active
  A3  Add nullable tenant FK to: Salon, BarberProfile, SalonEmployee,
      Service, ServiceCategory, WorkingDay, GalleryImage, Appointment
      → every column NULL; nothing reads it yet; fully reversible

Phase B — backfill, data-only, idempotent, re-runnable
  B1  One Tenant per Salon              (7 rows)   slug from name, collisions resolved
  B2  One Tenant per INDEPENDENT barber (6 rows)   role == 'barber' ONLY
      ⚠ never "has a BarberProfile" — that is 28 rows, 21 of them wrong
  B3  Salon.tenant, BarberProfile.tenant (independents only)
  B4  SalonEmployee.tenant  ← salon.tenant
  B5  Service.tenant        ← salon.tenant or barber.tenant   (XOR guarantees one)
  B6  WorkingDay.tenant     ← salon / barber / employment.salon
  B7  GalleryImage.tenant   ← salon.tenant or barber.tenant
  B8  Appointment.tenant    ← salon.tenant or barber.tenant
  B9  ServiceCategory: owner IS NULL → stays global (7 rows)
                       owner NOT NULL → that owner's tenant (1 row)
  B10 Manual queue: 5 salonless owners, 1 owner-with-barber-profile,
      any BarberProfile whose user role is neither barber nor salon_employee

Phase C — verify, before anything is enforced
  C1  SELECT COUNT(*) FROM <each table> WHERE tenant_id IS NULL   → expect 0
  C2  Cross-check: no Appointment whose tenant disagrees with its salon/barber
  C3  Cross-check: no SalonEmployee whose tenant != its salon's tenant
  C4  Cross-check: no Service whose eligible_employees span two tenants
  C5  Row counts per tenant reconcile with pre-migration per-salon counts

Phase D — enforce
  D1  tenant FK → NOT NULL, one table at a time
  D2  Add the tenant/business agreement CheckConstraints
  D3  Build tenant-leading composite indexes CONCURRENTLY (Postgres)
  D4  Drop or replace superseded indexes

Phase E — cut over
  E1  Deploy tenant middleware in SHADOW mode: resolve, log, do not enforce
  E2  Watch for unresolved hosts and membership mismatches in the logs
  E3  Enable enforcement
  E4  Revoke all sessions (revoke_all_sessions exists) so every token is
      re-minted with a tenant claim
```

### 30.3 Nullable → non-nullable

Never in one migration. The three-step (add nullable → backfill → alter to non-null) is mandatory because step 2 is the only one that can fail on data, and you want it to fail without holding a schema lock. On PostgreSQL, `ALTER TABLE … SET NOT NULL` takes an `ACCESS EXCLUSIVE` lock and scans the table; on 17 rows this is instant, on a real table add a validated `CHECK (tenant_id IS NOT NULL)` first (`NOT VALID` → `VALIDATE CONSTRAINT`) and only then set `NOT NULL`, which Postgres 12+ can then do without a scan.

### 30.4 Slug allocation

`Tenant.slug` becomes a public hostname, so it is not a cosmetic field:

- Derive from `Salon.name` → lowercase, ASCII-fold, non-alphanumerics to `-`, collapse runs, trim. **`Salon.name` is not unique** and has no uniqueness constraint, so collisions are expected: append `-2`, `-3`.
- Reject reserved labels: `www`, `api`, `admin`, `app`, `static`, `assets`, `cdn`, `mail`, `smtp`, `ftp`, `ns1`, `blog`, `help`, `support`, `status`, `dev`, `staging`, `test`.
- Reject anything that is not `^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$` — DNS label rules, and no leading/trailing hyphen.
- Bangladeshi salon names are frequently in Bengali script. `Salon.name` is a `CharField(max_length=60)` with no script restriction, so transliteration or a manual slug is required for any non-ASCII name. **Decide the rule before backfilling** — a generated `salon-7` fallback is ugly but safe.
- Slugs must be **immutable or redirect-mapped**. Changing one breaks every bookmark, and if you prefix object storage by slug (don't — §23.2) it orphans files.

### 30.5 Unique-constraint transitions during migration

| Constraint | Migration action |
|---|---|
| `users_user.phone` unique | Unchanged if identity stays global. If it becomes per-tenant, this is the hardest single change in the plan: 57 rows must be forked per membership, and `get_by_natural_key` / login / OTP all change |
| `unique_salon_employee (salon, user)` | Unchanged — already tenant-correct |
| `unique_active_employment_per_user (user) WHERE is_active` | **Drop if multi-membership is allowed.** Dropping is safe and reversible while no row violates it; re-adding later is not |
| `unique_category_name_per_owner (owner, name)` | Replace with two partial constraints: one `WHERE owner IS NULL` on `name` alone, one `WHERE owner IS NOT NULL` on `(owner, name)`. **Deduplicate shared categories first** — the current constraint never prevented duplicates |
| `WorkingDay` × 3 partial constraints | Unchanged — already correct |
| `Review.appointment` 1-1 | Unchanged |

### 30.6 Rollback

Phases A and B are reversible (drop columns; the source data — `salon_id`/`barber_id` — is never destroyed). Phase D is reversible but locks. Phase E is reversible by feature flag. **Never drop `Appointment.salon`/`barber` in the same release that adds `tenant`** — keep the redundancy for at least one release so a bad backfill can be recomputed from the original columns.

---

## 31. Testing Strategy

### 31.1 What exists

24 test modules, ~4,700 lines, all backend. `Apps/users/tests/base.py` and `Apps/bookings/tests/base.py` provide fixtures. `Apps/bookings/tests/test_permissions.py` (136 lines) and `Apps/users/tests/test_permissions.py` (112 lines) already test role boundaries. `test_realtime.py` (427 lines) tests socket delivery scoping. **No frontend tests** (`package.json` has no test script and no runner).

This is a good base. The tenancy work adds a dimension to it, not a replacement.

### 31.2 The negative-test matrix — the core of the strategy

Every one of these must be written as an explicit test that asserts a **404 or 403**, and must run in CI. Absence of a positive test is a gap; absence of these is a vulnerability.

```
Setup: Tenant A (salon + owner + employee + service + booking + review + gallery)
       Tenant B (same)
       Customer C with a booking at A and a booking at B
       Platform admin P
```

| # | Actor | Action | Expected |
|---|---|---|---|
| T1 | A's owner | `GET /api/bookings/<B's booking id>/` | **404** (not 403 — no existence oracle) |
| T2 | A's owner | `POST /api/bookings/<B's id>/approve/` | **404** |
| T3 | A's owner | `GET /api/directory/<B's listing id>/` on `salon-a.` host | **404** |
| T4 | A's owner | `GET /api/bookings/availability/?listing=<B>` on `salon-a.` host | **403/404** |
| T5 | A's owner | `GET /api/reviews/listing/<B>/` on `salon-a.` host | **403/404** |
| T6 | A's owner | `GET /api/services/<B's service id>/` | **404** |
| T7 | A's owner | `PATCH /api/salon/employees/<B's employment id>/` | **404** |
| T8 | A's owner | `PUT /api/schedule/employees/<B's employment id>/` | **404** |
| T9 | A's owner | `PATCH /api/profile/me/gallery/<B's image id>/` | **404** |
| T10 | A's owner | `POST /api/services/` with `eligible_employee_ids=[B's chair]` | **400** |
| T11 | A's employee | `GET /api/bookings/` on `salon-b.` host with a valid A token | **403** — the token must not work on B's host |
| T12 | A's employee | `GET /api/bookings/analytics/` | **403** (employee viewpoint, existing rule) |
| T13 | A's employee | `GET /api/bookings/<A booking not assigned to them>/` | **404** (existing rule) |
| T14 | Customer C | `GET /api/bookings/` | **both** bookings — the deliberate cross-tenant read |
| T15 | Customer C | `POST /api/bookings/` on `salon-a.` host naming B's listing | **400/403** |
| T16 | Customer C | `POST /api/reviews/booking/<someone else's>/` | **404** |
| T17 | anonymous | every tenant-scoped endpoint | **401** |
| T18 | anonymous | `GET https://salon-a.gosalon.com/` | 200 (public profile) or 401 — **whichever §36 Q8 decides**; test the decision |
| T19 | anyone | `GET https://nonexistent.gosalon.com/api/…` | **404**, and specifically **not** a fallback to a default tenant |
| T20 | anyone | `GET https://salon-a.gosalon.com/api/…` with `Host: salon-b.gosalon.com` injected | rejected by `ALLOWED_HOSTS` |
| T21 | suspended tenant's owner | any endpoint | **403/410** |
| T22 | A's owner | WebSocket connect to `salon-b.` host with an A token | handshake refused |
| T23 | A's owner | after B publishes a booking event | **no** message received |
| T24 | A's owner | AI generate for a customer of B | **403** |
| T25 | anyone | direct `POST :8001/generate` without a token | **401** |
| T26 | A's owner | request B's stored try-on image URL | **403** |
| T27 | A's owner | `GET B's gallery image URL` (object storage) | 200 if public-by-design, **403** if not — test the decision |
| T28 | platform admin P | cross-tenant read | 200 **and** an audit-log row written |

### 31.3 Layer-by-layer

| Layer | What to test |
|---|---|
| **Unit** | Slug generation (collisions, reserved words, non-ASCII, DNS rules); host→tenant parsing (apex, `www`, unknown label, `localhost`, injected `Host`, port-suffixed host, uppercase host); membership assertion for every role |
| **Integration** | `scoped()` under every (role × tenant) pair, including a user with memberships in two tenants if Q3 allows it |
| **API** | The T1–T28 matrix above, plus a positive twin for each so a change that breaks everything is not mistaken for a pass |
| **Permission** | Each permission class composed with the tenant guard; assert `IsAdmin` is or is not exempt, deliberately |
| **Security** | Enumeration: walk `salon-1..N` and `/api/bookings/1..N` as each role and assert a uniform 404. Token replay across hosts. `Host` header injection. Slug-collision squatting during registration |
| **Database** | Migration forwards and backwards on a copy of real data; the five Phase-C reconciliation queries as assertions; constraint violations rejected |
| **Subdomain** | Django's test client needs `HTTP_HOST` on every request — **this is the change that touches all 24 existing test modules.** Add it once in `Apps/*/tests/base.py` rather than per test |
| **Authentication** | Token minted at A rejected at B; refresh cannot widen tenant; membership change revokes sessions; multi-membership login (if allowed) |
| **Booking** | Cross-tenant listing, chair, service and reschedule all refused; `create_appointment`'s in-transaction recheck still correct under Postgres row locking |
| **Payment** | When built: webhook signature failure, replay, cross-tenant reference, idempotency |
| **AI** | Credit debit is transactional; refund on provider failure; no credit → 402/403; unauthenticated call refused |
| **File access** | Tenant prefix enforced; signed URL expiry; no path traversal; a URL from tenant A never resolves inside tenant B's prefix |
| **Frontend** | There are no frontend tests today. At minimum add unit tests for hostname parsing and the tenant-aware API base URL — the two places a bug sends a request to the wrong tenant |

### 31.4 A structural recommendation

Write **one** `TenantIsolationTestCase` base class that takes two fully-populated tenants and exposes `as_a(role)`, `on_host(tenant)` helpers. Then every T-case is three lines. Without that, the matrix will be written once and never extended, and the next endpoint added will not be covered.

---

## 32. Existing Project vs New Project

### Option 1 — Migrate the existing project

**Development effort.** Concentrated and mostly mechanical. The high-leverage surface is small: one new middleware, one new `Tenant` model, `access.py::scoped` (one function, four consumers), eight `.salons.first()` call sites, four `visible_*`/`*_owner` helpers, three global endpoints, and six frontend files. The *large* effort is elsewhere and is not migration at all: Postgres, object storage, a payment system, AI metering, and an admin backend — all of which Option 2 also has to do.

**Migration effort.** Low on volume (§30.1), moderate on ambiguity (5 salonless owners, 21 misclassifiable barber profiles).

**Risk.** Moderate, and *known*. The failure mode is a forgotten queryset filter, which the §31 matrix is designed to catch. Every existing security property (§26 "already right") is preserved by default rather than re-earned.

**Feature preservation.** Complete. The booking engine alone — slot grid, buffer time, chair eligibility intersection, schedule inheritance, in-transaction double-booking defence, typed refusals, reschedule-as-new-row with frozen prices, walk-ins, cancellation windows — is roughly 1,100 lines of carefully reasoned code with 2,000 lines of tests behind it. It encodes a large number of decisions that were clearly learned the hard way; several comments describe the exact bug that motivated the current shape.

**Data preservation.** Complete.

**Technical debt.** You inherit: SQLite, base64 images, no payments, no storage, single-role identity, global `phone` uniqueness, sequential ids, the `BarberProfile` duality, and the two schema bugs in §19.3. **But you inherit these in Option 2 as well unless you deliberately redesign them** — and a redesign is a decision to make explicitly, not a side effect of starting a new repository.

**Testing effort.** 24 existing modules need `HTTP_HOST` plumbing plus the new matrix. Existing coverage of booking rules, permissions and realtime carries over intact.

**Deployment impact.** Everything is new (§29). Identical in both options.

### Option 2 — Build a new project

**Development effort.** Re-implementing 14,350 lines of backend and ~230 frontend components. The booking engine, the availability algorithm, the OTP/JWT stack, the realtime scoping, the reports module and the bilingual UI would all be rewritten.

**Migration effort.** Higher, not lower: you still must move the same data, but into a schema that no longer maps 1:1, so every mapping is bespoke.

**Risk.** Higher in a specific and under-appreciated way: **the current code's correctness is largely invisible.** `Apps/bookings/availability.py::chair_hours` documents a bug where a stylist's day off fell back to the salon's hours and sold the whole day. `Apps/bookings/services.py::create_walk_in` documents filing every walk-in six hours in the past because `localtime()` resolved against UTC. `Apps/bookings/serializers.py::SlotTimeField` documents `14:00:30` swallowing the next slot. `Apps/bookings/reports.py::_taka` documents one series carrying two spellings of a taka. A rewrite reintroduces every one of these, and they are all silent.

**Feature preservation.** By hand, feature by feature. The 24 test modules are the specification; they would have to be ported first to have any chance.

**Technical debt.** Genuinely lower *if* the redesign is disciplined. This is Option 2's only real advantage.

**Testing effort.** Everything from zero.

**Deployment impact.** Identical.

### Assessment

**FACT:** the existing codebase's tenancy gap is *breadth without depth* — tenancy is missing everywhere, but the places it must be inserted are few and already centralised. The `salon XOR barber` check constraints, the single `scoped()` function, and the serializer-level relation narrowing mean the isolation scaffolding is largely built; what is missing is the word "tenant".

**FACT:** the four genuinely large pieces of work — PostgreSQL, object storage, payments, AI metering — are identical in both options, because none of them exists today.

**FACT:** the two structural obstacles — `BarberProfile`'s dual role and `unique_active_employment_per_user` — are schema decisions, not code-quality problems, and a new project would have to make the same decisions.

**RECOMMENDATION:** migrate. A rewrite would spend most of its budget re-deriving booking correctness that is already paid for, and would not shorten the four large builds by a day. The one condition: if §36 Q1 is answered "no marketplace, each salon is a wholly isolated product", then a substantial part of the customer app (`/search`, the directory, `scores_for`, the distance sort, `useDirectoryStore`) becomes dead code — and at that point a **partial** rewrite of the customer-facing frontend, on the same backend, becomes reasonable.

---

## 33. File-by-File Impact

### MUST CHANGE

| File | Architectural responsibility | Change required |
|---|---|---|
| `services/backend/core/settings.py` | All configuration | `ALLOWED_HOSTS` wildcard, CORS regex, `CSRF_TRUSTED_ORIGINS`, Postgres, `CACHES`, Redis channel layer, register tenant middleware, `DEBUG` default, storage backend |
| `services/backend/core/asgi.py` | ASGI entry, WS origin + auth | `OriginValidator` cannot take a wildcard; add tenant resolution to the WS scope |
| `services/backend/core/urls.py` | URL root | Restrict `/admin/` to the admin host |
| **new** `Apps/tenants/` (models, middleware, permissions) | Tenant root, resolution, membership assertion | Does not exist |
| `Apps/users/models.py` | `User`, `Salon`, `SalonEmployee`, profiles | `Salon`/`Tenant` link + slug + `is_active`; `SalonEmployee` constraints; role-vs-membership |
| `Apps/users/serializers.py` (1,066 lines) | Registration, profiles, employee management | `SalonOwnerRegistrationSerializer` = tenant provisioning; `profile_payload`, `UserSerializer.get_profile`, `SalonWriteSerializer`, `active_employment` all use `.first()` |
| `Apps/users/views.py` | Auth endpoints, staff management | `issue_tokens` (tenant claim), `LoginView`, `SalonEmployeeListCreateView._salon` |
| `Apps/bookings/access.py` | **The scoping choke point** | Add tenant to `scoped()` and `business_of()`. **Highest leverage file in the migration** |
| `Apps/bookings/models.py` | `Appointment` + derived | Tenant column, check constraint, 3 rebuilt indexes |
| `Apps/bookings/serializers.py` | `parse_listing`, booking + walk-in validation | Assert the resolved listing is `request.tenant` |
| `Apps/bookings/views.py` | Booking endpoints | `AvailabilityView` listing assertion; the rest inherits `scoped()` |
| `Apps/directory/views.py` | The marketplace | The §36 Q1 decision lands here |
| `Apps/reviews/views.py` | `_for_listing` | Global-by-id read |
| `Apps/services/views.py` | `visible_services`, `service_owner` | `.first()` + tenant |
| `Apps/schedules/views.py` | `own_owner`, `salon_owner_of` | `.first()` + tenant |
| `Apps/portfolio/views.py` | `gallery_owner` | `.first()` + tenant |
| `Apps/services/models.py` | `ServiceCategory` constraint | Partial-constraint fix (§19.3a) |
| `services/frontend/src/utils/apiClient.ts` | The one HTTP client | Runtime tenant-derived `BASE_URL` |
| `services/frontend/src/utils/realtimeClient.ts` | WS URL + lifecycle | Inherits, plus tenant in the handshake |
| `services/frontend/src/store/useAppStore.ts` | Session persistence | Per-origin vs SSO decision |
| `services/frontend/src/App.tsx` | Routing | Tenant vs platform route trees |
| `services/frontend/src/components/RouteGuards.tsx` | Client-side guards | Tenant membership guard |
| `services/ai/main.py` | AI endpoints | Authentication, tenant, metering |

### LIKELY CHANGE

| File | Why |
|---|---|
| `Apps/bookings/reports.py` | Inherits `scoped()`, but `_repeat()` starts from the unfiltered manager (§26 M2) |
| `Apps/bookings/availability.py` | Already business-filtered; needs a tenant assertion at its entry points |
| `Apps/bookings/realtime.py` | Group naming if you want channel-layer-level isolation |
| `Apps/bookings/consumers.py` | Tenant in the group it joins |
| `Apps/users/ws_auth.py` | Tenant resolution in the WS scope |
| `Apps/users/permissions.py` | New `IsTenantMember`, `IsPlatformAdmin`; compose with existing classes |
| `Apps/reviews/ratings.py` | `scores_for` spans businesses by design — must be tenant-scoped or moved to the platform host |
| `Apps/directory/serializers.py` | Branding fields; gallery URLs after storage migration |
| `Apps/services/serializers.py` | Owner concept moves from user to tenant |
| `Apps/portfolio/serializers.py`, `Apps/common/images.py` | Storage migration turns `data:` writes into URL writes |
| `Apps/bookings/notifications.py`, `Apps/users/services/sms.py` | Per-tenant sender ID or SMS account |
| All 24 `Apps/*/tests/` modules | `HTTP_HOST` on every request |
| `services/frontend/src/utils/{directoryService,bookingService,aiService,authService}.ts` | Inherit the client change; directory semantics change |
| `services/frontend/src/constants/index.ts` | Route table if marketplace routes move |
| `services/frontend/src/styles/theme.css` | Runtime custom properties for branding |

### MAY CHANGE

`Apps/*/admin.py` (tenant-aware `get_queryset` if admin is not host-restricted) · `Apps/users/services/otp.py` (per-tenant OTP copy) · `Apps/users/exceptions.py` (new tenant error codes) · `Apps/bookings/models.py::business_tz` and `BUSINESS_TIME_ZONE` (one global timezone today — a multi-city SaaS needs it per tenant) · `services/admin-dashboard/*` (needs building, not changing) · `services/ai/hair_code.py`, `hair_generate.py` (only if prompts become tenant-configurable).

**Note on `BUSINESS_TIME_ZONE`:** it is a single global setting (`Asia/Dhaka`) read by `Apps/bookings/models.py::business_tz`, `Apps/bookings/availability.py`, `Apps/bookings/reports.py` and `Apps/directory/hours.py`. If tenants are ever in different timezones this becomes a per-tenant field, and it touches the availability grid, the "open now" computation and every revenue bucket. Worth deciding early even if the answer is "Bangladesh only".

### NO CHANGE EXPECTED

`Apps/users/phone.py` · `Apps/directory/geo.py` · `Apps/directory/hours.py` (logic; the timezone source may change) · `Apps/common/text.py` · `Apps/schedules/models.py` (constraints already correct) · `Apps/schedules/services.py` (takes an explicit `owner` dict — already the right shape) · `Apps/reviews/models.py` · `Apps/reviews/permissions.py` · `Apps/bookings/models.py` time arithmetic · the ~200 presentational frontend components · all i18n bundles · all CSS except `theme.css`.

---

## 34. Future Implementation Roadmap

Each phase states objective, affected areas, dependencies, risks and the expected result. **Nothing below is implemented.**

### Phase 0 — Decisions and infrastructure *(blocking)*

- **Objective:** answer §36; stand up Postgres, Redis and object storage.
- **Affected:** `core/settings.py`, local dev setup, the test suite.
- **Depends on:** you.
- **Risks:** starting Phase 1 before Q1/Q2/Q3 are answered produces a tenant model that has to be redone; building on SQLite produces concurrency behaviour that does not survive Postgres.
- **Result:** a settled tenant definition and a database that can support one.

### Phase 1 — Tenant foundation

- **Objective:** `Tenant` model, slug allocation, provisioning, suspension. No behaviour change.
- **Affected:** new `Apps/tenants/`, `Apps/users/models.py`.
- **Depends on:** Phase 0.
- **Risks:** slug rules for non-ASCII names; reserved-word collisions.
- **Result:** tenants exist and are inert.

### Phase 2 — Database changes

- **Objective:** Phases A–D of §30. Nullable columns → backfill → verify → enforce.
- **Affected:** all seven app migration trees.
- **Depends on:** Phase 1; the manual classification of §30.1's ambiguous rows.
- **Risks:** an over-broad backfill rule silently contaminating tenants; premature `NOT NULL`.
- **Result:** every row knows its tenant; nothing reads the column yet.

### Phase 3 — Tenant middleware

- **Objective:** resolve the tenant from the host; run in **shadow mode** first.
- **Affected:** `core/settings.py`, `core/asgi.py`, new middleware, `Apps/users/ws_auth.py`.
- **Depends on:** Phase 2; wildcard DNS in at least one environment.
- **Risks:** a proxy not forwarding `Host`; a fallback-to-default that masks failures.
- **Result:** `request.tenant` is populated and logged; no request is refused yet.

### Phase 4 — Authentication

- **Objective:** tenant claim in the JWT; membership assertion; revocation on membership change.
- **Affected:** `issue_tokens`, `LoginView`, `OTPVerifyView`, `ChangePasswordView`, `ws_auth.py`, `permissions.py`.
- **Depends on:** Phase 3; the Q3 (multi-membership) answer.
- **Risks:** locking out existing sessions — mitigate by accepting tenant-less legacy tokens for one release, then revoking all.
- **Result:** a token is only usable on its own tenant's host.

### Phase 5 — Permissions

- **Objective:** tenant filter in `scoped()` and the four `visible_*`/`*_owner` helpers; the eight `.first()` sites.
- **Affected:** `access.py`, `services/views.py`, `schedules/views.py`, `portfolio/views.py`, `users/serializers.py`.
- **Depends on:** Phase 4.
- **Risks:** **the highest-risk phase.** One missed filter is a leak. Land the §31 matrix *before* this phase, not after.
- **Result:** every scoped read is tenant-bound.

### Phase 6 — APIs

- **Objective:** the three global endpoints; listing assertions; the marketplace decision.
- **Affected:** `directory/views.py`, `reviews/views.py`, `bookings/views.py::AvailabilityView`, `bookings/serializers.py::parse_listing`.
- **Depends on:** Phase 5; Q1.
- **Risks:** this is where the product changes shape, not just the code.
- **Result:** no cross-tenant read remains except the deliberate ones.

### Phase 7 — Booking

- **Objective:** verify the booking engine end to end under tenancy.
- **Affected:** mostly verification — the engine inherits Phases 5 and 6.
- **Depends on:** Phase 6.
- **Risks:** low. `Appointment.clean()` already blocks cross-salon chairs; reschedule already copies the business.
- **Result:** bookings provably cannot cross tenants.

### Phase 8 — Payments *(new build)*

- **Objective:** merchant-of-record decision, gateway, ledger, webhooks, per-tenant fee.
- **Depends on:** Q9; Phase 1.
- **Risks:** highest business risk; webhook tenancy (§21.2) is where the bugs live.
- **Result:** money moves, attributed per tenant.

### Phase 9 — AI *(new build)*

- **Objective:** authenticate the AI service, meter credits server-side, record generations, take :8001 off the public internet.
- **Depends on:** Phase 4; Q10.
- **Risks:** proxying adds latency to a 20–60 s call — stream or poll rather than holding a synchronous request.
- **Result:** AI spend is bounded, attributed and isolated. **This phase also closes C1 and H3, which are live today** — consider pulling it earlier.

### Phase 10 — Storage *(new build)*

- **Objective:** object storage, tenant-prefixed keys, signed URLs for private objects, backfill the `data:` columns.
- **Depends on:** Phase 1.
- **Risks:** low. `ImageRefField` already accepts URLs, so the schema does not change.
- **Result:** responses shrink dramatically; media is isolatable.

### Phase 11 — Frontend

- **Objective:** runtime tenant detection, tenant-aware base URLs, tenant context, branding, route split.
- **Depends on:** Phases 3–6.
- **Risks:** the build-time/runtime env problem (§24.2); the session-storage decision (§16.4).
- **Result:** one bundle serves every subdomain.

### Phase 12 — DNS / deployment

- **Objective:** wildcard DNS, wildcard TLS, proxy config, `Host` forwarding, edge cache keys.
- **Depends on:** Phase 11.
- **Risks:** `proxy_set_header Host` and the CDN cache key — the two failures that silently serve one tenant's data to another.
- **Result:** `salon-a.gosalon.com` works.

### Phase 13 — Testing

- **Objective:** the §31 matrix in CI, on every commit.
- **Note:** listed here to match your numbering, but **T1–T28 must land before Phase 5**, not after. Tests written after the isolation code only prove the code does what it does.

### Phase 14 — Production migration

- **Objective:** execute §30 Phase E on real data.
- **Risks:** the ambiguous rows; unresolved hosts; the session revocation.
- **Result:** live multi-tenant platform.

**Critical path:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 11 → 12 → 14. Phases 8, 9 and 10 are independent builds that can run in parallel, and **Phase 9 should be pulled forward** because C1 and H3 are exposures today.

---

## 35. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **The marketplace question is answered late**, after the tenant model is built | Medium | **Severe** — rework of Phases 1–6 | Answer Q1 before Phase 1 |
| R2 | **A forgotten queryset filter leaks data between salons** | **High** — it is the standard failure of shared-schema tenancy | Severe | Keep `scoped()` the only entry point; land T1–T28 before Phase 5; add Postgres RLS |
| R3 | **A proxy does not forward `Host`**, collapsing all tenants into one | Medium | **Severe** | Assert it in a smoke test on every deploy; fail closed on an unresolved tenant |
| R4 | **CDN caches a response without `Host` in the key** | Medium | **Severe** | Never edge-cache authenticated API responses; `Vary: Host` and `Vary: Origin` |
| R5 | **`ALLOWED_HOSTS = ['*']`** as a quick fix | **High** — it is the obvious thing to type | Severe — the `Host` header becomes a tenant selector | `['.gosalon.com']`; lint for `'*'` in CI |
| R6 | Backfill misclassifies the 21 employee `BarberProfile` rows as tenants | **High** if automated naively | High | Classify by `user.role == 'barber'`, never by profile existence; manual queue for the 6 outliers |
| R7 | Multi-membership decided after `unique_active_employment_per_user` is relied upon | Medium | High | Answer Q3 in Phase 0 |
| R8 | AI service stays unauthenticated | **Certain today** | High — uncapped provider spend | Phase 9 early |
| R9 | SQLite carried further than intended | Medium | High — single writer under concurrent booking | Postgres in Phase 0 |
| R10 | `DEBUG=True` reaches production because the variable was omitted | Medium | **Severe** | Invert the default |
| R11 | Base64 images make responses unusable at real volume | **High** at scale | Medium–High | Phase 10 |
| R12 | Tokens outlive membership changes by up to 30 days | Medium | High | Live membership assertion, not the token claim; revoke on membership change |
| R13 | Slug squatting or collisions at registration | Medium | Medium | Reserved list, collision suffixes, immutability |
| R14 | No audit log for cross-tenant admin action | Certain today | Medium | Build with Phase 1 |
| R15 | Per-tenant restore requested after choosing shared-schema | Medium | Medium | Decide the backup promise in Phase 0 |
| R16 | The 24 test modules are not updated for `HTTP_HOST` and silently test the wrong host | Medium | Medium | Centralise in the two `tests/base.py` files |
| R17 | Customer photo handling without consent/retention becomes a legal exposure | Medium | High | Address in Phase 9 regardless of tenancy |

---

## 36. QUESTIONS I NEED TO ANSWER BEFORE IMPLEMENTATION

Only questions the codebase genuinely cannot answer. Q1–Q3 block everything else.

### Blocking

**Q1. Does the marketplace survive?**
Today `GET /api/directory/` returns every business to every authenticated customer, and the whole customer journey — home shortlist, search, filters, distance sort, ratings comparison — is cross-business. Under `salon-a.gosalon.com`, which is true?
&nbsp;&nbsp;**(a)** The marketplace lives at `gosalon.com`; subdomains are salon-branded booking pages + staff dashboards. *(Both models coexist; most work; most product value preserved.)*
&nbsp;&nbsp;**(b)** No marketplace. Each salon is an isolated product; customers arrive by direct link. *(`/search`, the directory, `scores_for` and `useDirectoryStore` become dead code; a large part of the customer app is deleted.)*
&nbsp;&nbsp;**(c)** Something else.
**Nothing else can be designed until this is answered.**

**Q2. What is a tenant — a salon, or any business?**
9 of 57 dev users are independent barbers with their own diary, menu, hours and bookings. `BarberProfile` is also the personal trade record of 21 salon employees. So: is a lone barber a tenant with their own subdomain? If not, where do their 3 existing appointments live? And does an employee's `BarberProfile` belong to their salon's tenant or to them personally?

**Q3. Can one person work at two salons?**
`SalonEmployee` currently forbids it at database level (`unique_active_employment_per_user`). Dropping that constraint is cheap now and expensive later, and the answer determines whether `User.role` stays a global field or moves onto the membership row.

### Important

**Q4. Are customers global or per-tenant?**
`User.phone` is globally unique; a customer's booking list spans businesses. If a customer at Salon A must not be visible to Salon B, that is a fundamentally different data model than the one that exists.

**Q5. Can one owner run several salons?**
`Salon.owner` is a ForeignKey (many allowed) but eight call sites use `.salons.first()` (§17.3). Every owner in the dev data has exactly one. If several are allowed, all eight must be tenant-qualified and the owner needs a tenant switcher.

**Q6. Is the service-category catalogue global or per-tenant?**
7 shared categories (`owner IS NULL`) are seeded by migration and shown to everyone. Keep a platform catalogue, or give every tenant its own?

**Q7. Is a signed-in session shared across subdomains?**
`localStorage` is per-origin, so today a session does **not** follow a user from `salon-a` to `salon-b`. Per-origin sessions (simplest, safest) or SSO via a `.gosalon.com` cookie (requires abandoning `Authorization: Bearer` for cookies, enabling `CORS_ALLOW_CREDENTIALS`, and adding CSRF protection)?

**Q8. Should a salon's public profile work without authentication?**
Every endpoint is `IsAuthenticated` today, deliberately, because listings carry business phone numbers. A public `salon-a.gosalon.com` landing page means a new anonymous, rate-limited, reduced-payload endpoint — it cannot reuse `/api/directory/`.

**Q9. Who is the merchant of record?**
No payment system exists. Platform-collected (needs ledger, payouts, KYC — matches the existing `platform_fee` column), salon-collected (needs encrypted per-tenant credentials), or cash-only (today's behaviour)? And is `BOOKING_PLATFORM_FEE` (one global integer, currently 50) per-tenant?

**Q10. Who pays for AI, and is a try-on tenant-scoped?**
`try_on_credits` exists but is never enforced server-side. Platform-funded per customer, or per-tenant quotas the salon buys? And does a customer's try-on history belong to them (global) or to the salon they did it at?

### Operational

**Q11. Custom domains?** Will a salon bring `salon-a.com`, or is `*.gosalon.com` sufficient? Custom domains need a `Domain` table and per-domain certificate issuance.

**Q12. Do platform admins see every tenant's data?** `IsAdmin` exists but is used by no view; Django admin sees everything. What may a platform admin read, and must every cross-tenant access be audit-logged? (No audit log exists.)

**Q13. Is per-tenant restore a product promise?** "Restore Salon A to yesterday" is trivial under schema-per-tenant and hard under shared-schema. It is a §13 input, not an afterthought.

**Q14. One timezone or many?** `BUSINESS_TIME_ZONE` is a single global setting (`Asia/Dhaka`) read by the availability grid, the "open now" check and every revenue bucket. Bangladesh only, or will tenants span timezones?

**Q15. Scale target?** Tens, hundreds, or thousands of tenants? At tens, schema-per-tenant is comfortable; at thousands it is not. This changes the §13 answer.

**Q16. Is `gosalon.com` the confirmed production domain, and does the product get renamed?** Every artefact in the repository says "Eureka" — the app name, the SMS copy, the localStorage keys (`eureka.app`, `eureka.photos`), the IndexedDB database name. A rename touches user-visible copy, storage keys (a migration for returning users) and the SMS template.

---

## 37. FINAL TECHNICAL ASSESSMENT

### What can remain unchanged

- **The booking engine's logic.** Availability, the slot grid, buffer handling, chair-eligibility intersection, schedule inheritance, the in-transaction double-booking defence, typed refusals, reschedule-as-a-new-row with frozen prices, walk-ins, cancellation windows. Roughly 1,100 lines with 2,000 lines of tests, encoding a lot of hard-won detail.
- **The authentication stack's mechanics.** OTP hashing, one-live-code, attempt and send ceilings, refresh rotation with blacklisting, `revoke_all_sessions`, the no-enumeration login, the WebSocket subprotocol token.
- **The authorization *shape*.** `scoped()` as one choke point with four consumers; 404-not-403; serializer-level relation narrowing; walk-in business derived from the caller; `Appointment.clean()` rejecting another salon's chair.
- **`Apps/schedules/`** almost entirely — its partial unique constraints are already the pattern the rest of the codebase needs, and its services take an explicit `owner` dict rather than ambient state.
- `phone.py`, `geo.py`, `hours.py` logic, `common/text.py`, the ~200 presentational frontend components, all i18n, all CSS except `theme.css`.

### What must change

- **Everything host-related** — `ALLOWED_HOSTS`, CORS, CSRF, `OriginValidator`, plus a tenant middleware that does not exist.
- **`Apps/bookings/access.py::scoped()`** — one function, and fixing it fixes the six booking endpoints, the reviews reads, the reports and the realtime fan-out at once. The highest-leverage change available.
- **The eight `.salons.first()` call sites** — mechanical, repetitive, and each one a silent wrong-tenant bug if missed.
- **The three globally-readable endpoints** — directory, availability, listing reviews. This is where the product decision lands in code.
- **JWT tenancy** — claim, host cross-check, live membership assertion, revocation on membership change.
- **Identity and membership** — `SalonEmployee`'s one-active-job constraint, and whether `role` is a property of a person or of a membership.
- **The database** — SQLite → PostgreSQL, before anything else.
- **Four things that must be built, not migrated:** object storage, a payment system, server-side AI metering, and a platform admin backend.

### Biggest risks

1. A forgotten queryset filter leaking data between salons — the standard failure mode of shared-schema tenancy, and the reason T1–T28 must exist before Phase 5.
2. Answering the marketplace question after the tenant model is built.
3. Infrastructure that silently collapses tenants — a proxy not forwarding `Host`, an edge cache without `Host` in the key, or `ALLOWED_HOSTS = ['*']`.
4. Backfilling from "has a `BarberProfile`" and creating 21 phantom tenants.
5. Two exposures that are live **today**, independent of tenancy: an unauthenticated AI service holding your OpenRouter key, and `DEBUG` defaulting to `True`.

### Major architectural decisions required

1. Does the marketplace survive, and where does it live?
2. Is a tenant a salon, or any business including a lone barber?
3. Shared-schema + `tenant_id`, or schema-per-tenant?
4. Is identity global with per-tenant membership, or per-tenant accounts?
5. Can one person hold two jobs, and can one owner run two salons?
6. Per-origin sessions or cross-subdomain SSO?
7. Who is the merchant of record?
8. Who pays for AI, and does a try-on belong to the customer or the salon?

### Questions you must answer

§36, Q1–Q16. **Q1, Q2 and Q3 block all implementation work.** Everything else can be answered during Phase 0 alongside the infrastructure build.

### Bottom line

The existing project should be migrated, not rewritten. Its tenancy gap is wide but shallow: tenancy is absent everywhere, yet the insertion points are few and already centralised, and the surrounding code is unusually careful — the `salon XOR barber` check constraints, the single `scoped()` function and the serializer-level relation narrowing amount to isolation scaffolding that was built without the word "tenant" ever being used.

The honest framing is that "convert Go Salon to multi-tenancy" is not one project. It is a **small, high-risk isolation retrofit** (the tenant column, the middleware, `scoped()`, the eight `.first()` sites, the three global endpoints) wrapped around **four substantial greenfield builds** (PostgreSQL + object storage, payments, AI metering, platform admin) that a new project would also have to do from scratch. Budget accordingly, and do not let the tenant column's apparent simplicity set the schedule.

---

*End of report. No project file was modified, no code generated, no migration created, no dependency installed, and no write was made to the database.*
