# How SchoolPortal is put together

For whoever changes the code. If you deploy it, read
[OPERATIONS.md](OPERATIONS.md); if you use it, read [MANUAL.md](MANUAL.md).

---

## The shape of it

Next.js 15 App Router, React 19, TypeScript, Tailwind v4, Drizzle over plain
Postgres. One database, one deployment, every school a subdomain.

```
src/
  app/
    site/        yourapp.com          public site, registration wizard
    admin/       admin.yourapp.com    platform admin
    s/           school.yourapp.com   login, signup, on-hold, (app)/ behind auth
    api/cron     the scheduled runner      — not rewritten by middleware
    api/payments the provider's webhook    — not rewritten by middleware
    uploads/     locally stored files      — not rewritten by middleware
  components/    the shared UI kit and the two shells
  db/            schema, rls, migrate, seed
  lib/           guard, session, roles, modules, pricing, invoicing, events,
                 offline, throttle, config, delivery, scheduled, storage,
                 payments
  modules/       one folder per module: its queries and its actions
drizzle/         versioned migrations
tests/           isolation, attendance, billing, pricing, units, modules,
                 hardening, storage, payments
```

---

## How a request is served

```
browser → middleware (subdomain → /site, /admin or /s)
        → requireSchool()    the school exists, and is not suspended
        → requireUser()      a live session for THIS school
        → requireModule()    the module is switched on for this school
        → can(roles, perm)   the role may do this
        → withTenant(id)     the query runs with app.school_id set
```

Every layer is server-side. `src/lib/guard.ts` holds the page flavour
(`requirePermission`, which 404s) and the API flavour
(`apiRequirePermission`, which throws a status). Both run the same four checks.

The guard **404s rather than 403s**. Saying "forbidden" confirms the page
exists.

---

## Tenancy

This is the part to understand before changing anything.

**Row-level security is the floor.** Every tenant table carries `school_id` and
a policy filtering on `current_setting('app.school_id')`. The app connects as
`app_user`, which is not the table owner and has `NOBYPASSRLS`, so a query that
forgets its `where school_id = …` returns nothing rather than another school's
rows. `FORCE ROW LEVEL SECURITY` is on, so the policy applies to the owner of
the rows too.

Three wrappers, in `src/db/index.ts`:

| Wrapper | Sets | Use for |
| --- | --- | --- |
| `withTenant(schoolId, fn)` | `app.school_id` | Everything inside one school |
| `withPlatform(fn)` | `app.platform = on` | The platform admin, and cross-school jobs |
| `db` directly | nothing | Only tables with no RLS: `sessions`, `platform_admins`, `email_verifications`, `auth_throttle`, `schools` |

> **A plain `db` read of a tenant table returns nothing and raises no error.**
> This has bitten this codebase twice. The admin Invoices and Outbox pages
> once showed 0 of 6 and 1 of 11 rows, silently, because they used `db`
> instead of `withPlatform`. `tests/hardening.test.ts` now walks
> `src/app/admin` and fails if any file selects a tenant table through `db`.

**RLS is a net, not the only guard.** A foreign key is checked *below* row
security, so a well-formed request carrying another school's student id would
otherwise attach to a row this school owns. `submitAttendance` checks the
class roster and rejects the tap. Where the database cannot help, the
application must.

**A student id in a URL is a guess anyone can make.** `canSeeStudent()` in
`src/lib/student-access.ts` gates the portal pages on the viewer's own children
or their office's remit. RLS keeps schools apart, not people within one.

---

## Modules and the event queue

A module declares its key, the tables it owns, the events it emits and the
events it listens to, in `src/lib/modules.ts`. A `school_modules` row switches
it on per school, and the menu, the pages and the API all check it.

**Modules never read each other's tables.** Core's tables are readable by
every module; a module's own are not. The only seam is an event.

```
Attendance  emits student.marked_late   →  Discipline listens
            emits student.absence_streak →  Guidance listens
Discipline  emits discipline.suspension_started → Attendance listens
Grades      emits grade.period_closed   →  Portal listens
Billing     emits billing.balance_changed → Portal, Registrar listen
```

`processEvents()` in `src/lib/events.ts` is the only listener dispatch. It
reads which modules are on before it acts, so a module that is switched off
simply has no listener and nothing breaks. A suspended school short-circuits.

Events are rows, processed in a transaction with the work they trigger, so a
crash leaves them pending rather than half-applied. The scheduled runner picks
up anything a failed request left behind.

**Adding a module:** declare it in `modules.ts`, add its tables to
`TENANT_TABLES` in `src/db/rls.ts`, add its permissions to `roles.ts` and map
them in `PERMISSION_MODULE`, then build its pages under `src/app/s/(app)/`.
Use an event rather than reading another module's tables, however convenient
that looks.

---

## Offline attendance

`public/sw.js` caches the app shell and this morning's download.
`src/lib/offline.ts` is a small IndexedDB with two stores: `queue` (taps not
yet uploaded) and `cache` (today's timetable and class lists).

Each tap carries an **id generated on the phone**, so
`POST /api/attendance/sync` can be replayed for free — an id the server
already has is ignored. When two people mark the same student in the same
class on the same day, the later `markedAt` wins and the earlier value stays
in the audit log.

This is why attendance survives a dead signal, a locked phone and a closed
browser.

---

## Server actions and the subdomain rewrite

Every school page is served through a middleware rewrite, which makes a
relative `redirect()` from a server action render the wrong tree. Actions
therefore **return `{ goTo }` and the client calls `window.location.assign()`**
(`src/lib/nav.ts`). An absolute URL does not fix it; returning the
destination does.

---

## Known traps

Each of these cost real debugging time. They are documented because they will
recur.

**Drizzle does not qualify a column inside a raw `sql` subquery when the outer
select has no join.** `${clubs.id}` renders as a bare `"id"`, which binds to
the subquery's own table — `m.club_id = m.id` — and counts zero with no error.
Use a join and a `groupBy` instead of a correlated subquery. A select that
*does* have a join is qualified correctly, which is why the identical shape in
billing was fine.

**Postgres counts NULLs as distinct in a unique constraint.** `fee_items` has a
nullable `level` meaning "every level", so the upsert's conflict target never
matched and saving the same fee twice made two rows that each charged every
student. The constraint is `UNIQUE NULLS NOT DISTINCT`.

**An unlayered CSS rule beats every layered one.** A bare `a { color }` in
`globals.css` overrode `text-…` on every link button and made primary buttons
invisible. The base element rules live in `@layer base` for that reason.

**The cascade resolves per property.** Tailwind ships its own absolutely
positioned `.sr-only`; overriding it requires *declaring* `position: static`,
not merely omitting it. An absolutely positioned `.sr-only` inside a
horizontally scrolled table escapes the scrollport and drags the whole page
sideways.

**Middleware exclusions are named one at a time.** Excluding `/api/` wholesale
breaks offline attendance: a school's own API lives at `/api/attendance/…`
and relies on the rewrite into `/s`. Only `api/cron`, `api/payments` and
`uploads/` skip it.

**`deliver()` writes a tenant row.** Call it inside a tenant transaction or
pass `tx`, or RLS rejects the insert.

---

## The interface

One system, written down as a repo skill at `.claude/skills/schoolportal-ui/`.
Load it before touching anything under `src/app` or `src/components`;
`reference/tokens.md` has every value and `reference/components.md` the kit.

In short: **neutral greys, white cards on a near-white ground, one near-black
for every primary action, and colour kept for the four attendance marks.** If
a screen looks colourful, something is wrong.

- 44px is the floor for anything a finger touches, 48px for the primary action
  at the bottom of a phone screen.
- Every attendance mark shows its letter as well as its colour.
- Two shells: a 240px sidebar from `lg` up, a fixed bottom tab bar below it.
  Tab labels use `short` where the full label would truncate.
- Light only, by decision. No dark mode.

---

## Testing

```bash
npm test     # 108 tests against a real Postgres, single fork
```

| File | Holds |
| --- | --- |
| `isolation.test.ts` | **The release gate.** Signs in as school A and tries to read, write and update school B. |
| `attendance.test.ts` | Offline replay, the one-alert-per-day rule, cross-tenant roster rejection |
| `modules.test.ts` | Grade maths, the 74/75 boundary, balances, clearance, the cross-module events, the SAO counts, the duplicate-fee guard |
| `billing.test.ts` | Invoicing, past due, suspension |
| `payments.test.ts` | Checkout, webhook signatures, idempotent recording |
| `hardening.test.ts` | Throttling, the boot check, the cron guard, delivery, and the `db`-vs-`withPlatform` scan |
| `storage.test.ts` | Upload validation by magic bytes, path traversal, SigV4 |
| `pricing.test.ts`, `units.test.ts` | Pure functions |

Tests run against a real database rather than a mock, because what is being
tested is mostly what Postgres does — policies, constraints, transactions.

---

## Decisions already taken

Each lives in one place and is easy to change.

| Decision | Taken as | Where |
| --- | --- | --- |
| ₱100,000 platform fee | Yearly, capped, invoiced monthly as a twelfth | `src/lib/pricing.ts` |
| ₱20 per student | Same on every tier, 12 months | `PER_STUDENT_CENTAVOS` |
| "Pick a domain" | The school's subdomain | `src/lib/tenant.ts` |
| Second proof at signup | An activation code, never the birthdate | `src/app/s/signup/actions.ts` |
| Passing mark | 75 of 100 | `src/modules/grades/queries.ts` |
| School fees | Charged on enrolment, paid at the cashier by hand | `src/modules/billing/` |
| Brand colours | Per school, on the row, used only on the badge | `schools.primary_color` |
| Trial | 30 days, no card | `src/app/site/register/actions.ts` |
