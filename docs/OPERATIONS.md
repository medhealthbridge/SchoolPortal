# Running SchoolPortal

For whoever deploys and keeps it running. If you use the system instead, read
[MANUAL.md](MANUAL.md); if you are changing the code, read
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## Contents

- [What it needs](#what-it-needs)
- [Local setup](#local-setup)
- [Configuration](#configuration)
- [Deploying](#deploying)
- [DNS](#dns)
- [The database](#the-database)
- [The scheduled runner](#the-scheduled-runner)
- [Mail and SMS](#mail-and-sms)
- [Uploaded files](#uploaded-files)
- [Taking payment online](#taking-payment-online)
- [The platform admin](#the-platform-admin)
- [Suspending a school](#suspending-a-school)
- [Backups](#backups)
- [Verifying a change](#verifying-a-change)
- [Troubleshooting](#troubleshooting)

---

## What it needs

- **Node 22**
- **Postgres 16** — any host. Neon, Supabase and RDS all work with no code
  change; the app uses plain Postgres through Drizzle.
- A wildcard DNS record and a wildcard TLS certificate.
- Optionally: an SMTP/HTTP mail provider, an SMS gateway, an S3-compatible
  bucket, a payment provider. Each is independent; the app runs without any of
  them and says what it is missing.

---

## Local setup

```bash
cp .env.example .env.local          # edit DATABASE_URL if not on localhost
npm install
sudo pg_ctlcluster 16 main start    # if Postgres is not already running
npm run db:migrate                  # tables, the app_user role, RLS policies
npm run db:seed                     # two demo schools; prints every login
npm run dev
```

`lvh.me` resolves to 127.0.0.1 on every subdomain, so no hosts file is needed:

| URL | What |
| --- | --- |
| `http://lvh.me:3000` | Public site and "Register your school" |
| `http://admin.lvh.me:3000` | Platform admin (email, password, TOTP) |
| `http://stmary.lvh.me:3000` | A demo school, All-in tier, active |
| `http://northgate.lvh.me:3000` | A demo school that is suspended |

`npm run db:seed` prints every credential, including the platform admin's TOTP
secret and the code valid at that moment.

### Every command

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | The full suite against a real Postgres |
| `npm run db:generate` | Writes `drizzle/NNNN_*.sql` from a schema change |
| `npm run db:migrate` | Applies migrations, grants and RLS |
| `npm run db:seed` | Demo data |
| `npm run db:reset` | Drops the public schema — destroys everything |
| `npm run responsive` | 27 screens × 7 widths, fails on horizontal scroll |
| `npm run smoke` | End-to-end against a running dev server |

---

## Configuration

`.env.example` is the reference and every variable is commented there. The
ones that matter most:

| Variable | Required | Why |
| --- | --- | --- |
| `DATABASE_URL` | yes | The **owner** connection. Migrations and tests only. |
| `APP_DATABASE_URL` | yes | **`app_user`**, which is `NOBYPASSRLS` and not the table owner. This is what the running app uses. |
| `APP_USER_PASSWORD` | on a remote database | The password `db:migrate` gives `app_user`. Must match `APP_DATABASE_URL`. |
| `ROOT_DOMAIN` | yes | The domain schools get a subdomain of. No scheme. |
| `NEXT_PUBLIC_ROOT_DOMAIN` | yes | The same value, for the browser. |
| `PLATFORM_ADMIN_EMAIL` / `_PASSWORD` | on first seed | Seeds the platform admin. |
| `ALLOW_LOCAL_UPLOADS` | unless S3 is set | Acknowledges that uploads go to local disk. |
| `CRON_SECRET` | for the runner | Without it the endpoint refuses every caller. |

### The boot check

`src/lib/config.ts` runs once at startup, from `instrumentation.ts`. **In
production an unsafe configuration stops the process**; in development it
prints a warning, because a half-configured laptop is normal.

It refuses to start when:

- `APP_DATABASE_URL` is missing, **or is the same as `DATABASE_URL`**. This is
  the one that matters. The owner connection bypasses row-level security, so
  getting this wrong means one school can read another's students — with
  nothing failing and nothing logged.
- `ROOT_DOMAIN` is unset, so every link a school sends points at `lvh.me:3000`.
- `PLATFORM_ADMIN_PASSWORD` is the example value or under 12 characters. That
  account reaches every school.
- `APP_USER_PASSWORD` is unset, default, or under 16 characters. That role
  reaches every school's rows, and on a managed Postgres its endpoint is
  reachable from the internet.
- A provider is half-configured — a key with no URL would send nothing.
- Uploads would go to local disk without `ALLOW_LOCAL_UPLOADS=yes`.

---

## Deploying

Any Node host. Nothing is specific to one platform except `vercel.json`, which
only declares the cron schedule.

```bash
npm ci
npm run db:migrate      # safe to run on every deploy; it is idempotent
npm run build
npm start
```

Run `db:migrate` **before** the new code starts serving.

---

## DNS

Every school is a subdomain, so you need:

```
*.yourapp.com    A/CNAME → your host
yourapp.com      A/CNAME → your host
```

and a **wildcard TLS certificate** for `*.yourapp.com`. The reserved names are
`admin` (the platform admin) and `www` (treated as the root).

The subdomain is resolved in middleware, which runs on the edge and does not
touch the database. The school's *status* is checked server-side on every page
and API route, so a suspension takes effect on the very next request even for a
session that is already open.

---

## The database

### Two roles, on purpose

The schema's owner creates tables and writes policies. The app connects as
`app_user`, which **is not the owner and has `NOBYPASSRLS`**. Row-level
security on every tenant table filters on `current_setting('app.school_id')`,
so a query that forgets its `where school_id = …` returns nothing rather than
another school's rows.

`npm run db:migrate` creates the role, grants it what it needs, and applies
every policy. It re-applies policies each run, so a table added by a migration
gets its policy without a second step.

### Managed Postgres (Neon, Supabase, RDS)

Nothing in the code is specific to one host, but the two-role requirement
needs a moment's setup.

1. **Use the direct endpoint for migrations and the pooled one for the app.**
   On Neon the pooled host has `-pooler` in it. Migrations issue DDL and
   should not go through a connection pooler; the app should.
2. **Set `APP_USER_PASSWORD`** to something long before the first migrate. The
   migration creates `app_user` with it, and `assertConfig` refuses to start
   production while it is unset or default.
3. **Run `npm run db:migrate` with `DATABASE_URL` pointed at the direct
   endpoint.** It creates the role, grants it, and applies every policy. The
   owner role needs permission to create a role — Neon's default owner has it
   through `neon_superuser`; on RDS, grant `CREATEROLE`.
4. **Point `APP_DATABASE_URL` at the pooled endpoint as `app_user`**, keeping
   the rest of the host string and `?sslmode=require`.

```bash
DATABASE_URL=postgres://neondb_owner:…@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
APP_DATABASE_URL=postgres://app_user:$APP_USER_PASSWORD@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
APP_USER_PASSWORD=…
```

The driver is already configured with `prepare: false`, which is what a
transaction-pooling proxy such as PgBouncer requires. The tenant context is
set with `set_config(..., true)` — transaction-scoped — so it is safe under
transaction pooling.

**Check it took.** The isolation test is the proof, and it runs against
whatever `DATABASE_URL` points at:

```bash
npx vitest run tests/isolation.test.ts
```

If `app_user` were accidentally the owner, or had `BYPASSRLS`, that test fails.

**On Neon's free tier the compute suspends when idle**, so the first request
after a pause waits a few seconds while it wakes. That is the endpoint, not
the app.

### Migrations

```bash
# after changing src/db/schema.ts
npm run db:generate     # writes drizzle/NNNN_name.sql
# READ the SQL it wrote, then commit it
npm run db:migrate
```

`drizzle/` is the record of what has been applied. Do not use `drizzle-kit
push` against anything but a scratch database: it diffs the live schema and
prompts before anything that could lose data, which needs a terminal and is not
a deployment step.

---

## The scheduled runner

One endpoint runs everything that happens on a timer:

```bash
curl -X POST https://yourapp.com/api/cron/run \
     -H "Authorization: Bearer $CRON_SECRET"
```

It issues invoices, marks overdue schools past due, processes the event queue
for every school, and clears expired throttle rows. It answers with a report:

```json
{"ranAt":"…","invoicesIssued":0,"schoolsPastDue":0,"eventsProcessed":0,"schoolsSkipped":1,"errors":[]}
```

- **Every job in it is safe to repeat**, so a double fire costs nothing.
- Without `CRON_SECRET` set, or with the wrong one, it answers **404** — a
  caller learns nothing about which. The comparison is constant-time.
- A suspended school is skipped and counted.
- Middleware does not rewrite `/api/cron`, so it answers on any host.

`vercel.json` schedules it monthly at 02:00 for billing and nightly at 03:00
for the queue. Any cron that can make an HTTP request does the same job.

---

## Mail and SMS

Four environment variables describe a provider, and the template names that
provider's own fields:

```bash
EMAIL_API_URL=https://api.resend.com/emails
EMAIL_API_KEY=…
EMAIL_FROM="SchoolPortal <no-reply@yourapp.com>"
EMAIL_BODY_TEMPLATE={"from":"{{from}}","to":["{{to}}"],"subject":"{{subject}}","text":"{{body}}"}

SMS_API_URL=https://api.semaphore.co/api/v4/messages
SMS_API_KEY=…
SMS_FROM=SCHOOLPORTAL
SMS_BODY_TEMPLATE={"apikey":"{{key}}","number":"{{to}}","message":"{{body}}","sendername":"{{from}}"}
```

`{{to}}`, `{{subject}}`, `{{body}}`, `{{from}}` and `{{key}}` are filled in and
JSON-escaped. Semaphore, Movider, Twilio, Resend and Postmark all fit, and
switching provider is an env change rather than a deploy.

**Every message is written down before it is sent**, so the record survives a
failure. The platform admin's **Outbox** shows each one as:

| Status | Means |
| --- | --- |
| Held | No provider configured. Nothing was sent. |
| Sent | The provider accepted it. |
| Failed | It did not, and the provider's own reason is on the row. |

With nothing configured everything stays *held* — which is what development and
the tests rely on, and means a half-configured production sends nothing rather
than something wrong.

---

## Uploaded files

Unset, files go to `.uploads/` on the machine's own disk and are served from
`/uploads/<key>`. That is right for development and for a single VPS with a
persistent volume (set `ALLOW_LOCAL_UPLOADS=yes` so production stops
objecting), and **wrong on a serverless host or behind two instances** — the
write fails on one, and half the requests 404 on the other.

Any S3-compatible bucket takes over:

```bash
S3_BUCKET=…
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_REGION=ap-southeast-1
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # omit for AWS
S3_PUBLIC_URL=https://files.yourapp.com
```

AWS, Cloudflare R2, DigitalOcean Spaces, Wasabi and MinIO all work. The PUT is
SigV4-signed in-process, so there is no SDK to install.

Uploads are judged by their **own first bytes**, never by the filename or the
content-type the browser claimed. PNG, JPEG and WebP are accepted up to 2 MB.
**SVG is refused however it is labelled** — it is a document that can carry
script, and a logo is not worth an XSS hole on a school's own subdomain. Each
upload gets a fresh UUID, so a replaced file is never served stale and the
files can be cached forever.

---

## Taking payment online

Unset, the Pay button never appears and invoices are settled by transfer and
recorded by hand. Set these and a school can pay at the provider's checkout:

```bash
PAYMENTS_API_URL=https://api.paymongo.com/v1/links
PAYMENTS_API_KEY=…
PAYMENTS_WEBHOOK_SECRET=…
```

PayMongo's shapes are the defaults; the `PAYMENTS_*_PATH` variables in
`.env.example` point at the same fields in Xendit, Maya or Stripe.

**Only the signed webhook at `/api/payments/webhook` marks an invoice paid.** A
payer who reaches the thank-you page has not necessarily paid, and the browser
is not a witness. The body is verified before it is parsed, an unsigned request
gets a 404, and the provider's payment id is the idempotency key — so the
retries every provider sends record the money once and still answer 200.

Point the provider's webhook at `https://yourapp.com/api/payments/webhook`.

---

## The platform admin

`admin.yourapp.com`. Email, password **and a TOTP code** — the second factor is
required, not optional, because this account reaches every school.

| Screen | For |
| --- | --- |
| Schools | Every school, its tier, student count and status. Open one to switch its modules, suspend it, or read its audit log. |
| Invoices | Every invoice, what is outstanding and what was collected. Record a payment by hand; "Run billing" issues the month's invoices on demand. |
| Outbox | Everything the platform sent, and everything it could not. |

The seed creates this account from `PLATFORM_ADMIN_EMAIL` and
`PLATFORM_ADMIN_PASSWORD` and prints the TOTP secret once. Store it in a
password manager at that moment; it is not shown again.

---

## Suspending a school

`schools.status` is one field. Set it from the platform admin.

Nothing is deleted. Alerts and scheduled jobs pause, the school admin keeps the
Billing page so they can settle up, and attendance already queued on a
teacher's phone uploads after reactivation. An already-open session stops at
its next request — the status is read server-side on every page and API route,
not cached in the session.

---

## Backups

Nothing here is clever: it is one Postgres database, and `pg_dump` is the
backup.

```bash
pg_dump "$DATABASE_URL" --format=custom --file=schoolportal-$(date +%F).dump
```

Back up the uploads too — the bucket, or `.uploads/` on a single-box
deployment. Files are referenced by URL from `schools.logo_url`, so a restored
database with no matching files shows broken images rather than failing.

Test a restore before you need one.

---

## Verifying a change

```bash
npm run typecheck
npm test                 # 108 tests, including the cross-tenant isolation gate
npm run build
npm run responsive       # needs the dev server and a seeded database
npm run smoke            # same
```

`tests/isolation.test.ts` is the release gate: it signs in as school A and
tries to read, write and update school B's rows. **Do not ship a change that
makes it fail**, and do not change it to pass.

The repository has **no CI workflow**. These run wherever you run them and
nothing re-runs them on a pull request — worth fixing if more than one person
works on this.

---

## Troubleshooting

**The app starts in development but refuses in production**
Read the error: it names the variable and says what is wrong. Each case is in
[Configuration](#configuration) above.

**Every school's page is empty, or a school sees another's data**
`APP_DATABASE_URL` is wrong. If it points at the owner role, RLS is bypassed
and tenancy is gone; if it is missing, the app falls back to `DATABASE_URL`,
which is the same thing. The boot check catches both in production.

**`drizzle-kit` hangs or asks a question**
You are running `push` instead of `migrate`. Use `npm run db:migrate`.

**A page 404s for a user who should see it**
Either the role lacks the permission or the module is off for that school.
Both are visible on People and Modules. The guard 404s rather than saying
"forbidden", deliberately — it does not confirm that a page exists.

**Parents are not receiving SMS**
Check the Outbox. *Held* means no provider is configured; *failed* shows the
gateway's own reason.

**Invoices are not being issued**
The runner is not firing. Call `/api/cron/run` by hand with the secret and read
the report — `errors` names anything that threw.

**Postgres restarted and the app cannot connect over TCP**
A default Debian/Ubuntu cluster listens only on its Unix socket. Set
`listen_addresses = 'localhost'` in `postgresql.conf` and restart the cluster.
