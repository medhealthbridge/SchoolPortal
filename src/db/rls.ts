/**
 * Row-level security. Tenant tables are readable and writable only when
 * `app.school_id` matches the row, or when `app.platform` is on.
 *
 * The application connects as `app_user`, which is NOT the table owner and has
 * NOBYPASSRLS, so these policies hold even when application code forgets a
 * `where school_id = ...`.
 */
export const TENANT_TABLES = [
  "branches",
  "school_modules",
  "users",
  "user_roles",
  "invites",
  "students",
  "student_guardians",
  "school_years",
  "sections",
  "enrollments",
  "subjects",
  "rooms",
  "timetable_slots",
  "seat_plans",
  "attendance_records",
  "subscriptions",
  "invoices",
  "payments",
  "events",
  "notifications",
] as const;

/** school_id is nullable here, so the policy has to allow the null rows too. */
export const NULLABLE_TENANT_TABLES = ["audit_log", "outbound_messages"] as const;

/** No RLS: read before a school is known, or never school-scoped. */
export const UNRESTRICTED_TABLES = [
  "platform_admins",
  "sessions",
  "email_verifications",
] as const;

export function rlsStatements(): string[] {
  const out: string[] = [];

  for (const t of TENANT_TABLES) {
    out.push(`alter table "${t}" enable row level security`);
    out.push(`alter table "${t}" force row level security`);
    out.push(`drop policy if exists "${t}_tenant" on "${t}"`);
    out.push(`create policy "${t}_tenant" on "${t}" for all to app_user
       using (
         current_setting('app.platform', true) = 'on'
         or school_id = nullif(current_setting('app.school_id', true), '')::uuid
       )
       with check (
         current_setting('app.platform', true) = 'on'
         or school_id = nullif(current_setting('app.school_id', true), '')::uuid
       )`);
  }

  for (const t of NULLABLE_TENANT_TABLES) {
    out.push(`alter table "${t}" enable row level security`);
    out.push(`alter table "${t}" force row level security`);
    out.push(`drop policy if exists "${t}_tenant" on "${t}"`);
    out.push(`create policy "${t}_tenant" on "${t}" for all to app_user
       using (
         current_setting('app.platform', true) = 'on'
         or school_id is null
         or school_id = nullif(current_setting('app.school_id', true), '')::uuid
       )
       with check (
         current_setting('app.platform', true) = 'on'
         or school_id is null
         or school_id = nullif(current_setting('app.school_id', true), '')::uuid
       )`);
  }

  // schools: anyone may look one up by subdomain (that is how a request is
  // routed) and anyone may register one, but only the platform or the school
  // itself may change a row.
  out.push(`alter table "schools" enable row level security`);
  out.push(`alter table "schools" force row level security`);
  out.push(`drop policy if exists "schools_read" on "schools"`);
  out.push(`create policy "schools_read" on "schools" for select to app_user using (true)`);
  out.push(`drop policy if exists "schools_insert" on "schools"`);
  out.push(`create policy "schools_insert" on "schools" for insert to app_user with check (true)`);
  out.push(`drop policy if exists "schools_update" on "schools"`);
  out.push(`create policy "schools_update" on "schools" for update to app_user
     using (
       current_setting('app.platform', true) = 'on'
       or id = nullif(current_setting('app.school_id', true), '')::uuid
     )`);
  out.push(`drop policy if exists "schools_delete" on "schools"`);
  out.push(`create policy "schools_delete" on "schools" for delete to app_user
     using (current_setting('app.platform', true) = 'on')`);

  return out;
}

export function grantStatements(tables: string[]): string[] {
  return [
    `do $$ begin
       if not exists (select 1 from pg_roles where rolname = 'app_user') then
         create role app_user login password 'app_user' nobypassrls;
       end if;
     end $$`,
    `grant usage on schema public to app_user`,
    ...tables.map((t) => `grant select, insert, update, delete on "${t}" to app_user`),
    `alter default privileges in schema public grant select, insert, update, delete on tables to app_user`,
  ];
}
