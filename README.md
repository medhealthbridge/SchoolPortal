# SchoolPortal

One multi-tenant school platform, built from `School System Master Plan`.

Each school gets its own subdomain, a shared core (students, roles, billing)
and modules it can switch on one at a time. Attendance ships first and works
with no signal; every other module plugs into the same student record.

## What is built

The plan's roadmap has eight phases. Phases 0–3 — the sellable product — are
implemented and running:

| Phase | Builds | State |
| --- | --- | --- |
| 0. Foundation | Tenancy, subdomains, login, roles, platform admin, suspend switch, audit log | Done |
| 1. Front door | Public site, onboarding wizard, student-ID signup, CSV imports | Done |
| 2. Attendance | Timetable, seat map, offline sync, late and excused, monthly report | Done |
| 3. Platform billing | Tiers, monthly student count, invoices, manual payment, past-due | Done |
| 4–7. Portal, Grades, Student Life, Operations | — | Declared in the module registry, not built |

Modules 4–7 exist in `src/lib/modules.ts` with their tables, events and prices,
and the Portal's absence alert is wired through the event queue, so the seams
they plug into are real rather than planned. Their screens are not written.

## Running it

Postgres 16 and Node 22.

```bash
cp .env.example .env.local        # then edit DATABASE_URL if you are not on localhost
npm install
npm run db:push                   # creates the tables, the app_user role and the RLS policies
npm run db:seed                   # two demo schools + the platform admin, prints the logins
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
npm test          # 39 tests, including the cross-tenant isolation gate
npm run typecheck
npm run build
```

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
    attendance/  queries and submit — the first module, and the shape of the next
tests/           isolation, attendance, billing, pricing, units
```
