# Eureka backend

Django + DRF service behind the Eureka app. Today it holds the authentication
system: accounts, roles, phone verification, JWT sessions and the salon
owner's staff.

## Running it

```bash
uv sync
cp .env.example .env          # then fill it in
.venv/bin/python manage.py migrate
.venv/bin/python manage.py createsuperuser   # the only way to make an admin
.venv/bin/python manage.py runserver 0.0.0.0:8000
.venv/bin/python manage.py test Apps.users   # 86 tests
```

`0.0.0.0` rather than the default `127.0.0.1`, so the frontend's dev server
can reach this process and — through it — so can a phone on the same wifi.
Plain `runserver` binds loopback only, which looks identical from the Mac and
fails from everywhere else. See "Testing on a phone" below.

`runserver` is an **ASGI** server here — `daphne` is first in `INSTALLED_APPS`
— because the dashboards hold a WebSocket open. Everything HTTP behaves
exactly as before.

## Testing on a phone

Start this with `0.0.0.0:8000`, start the frontend normally (`npm run dev`
already listens on every interface), and open **the Mac's LAN address** on the
phone — `http://<mac-ip>:5174`. `ipconfig getifaddr en0` prints it.

Nothing else needs configuring, and in particular **no address is written down
anywhere**. The frontend asks its own origin for `/api`, `/ws` and `/ai`, and
Vite proxies those to this process and to the AI service (`server.proxy` in
`services/frontend/vite.config.ts`). So the phone talks only to whatever host
it loaded the page from, and a new DHCP lease changes nothing.

`npm run preview` needs nothing extra either — it is LAN-reachable and proxied
on the same terms, at `http://<mac-ip>:4174`, because Vite defaults its `host`
and `proxy` to the dev server's. Use it to test the service worker, which only
registers in a real build.

That is the fix for a failure worth recognising: every screen showing "No
connection. Check your internet and try again." on a phone while working
perfectly on the Mac. It meant the client had been told to call `localhost`,
which on a phone is the phone.

`ALLOWED_HOSTS` and CORS are also widened when `DEBUG` is on — the machine's
own LAN address is added automatically, and private-range origins are
accepted — but that is a safety net for anything that bypasses the proxy. A
deployment sets `DJANGO_DEBUG=false` and neither applies.

## Roles

Five, and only five. `barber` covers barbers and hairstylists of every kind —
a women's hairstylist is a `barber` whose `audience` is `women`. `salon_owner`
covers salons, barbershops and beauty parlours — a parlour is a salon whose
`audience` is `women`. Neither variation is a role.

| Role | Registers publicly | Made by |
| --- | --- | --- |
| `customer` | yes | `/api/auth/register/customer/` |
| `barber` | yes | `/api/auth/register/barber/` |
| `salon_owner` | yes | `/api/auth/register/salon-owner/` |
| `salon_employee` | **no** | the owner, at `/api/salon/employees/` |
| `admin` | **no** | `manage.py createsuperuser`, or Django admin |

## Authentication API

Base path `/api/`. Every response is JSON. Errors always look like:

```json
{ "detail": "That code is not right.", "code": "otp_invalid", "errors": {} }
```

`errors` carries per-field messages for forms; `code` is what a client should
branch on. `429` responses from the OTP cooldown also carry `retry_after`
(seconds).

### Registration

`POST /api/auth/register/customer/`
`POST /api/auth/register/barber/`
`POST /api/auth/register/salon-owner/`

Public. Shared body: `phone`, `name`, `password`, `accepted_terms`, optional
`email` and `location` (`{area, city, address, latitude, longitude}`).

* customer also takes `gender`, `hair_type`, `hair_length`
* barber also takes `audience` (`men|women|unisex`), `experience_years`,
  `service_ids[]`, optional `business_name`
* owner also takes `business_name`, `business_type` (`salon|barber`),
  `audience`, `address`, optional `business_phone`

**201** creates the account unverified and texts a code. No tokens are issued
— the phone is not proved yet:

```json
{ "verification_required": true, "phone": "+8801712345678",
  "purpose": "registration", "resend_in": 60, "expires_in_minutes": 15,
  "user": { … } }
```

Errors: `400 invalid_phone`, `400 password_invalid`, `400 terms_required`,
`409 phone_taken` (a *verified* account already uses the number; an
abandoned, never-verified one is taken over instead).

### One-time codes

`POST /api/auth/otp/request/` — `{phone, purpose?}`
`POST /api/auth/otp/resend/` — same contract; asking again always retires the
previous code
`POST /api/auth/otp/verify/` — `{phone, code, purpose?}`

Codes are six digits from a cryptographic source, live 15 minutes, are stored
hashed, and only one is live per purpose at a time. A resend is refused inside
the cooldown (`429 otp_cooldown`) and after `OTP_MAX_SENDS_PER_HOUR`
(`429 otp_send_limit`).

Verifying a `registration` code marks the phone verified, activates the
account and returns a **session** — `{access, refresh, user}`. This is also
how an owner-created employee proves their number on first sign-in.

Errors: `400 otp_invalid`, `400 otp_expired`, `400 otp_attempts`,
`400 otp_missing`, `400 already_verified`, `404 account_not_found`.

### Sessions

`POST /api/auth/login/` — `{phone, password}` → `{access, refresh, user}`.
No code: verification happens once, at sign-up. Errors:
`401 invalid_credentials`, `401 account_disabled`, `403 phone_not_verified`
(the client should send them to the OTP screen).

`POST /api/auth/token/refresh/` — `{refresh}` → `{access, refresh}`. Refresh
tokens rotate; the spent one is blacklisted, so a replay gets `401`.

`POST /api/auth/logout/` — `{refresh}`, authenticated → `205`. The token is
blacklisted server-side; dropping it on the client is not enough.

`GET /api/auth/me/` — authenticated → the account, including `role`,
`is_phone_verified` and the role's `profile`. Read-only.

### Passwords

`POST /api/auth/password/forgot/` — `{phone}` → always `200`, whether or not
the number has an account, so this cannot be used to find out who does.

`POST /api/auth/password/verify-otp/` — `{phone, code}` → `{reset_token}`.
Spends the code.

`POST /api/auth/password/reset/` — `{reset_token, password, confirm_password?}`.
The token proves the code was entered a moment ago, so the code is never
replayed. Every existing session is revoked.

`POST /api/auth/password/change/` — authenticated,
`{current_password, new_password, confirm_password?}`. Verifies the current
password, revokes other sessions and returns a fresh pair so the caller stays
signed in.

### The owner's staff

`GET /api/salon/employees/` — owner only; their salons' staff.

`POST /api/salon/employees/` — owner only. `{phone, title?}` plus `name` and
`password` when the number is new.

* an unused number gets a new `salon_employee` account with the password the
  owner sets and passes on; the employee proves the phone on first sign-in
* a number that already belongs to a **barber** is *associated*: the same
  account, role moved to `salon_employee`, barber profile kept
* `409 already_employed`, `409 phone_is_customer`, `409 phone_not_available`

`GET /api/salon/employees/{id}/` — owner only. One chair, with the person's
own trade record (`profile`), whether it keeps its own hours
(`has_own_schedule`), and the services it is named on.

`PATCH /api/salon/employees/{id}/` — owner only.
`{title?, commission_rate?, chair_status?, is_active?}`. The **job**, not the
person: their name, bio, photograph, specialties and experience are theirs and
are refused from this side.

`DELETE /api/salon/employees/{id}/` — owner only. Ends the employment; a
hired barber gets their `barber` role back.

Employees cannot reach any of these — `403`, enforced by permission classes,
not by hiding buttons.

## Profiles API

`GET /api/profile/me/` — the signed-in account's own profile. One envelope for
every role, with the parts that do not apply left `null`:

```json
{
  "role": "salon_employee",
  "account":    {"id": 7, "phone": "+8801755000004", "name": "...", "role": "...", "..."},
  "customer":   null,
  "barber":     {"title": "", "bio": "", "avatar": "", "specialties": [], "gallery": [], "..."},
  "salon":      {"id": 3, "name": "Glow", "..."},
  "employment": {"id": 4, "title": "Stylist", "commission_rate": 40, "..."}
}
```

`PATCH /api/profile/me/` — edits it. **Which serializer validates the body is
chosen from `request.user.role`**, never from anything the caller sends, so a
field a role does not own is not a field it can reach:

| Role | May set |
| --- | --- |
| Customer | `name`, `email`, `avatar`, `gender`, `hair_type`, `hair_length`, `location{area,city,address,latitude,longitude}` |
| Barber / hairstylist | the above minus the hair fields, plus `business_name`, `title`, `bio`, `cover_image`, `audience`, `category_id`, `experience_years`, `specialties`, `contact_phone`, `contact_email`, `instagram`, `facebook`, `tiktok`, `accepting_clients` |
| Salon owner | `name`, `email`, `business_name`, `tagline`, `bio`, `avatar`, `cover_image`, `business_type`, `audience`, `business_phone`, `contact_email`, `amenities`, `women_only`, `private_booth`, `auto_accept`, `location` |
| Salon employee | the barber's list **minus** `business_name`, `audience`, `accepting_clients` and `cover_image` — their salon owns those. `title` writes to their employment. |

Nobody changes their own phone number here: it is the username and the thing an
OTP proved. Nobody marks their own salon `verified` either — `verification` is
read-only over the API and moves only when a reviewer moves it from the admin
site. There is no self-service route into that queue: the app used to open one
by asking for a trade licence number, which was dropped.

`experience_range` is derived from `experience_years` on every save, so the
band customers read can never disagree with the number.

### Pictures

A picture is a **string**: a `data:` URL, an `https` link, or the name of an
icon the app ships. There is no upload endpoint and no media root — see
`Apps/common/images.py` for why, and for the 1 MB ceiling.

`GET/POST /api/profile/me/gallery/` — the caller's own pictures.
`{image, caption?, sort_order?}`. A barber may show **6**; a salon **12**.
`409 gallery_full` past that.

`PATCH/DELETE /api/profile/me/gallery/{id}/` — recaption or remove one. Whose
gallery it is comes from the caller's role, so there is no id to swap for
somebody else's.

## Working hours API

A week is seven days, each shut or open for **one or more stretches** — a salon
that closes for lunch and a stylist who works a morning and an evening are the
same shape, and neither fits a single open/close pair.

`GET /api/schedule/me/` →

```json
{"source": "salon", "editable": true, "days": [
  {"day": "sun", "is_closed": false, "intervals": [{"start": "10:00", "end": "20:00"}]},
  {"day": "fri", "is_closed": true,  "intervals": []}
]}
```

`source` says where the hours came from: `own`, `salon` (an employee working
their salon's), or `default` (a suggested week nobody has saved). `editable`
is the separate question of whether *this* caller may write them.

**An employee reads their week and cannot write it.** `PUT` and `DELETE` on
`/api/schedule/me/` answer a salon employee `403 salon_sets_hours`: a chair
inside a shop cannot be open when the shop is shut, and the person who decides
when the shop is open is the person who owns it. Their chair can still be given
different hours — by their owner, through `/api/schedule/employees/<pk>/`.

**`default` is the one to watch.** A business that has never saved hours is
answered with a real-looking ten-to-eight week so there is something to edit —
but nothing is stored, so the directory reports it shut every day and its
calendar offers no dates. An owner who reads those hours off the screen and
never presses save has a salon customers cannot book. The flag is the only
thing that distinguishes the two, so any screen showing this week must say
when it is only a suggestion.

`PUT /api/schedule/me/` — `{days: [...]}`. Days left out keep what they had;
a day that is sent is rewritten whole. Refused with a specific `code`:

* `interval_backwards` — a stretch that ends before it starts
* `intervals_overlap` — two stretches covering the same minute
* `day_without_hours` — open, but with no times
* `closed_with_intervals` — closed, and with times anyway
* `duplicate_day` — the same day twice

`DELETE /api/schedule/me/` — **employees only**: drops the override so the
chair follows the salon again. A business clearing its own hours would leave
itself with none, so that is `400 cannot_clear_schedule`.

Inheritance is the *absence* of an override, not a copy of one: change the
salon's hours and every chair that never set its own moves with it.

`GET/PUT/DELETE /api/schedule/employees/{id}/` — the same, for an owner
setting one chair's hours. Another salon's chair is `404`.

## Services API

`GET /api/services/categories/` — the headings this account can use: the shared
catalogue (seeded by migration, `is_shared: true`) plus any it invented.

`POST /api/services/categories/` — barber or owner. `{name, icon?, description?}`.
A shared heading belongs to everybody and is not theirs to rename: `404` from
`PATCH`/`DELETE` unless they made it.

`GET /api/services/` — the caller's own price list. What that means is decided
from their role and nothing else:

| Role | Sees | May change |
| --- | --- | --- |
| Barber | their own services | yes |
| Salon owner | their salon's | yes |
| Salon employee | their salon's | **no** — `403` |
| Customer | nothing — `403` | — |

`POST /api/services/`, `PATCH/DELETE /api/services/{id}/` —
`{name, price, duration_minutes, buffer_minutes?, description?, audience?,
includes?, steps?, category_id?, eligible_employee_ids?, is_active?,
is_popular?}`.

* `audience` is `all` (default), `male` or `female` — a barber says it per
  service; a salon inherits the answer from the room.
* `eligible_employee_ids` is how a salon says who may perform it. **An empty
  list is not "nobody" — it is every active chair**, and it keeps meaning that
  as staff join and leave. `available_to_all_staff` reads the same fact back.
* Naming another salon's chair is a `400`; a barber naming any chair is a `400`.
* `includes` is what the client is told; `steps` is the order of work the
  stylist follows — colour, keratin and bridal treatments need both.
* `is_active: false` hides a service from customers without deleting it.

## Directory API

What a customer sees when they look for somewhere to get their hair cut. Two
kinds of listing come out of one shape — a **salon** (a `Salon` row, with
chairs) and an **independent barber or hairstylist** (a `BarberProfile` whose
account works for itself) — told apart by `kind`. Ids are kind-prefixed
(`salon-3`, `barber-9`) so the two tables share one namespace.

Read-only. Everything here is maintained by its owner through
`/api/profile/me/`, `/api/services/` and `/api/schedule/me/`; there is no
write path, so nothing is duplicated.

A listing appears only when the account behind it is **active and phone
verified** — an abandoned sign-up is not a salon anyone can walk into. A salon
**employee never appears**: they are somebody's chair, and their salon is the
listing.

`GET /api/directory/` — signed-in callers. Not open to the world: these rows
carry business phone numbers.

| Query | Effect |
| --- | --- |
| `lat`, `lng` | Distance in kilometres on every row, and what `sort=distance` orders by. Omitted means `distance_km: null`. |
| `q` | Name, tagline, area, category, specialties **and service names**. |
| `type` | `salon` or `barber` — the business type, so a barbershop run as a salon row is a `barber`. |
| `audience` | `men` or `women`. A `unisex` business appears in both. |
| `open_now` | Read from the real week, in the business's timezone. |
| `area` | Exact area match. |
| `sort` | `distance` (default), `price`, `name`. Rows with nothing to sort on go **last** — a salon with no pin is not the nearest, one with no menu is not the cheapest. |
| `limit` | Default 50, capped at 100. `count` is the whole match, not the page. |

```json
{"count": 3, "results": [{
  "id": "salon-1", "kind": "salon", "type": "salon", "name": "Glow Studio",
  "tagline": "...", "audience": "women", "avatar": "...", "cover_image": "...",
  "gallery": [...], "location": {"area": "Dhanmondi", "latitude": 23.74, "...": "..."},
  "distance_km": 0.0, "price_from": 4500.0, "service_count": 1, "staff_count": 3,
  "hours": [{"day": "sun", "is_closed": false, "intervals": [{"start": "10:00", "end": "20:00"}]}],
  "open_now": false, "verified": true, "acceptance": "auto",
  "rating": null, "review_count": 0
}]}
```

**`rating` is `null`, not a number.** Reviews have no backend, so no listing
has been scored. Zero would read as a bad salon; null is the truth, and the
app shows "New here" rather than a star row. `price_from` is null the same way
when a business has not put anything on its menu — which is not "free".

`GET /api/directory/{id}/` — the same record plus `services` (the active menu)
and `staff` (the active chairs). Unknown or malformed ids are `404`.

Each chair carries an `hours` field: **the week that chair actually works**,
with the inheritance already applied — its own hours if it has saved any, the
salon's if it has not. That is the same rule `chair_hours` uses when booking
decides what to offer, and it is reported rather than left to be re-derived
because the two must agree. They are not the same as the salon's `hours`: an
override *replaces* the salon's week rather than narrowing it, so a stylist can
work a day the salon is shut — or work at all at a salon that has never saved
a week. A calendar reading only the salon's `hours` greys out every day such a
stylist is free.

### What it cannot do yet

* **No rating or "top rated" filter**, and no rating sort — see above.
* **No filtering by hairstyle.** The hairstyle catalogue is a frontend
  fixture with no link to a price list, so nothing can honestly match a
  service to a style.
* **No availability.** Opening hours are real; whether a chair is already
  taken at 3pm is not recorded anywhere yet.

## Bookings API

An appointment belongs to a **business** — a salon or an independent barber,
the same two the directory lists — and, at a salon, to one **chair**. Times are
the business's own local times; `starts_at` is the same instant as an aware
datetime, derived on save so it cannot drift from `date` and `start_time`.

### Availability

`GET /api/bookings/availability/?listing=salon-3&date=2026-09-21&service_ids=1,2&employee=4`

A slot survives four questions, asked together: is the business open then (the
real week, stretch by stretch), is there a chair cleared for *every* service in
the basket, is that chair free, and is it still bookable (not in the past, not
inside `BOOKING_LEAD_MINUTES`).

```json
{"date": "2026-09-21", "duration_minutes": 120, "buffer_minutes": 20, "slots": [
  {"time": "09:30", "available": true,  "employee_ids": [4], "reason": ""},
  {"time": "11:00", "available": false, "employee_ids": [], "reason": "taken"}
]}
```

**Unavailable times come back marked, not missing.** A calendar that lists only
what is left cannot tell somebody that four o'clock is *gone*, which is the
thing they most want to know. `employee_ids` says which chairs are free then;
`any` is the normal case and the chair is picked at booking.

Prep time blocks the diary *before* the customer arrives, so a service with
twenty minutes of colour mixing cannot be seated at a ten o'clock opening — but
the grid stays on the quarter hour rather than shifting off it.

### The lifecycle

| Status | Means |
| --- | --- |
| `pending` | Waiting on a business that approves by hand |
| `approved` | Agreed — auto-accept goes straight here |
| `rejected` | Turned down, with a reason the customer is texted |
| `completed` | Done |
| `cancelled` | Called off, with a reason and who did it |
| `rescheduled` | What the **old** row becomes when a new one replaces it |

`POST /api/bookings/` — customers only.
`{listing, date, time, service_ids[], employee?, notes?, reschedule_of?}`.
Double-booking is re-checked **inside the transaction** that writes the row, so
`409 slot_taken` is not a bug: it is two people wanting four o'clock. The bill
is **copied** at booking — repricing a service tomorrow does not reprice what
somebody agreed to today.

`GET /api/bookings/` — role-scoped, with `viewpoint` naming which scope came
back. Filters: `status`, `date`, `upcoming`.

| Role | Sees | May approve / reject / complete |
| --- | --- | --- |
| Customer | their own | no |
| Salon owner | the whole salon | yes |
| Independent barber | their own diary | yes |
| Salon employee | **only bookings assigned to them** | their own only |

`POST /api/bookings/{id}/approve/` and `/reject/` (`{reason}`, required) — both
text the customer, and the response carries `notification: {status, error}` so
the screen can say whether it actually went out.

`POST /api/bookings/{id}/complete/`, `/cancel/` (`{reason}`),
`/reschedule/` (`{date, time, employee?}` → `201` with the **new** booking,
linked by `rescheduled_from_id`; the old row becomes `rescheduled`).

Each record carries a `can` block — `approve`, `reject`, `complete`, `cancel`,
`reschedule`, `call_to_cancel` — worked out for *this* caller, so a screen
never offers a button the API would refuse.

### Cancellation policy

A customer may cancel online up to `cancellation_window_hours` before the
appointment — **2 by default**, and a salon owner or barber can change theirs
through `PATCH /api/profile/me/`. Past the deadline the answer is not "no" but
"ring them":

```json
{"code": "call_to_cancel", "detail": "...",
 "business_name": "Glow Studio", "business_phone": "+8801755009999",
 "cancel_deadline": "2026-09-21T03:00:00Z"}
```

A chair has been set aside for somebody by name; a person who cannot make it
owes the salon a word, and a row quietly flipping to `cancelled` is not that.
The app leads with **Call salon** on both sides of the deadline and only offers
self-service cancellation inside it. A business may cancel at any time.

## Automated phone notifications

Approvals and rejections go out through the **same SMS abstraction the one-time
codes use** — `SMS_PROVIDER`, credentials from the environment, nothing about
delivery known here. See `Apps/bookings/notifications.py`.

An approval text carries the business, the service, the stylist, the price and
the time; a rejection carries the reason the salon gave, verbatim, and the
number to call for another time.

Every attempt is written down as an `AppointmentNotification` — `pending`,
`sent` or `failed`, with the provider that handled it and, on failure, why.
**A failed message never undoes the decision:** an approval is a fact about the
appointment, and a gateway being down does not change it. The API answers `200`
with `notification.status = "failed"` so the salon knows to ring instead.

Delivery is only as real as the configured provider. With `SMS_PROVIDER=console`
these texts go to the server log, not to a phone.

## Live booking updates

```
ws://localhost:8000/ws/bookings/
```

One socket per signed-in account, carrying booking events as they happen. It is
an **addition to** the REST API, never a replacement: nothing is decided here
and nothing is asked for here. A client that misses every event and re-reads
`/api/bookings/` is never wrong, only later — which is why every recovery path
ends in a re-read rather than in a guess about what was missed.

**Authenticating.** A browser cannot put an `Authorization` header on a
WebSocket, so the access token travels in the handshake's subprotocol —
`new WebSocket(url, ['bearer', accessToken])` — and is handed to the same
simplejwt backend the REST API uses. `?token=` is accepted too, for clients
that cannot set a subprotocol, but a URL ends up in every access log it passes
through and an access token in a log file is a live credential. A bad token is
refused with close code **4401**, so a client can tell "refresh and reconnect"
from "the network dropped, retry as you are". The handshake is also origin-
checked — against `ALLOWED_HOSTS` in development and `CORS_ALLOWED_ORIGINS`
otherwise (`core/asgi.py`). Two validators, because channels' `OriginValidator`
matches exact strings and cannot see the private-range regexes that widen CORS
locally; pointing the dev one at `ALLOWED_HOSTS`, which already knows this
machine's LAN address, is what stops the socket refusing a phone the REST API
had just answered.

**Who hears what.** Groups are one per *account* — never per salon and never
per chair, because an employee who is promoted, a barber who also rents a chair
somewhere, or an owner with two salons each make a room-shaped group either
leak or miss. When a booking changes, its plausible audience (the customer, the
salon's owner, the barber whose diary it is, the chair it was given to) is put
back through `access.scoped` and kept only if the row comes back. **A broadcast
therefore cannot reach anyone the API would answer with a 404**, and there is
no second copy of the permission rules to drift out of step with the first.

**What arrives.** The same `AppointmentSerializer` the REST endpoints return,
rendered once *per recipient* — because `can` is a statement about the reader,
and one shared message could only be right for one of them.

```json
{ "type": "booking", "event": "created", "booking": { ... } }
```

`created` is a booking that did not exist before. `updated` is that same row in
a new state — approved, rejected, cancelled, completed, or marked `rescheduled`
because a new booking replaced it. A move sends two events: the slot given back
and the slot taken.

Events are published on `transaction.on_commit`, so a booking that loses the
race for a slot is never announced as made, and **publishing never raises** — a
channel layer that is down must not take an approval with it, the same rule the
SMS notifications follow. The row is written either way and the dashboards
catch up on their next read.

`{"type":"ping"}` is answered with `{"type":"pong"}`; a socket through an idle
proxy can be dead for minutes before the browser notices.

**Fanning out between processes.** `CHANNEL_LAYERS` defaults to the in-memory
layer, which is real but process-local: one `runserver` is fine, two workers
behind a load balancer would each only reach the dashboards connected to them.
Set `REDIS_URL` (and install `channels-redis`) for anything beyond a single
process.

## Portfolios

There is no portfolio endpoint. The Salon Portfolio, a barber's profile and an
employee's profile are each assembled from endpoints that already exist:

| Screen needs | Comes from |
|---|---|
| identity, contact, bio, cover, location, amenities | `GET /api/profile/me/` |
| the menu, with price, duration and who may perform each | `GET /api/services/` |
| the roster, each chair with their own trade record | `GET /api/salon/employees/` |
| the week, and whose week it is | `GET /api/schedule/me/` |
| pictures | `/api/profile/me/gallery/` |

Splitting it this way is deliberate: each part is written by a different screen
and changes on its own schedule, and an aggregate would be re-fetched whole
every time one picture moved.

**Whose portfolio a caller is reading is decided by their role, never by a
parameter.** `/api/profile/me/` answers an owner with their salon and a barber
or employee with their own `BarberProfile`; `gallery_owner` picks the salon's
pictures for an owner and the person's for everybody else. That line matters
beyond tidiness: a stylist's gallery is her own trade record and goes with her
when she leaves, while the shop's pictures stay with the shop.

An employee reads their salon's whole menu — they need to know what they may be
asked to do — and `eligible_employee_ids` with `available_to_all_staff` is how
they tell which of it is theirs. They cannot write to it; the salon prices its
own work.

Ratings and reviews are **not** part of any of this. Nothing has been scored,
so `rating` is null and `review_count` is 0 everywhere; the screens say "New
here" rather than showing a star row nobody earned.

`Apps/portfolio/tests/test_portfolio_contract.py` pins the fields each screen
leans on, and that the salon's portfolio and a person's never leak into each
other.

## Security notes

* Passwords: Django's hasher and one `AUTH_PASSWORD_VALIDATORS` policy for
  every role, applied at registration, reset and change alike.
* OTPs: hashed at rest, single-use, 15-minute life, capped guesses, capped
  sends, invalidated on resend. Never logged, never returned by the API.
* JWT: short access token, rotating refresh with blacklist-after-rotation.
  The payload carries the user id and role, nothing else.
* Throttling: separate budgets for login, registration, OTP and reset.
* Secrets come from the environment. See `.env.example`.
* Scoping: every list is filtered by the caller before it is read, and every
  detail view is looked up *with* the ownership filter — so another salon's
  chair, service or picture is a `404`, not a `403` that confirms it exists.
  The live socket obeys the same filter rather than a copy of it: a recipient
  is kept only if `access.scoped` still returns the row for them.
* Pictures are validated as data URLs, `https` links or icon names, and capped
  at 1 MB, so nothing here becomes a path that gets dereferenced.
* No trade licence numbers are asked for or stored. A number typed into a box
  was never a check, and holding somebody's licence for no purpose is a cost
  with no benefit. `verification` remains, set by a reviewer from the admin
  site; there is no self-service route into that queue.
