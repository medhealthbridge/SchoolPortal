# SchoolPortal

One multi-tenant school platform, built from `School System Master Plan`.

Each school gets its own subdomain, a shared core (students, roles, billing)
and modules it can switch on one at a time. Attendance ships first and works
with no signal; every other module plugs into the same student record.

## What is built

All eight roadmap phases are implemented and running. Every module is a page a
school can switch on, and they talk to each other only through the event queue:

| Phase | Builds | State |
| --- | --- | --- |
| 0. Foundation | Tenancy, subdomains, login, roles, platform admin, suspend switch, audit log | Done |
| 1. Front door | Public site, onboarding wizard, student-ID signup, CSV imports | Done |
| 2. Attendance | Timetable, seat map, offline sync, late and excused, monthly report | Done |
| 3. Platform billing | Tiers, monthly student count, invoices, manual payment, past-due | Done |
| 4. Portal | Announcements, a parent's child page, a student's own page, notifications | Done |
| 5. Grades | Grading periods, score entry by class, report card, teaching load | Done |
| 6. Student Life | Discipline, Guidance, SAO, Chaplain — cases, sanctions, clubs, service hours | Done |
| 7. Operations | Registrar with clearance, school fees and payments, analytics | Done |

### What the modules do to each other

Nothing is read across module tables; every link below is an event one module
emits and another listens to (`src/lib/events.ts`).

| When this happens | This follows |
| --- | --- |
| A student is marked absent | The guardian gets an SMS and a portal notification |
| Three absences in a row | Guidance opens a case, titled with the streak, once |
| A student is marked late | Discipline records it against the school's offence levels |
| A suspension starts | Attendance is written excused for each school day of it |
| A second case on one student | Guidance opens a case, idempotent on the title |
| A grading period closes | Every guardian is notified their child's card is ready |
| A failing score is entered | Guidance is notified, with the subject |
| A student is enrolled | The school's standing fees are charged to them |
| A balance changes | Registrar re-checks its holds; the guardian gets the notice |

A clearance ask (`src/modules/registrar/clearance.ts`) only asks the modules a
school has switched on, and reports back which ones it checked — so an empty
answer is never mistaken for a clean one.

## Running it

Postgres 16 and Node 22.

```bash
cp .env.example .env.local        # then edit DATABASE_URL if you are not on localhost
npm install
# If Postgres is not running yet: sudo pg_ctlcluster 16 main start
npm run db:push                   # creates the tables, the app_user role and the RLS policies
npm run db:seed                   # two demo schools, every module filled, prints the logins
npm run dev
```

`lvh.me` resolves to 127.0.0.1 with every subdomain, so no hosts file is needed:

- `http://lvh.me:3000` — the public site and "Register your school"
- `http://admin.lvh.me:3000` — the platform admin (email, password, TOTP)
- `http://stmary.lvh.me:3000` — a demo school, All-in tier, active
- `http://northgate.lvh.me:3000` — a demo school that is suspended

`npm run db:seed` prints every credential, including the platform admin's TOTP
secret and its current code.

```bash
npm test          # 52 tests, including the cross-tenant isolation gate
npm run typecheck
npm run build
```

## The look of it

The interface follows one system, written down as a repo skill at
`.claude/skills/schoolportal-ui/` so that every later change lands in the same
language. Load it before touching anything under `src/app` or
`src/components`; `reference/tokens.md` has every value and
`reference/components.md` the kit.

In short: **neutral greys, white cards on a near-white ground, one near-black
for every primary action, and colour kept for the four attendance marks.** If
a screen looks colourful, something is wrong — the only saturated things on a
page should be the marks a teacher made.

- **Type** is Geist, one family, 400 to 700, with tabular figures everywhere.
- **Surfaces** are white cards, 14px radius, a 1px `#E5E5E5` line and a soft
  two-stop shadow, on a `#FAFAFA` ground. Controls are 8px.
- **Marks** each have a soft form (a tinted chip on the seat map) and a solid
  form (the chosen segment in the P/A/L/E control). Present is the quietest of
  the four, so a room full of present students lets the exceptions carry the
  eye, and every mark shows its letter as well as its colour.
- **44px is the floor** for anything a finger touches, 48px for the primary
  action at the bottom of a phone screen.
- **Two shells**: a 240px sidebar with a breadcrumb header from `lg` up, and a
  fixed bottom tab bar below it. Teachers work on a phone and office staff on
  a desktop, so neither is the afterthought.
- Light only. There is no dark mode, by decision.

**Responsive**: `npm run responsive` loads twenty-four screens at 320, 360,
390, 414, 768, 1024 and 1440 px, each signed in as the office that owns it, and fails on any horizontal page scroll. The seat
grid is the one thing that scrolls sideways on a phone — it keeps the room's
shape instead of squeezing the names out, and a list view is one tap away.

## How a request is served

```
browser → middleware (subdomain → /site, /admin or /s)
        → requireSchool()    school exists, and is not suspended
        → requireUser()      a live session for THIS school
        → requireModule()    the module is switched on for this school
        → can(roles, perm)   the role may do this
        → withTenant(id)     the query runs with app.school_id set
```

Every layer is server-side. `src/lib/guard.ts` holds the page flavour
(`requirePermission`, which 404s) and the API flavour (`apiRequirePermission`,
which throws a status), and both run the same four checks.

### Tenancy

One database, `school_id` on every row, row-level security filtering on
`current_setting('app.school_id')`. The application connects as `app_user`,
which is not the table owner and has `NOBYPASSRLS`, so a query that forgets its
`where school_id = …` still returns nothing. `tests/isolation.test.ts` is the
release gate the plan asks for: it logs in as school A and tries to read, write
and update school B.

RLS is a net, not the only guard. Where the database cannot help — a foreign
key is checked below row security, so a well-formed tap carrying another
school's student id would otherwise attach to a row this school owns —
the roster of the class is checked in `submitAttendance` and the tap is
rejected.

### Suspension

`schools.status` is one field. Middleware cannot read it (it runs on the edge),
so `requireSchool()` does, on every page and every API route: an already-open
session stops at its next request. Nothing is deleted, alerts and scheduled
jobs pause, the school admin keeps the billing page, and taps still queued on a
teacher's phone upload after reactivation.

### Offline attendance

`public/sw.js` caches the app shell and this morning's download.
`src/lib/offline.ts` is a ~140-line IndexedDB with two stores: `queue` (taps
not yet uploaded) and `cache` (today's timetable and class lists). Each tap
carries an id generated on the phone, so `POST /api/attendance/sync` can be
replayed for free — an id the server already has is ignored. When two people
mark the same student in the same class on the same day, the later `markedAt`
wins and the earlier value stays in the audit log.

### Modules and events

A module declares its key, tables, events emitted and events listened to
(`src/lib/modules.ts`). A `school_modules` row switches it on per school, and
the menu, the pages and the API all check it. Modules never read each other's
tables: Attendance emits `student.marked_late` and does not know whether
Discipline exists. `processEvents()` is the only listener dispatch, and it
reads which modules are on before it acts.

## Decisions taken

The plan's "Open decisions" needed answers to build against. These are the
assumptions in the code, each in one place and easy to change:

| Decision | Taken as | Where |
| --- | --- | --- |
| ₱100,000 platform fee | Yearly, capped, invoiced monthly as a twelfth | `src/lib/pricing.ts` |
| ₱20 per student | Same on every tier, 12 months | `PER_STUDENT_CENTAVOS` |
| "Pick a domain" | The school's subdomain | `src/lib/tenant.ts` |
| Second proof at signup | Activation code, never the birthdate | `src/app/s/signup/actions.ts` |
| Postgres | Plain Postgres via Drizzle; Neon or Supabase both fit with no code change | `src/db/index.ts` |
| Brand colours | Fixed defaults per school, stored on the row and overridable | `schools.primary_color` |
| Trial | 30 days, no card | `src/app/site/register/actions.ts` |
| Passing mark | 75 of 100, as Philippine schools report it | `src/modules/grades/queries.ts` |
| School fees | Charged on enrolment, paid at the cashier by hand | `src/modules/billing/queries.ts` |

The plan's own note holds: at 1,500 students the per-student fee is ₱360,000 of
a ₱460,000 year, and a 300-student Starter school pays ₱240 per student per
year for attendance alone. Lowering `perStudentCentavos` per tier is a one-line
change — the column is already per subscription.

## Not built, deliberately

- A real mail provider and SMS gateway. `src/lib/messaging.ts` is the single
  seam; everything it is handed lands in `outbound_messages` and shows on the
  admin Outbox.
- A payment gateway. Payments are recorded by hand, as the plan asks.
- Object storage for logos and photos.
- A scheduled runner. `issueInvoices()`, `markPastDue()` and `processEvents()`
  are plain functions; the admin screen has a "Run billing" button, and a cron
  or Vercel scheduled function calls the same three.
- The data processing agreement, privacy notice and consent wording, which the
  plan rightly sends to a Philippine privacy lawyer.

## Layout

```
src/
  app/
    site/        yourapp.com          public site, registration wizard
    admin/       admin.yourapp.com    platform admin: schools, invoices, outbox
    s/           school.yourapp.com   login, signup, on-hold, and (app)/ behind auth
  components/    the shared UI kit
  db/            schema, RLS, migrate, seed
  lib/           guard, session, roles, modules, pricing, invoicing, events, offline
  modules/
    attendance/  queries and submit — the first module, and the shape of the rest
    grades/      periods, class scores, the report card, a teacher's load
    billing/     balances, ledger, who owes the cashier
    registrar/   the clearance check, which asks each module that is on
    community/   one screen and one action set, shared by SAO and Chaplain
tests/           isolation, attendance, billing, pricing, units, modules
```
