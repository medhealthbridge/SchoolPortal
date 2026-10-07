import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __sp_pool: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __sp_homes: Map<string, ReturnType<typeof makeDb>> | undefined;
}

function connectionString() {
  // The app connects as app_user (NOBYPASSRLS). DATABASE_URL is the owner
  // connection and is only used by migrations and tests that need to set up
  // fixtures.
  const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (url) return url;

  // `next build` imports every route module to collect page data, and a
  // builder — Vercel, CI — has no reason to hold production credentials. The
  // client below does not connect until its first query, so a placeholder is
  // enough to let the build finish; a page that really did query at build time
  // would fail loudly with a refused connection rather than quietly. At
  // runtime the missing URL is still an error, and `assertConfig` says so.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return "postgres://build:build@127.0.0.1:5432/build";
  }
  throw new Error("APP_DATABASE_URL / DATABASE_URL is not set");
}

/**
 * The same server and credentials, another database. A school with its own
 * database needs no secret of its own: it is reached with the app's login,
 * which row-level security still binds inside it.
 */
export function withDatabaseName(url: string, name: string) {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(name)) throw new Error(`Not a school database name: ${name}`);
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/**
 * One pool for the whole process. Dev hot-reload reuses it through globalThis so
 * we do not leak connections on every edit.
 */
export const client =
  globalThis.__sp_pool ??
  postgres(connectionString(), { max: 10, prepare: false, onnotice: () => {} });

if (process.env.NODE_ENV !== "production") globalThis.__sp_pool = client;

function makeDb(c: ReturnType<typeof postgres>) {
  return drizzle(c, { schema });
}

/** The central database: the list of schools, platform sign-in, billing. */
export const db = makeDb(client);
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/* ------------------------------------------------------------------ *
 * Where a school's records live
 * ------------------------------------------------------------------ */

const homes = (globalThis.__sp_homes ??= new Map());

/** The connection to one school's own database, opened once per process. */
function databaseNamed(name: string): Db {
  let found = homes.get(name);
  if (!found) {
    // Small: a serverless instance serves a handful of requests at a time,
    // and every school's pool counts against the server's connection limit.
    found = makeDb(postgres(withDatabaseName(connectionString(), name), { max: 3, prepare: false, onnotice: () => {} }));
    homes.set(name, found);
  }
  return found;
}

// A school is created with its database already set and never changes it, so
// a name, once known, is kept. "Shared" is only kept briefly, so a process
// that looked a school up mid-creation does not keep the wrong answer.
const known = new Map<string, { name: string | null; until: number }>();

export async function databaseNameOf(schoolId: string): Promise<string | null> {
  const hit = known.get(schoolId);
  if (hit && (hit.name || hit.until > Date.now())) return hit.name;
  const [row] = await db
    .select({ name: schema.schools.databaseName })
    .from(schema.schools)
    .where(eq(schema.schools.id, schoolId))
    .limit(1);
  const name = row?.name ?? null;
  known.set(schoolId, { name, until: Date.now() + 30_000 });
  return name;
}

/** The database holding a school's records: its own, or the shared one. */
export async function homeOf(schoolId: string): Promise<Db> {
  const name = await databaseNameOf(schoolId);
  return name ? databaseNamed(name) : db;
}

/** Every school database, for the platform's cross-school views. */
export async function everyHome(): Promise<{ name: string | null; db: Db }[]> {
  const rows = await db
    .select({ name: schema.schools.databaseName })
    .from(schema.schools)
    .where(sql`${schema.schools.databaseName} is not null`);
  return [{ name: null, db }, ...rows.map((r) => ({ name: r.name, db: databaseNamed(r.name!) }))];
}

/* ------------------------------------------------------------------ *
 * Transactions
 * ------------------------------------------------------------------ */

async function asTenant<T>(on: Db, schoolId: string, fn: (tx: Tx) => Promise<T>) {
  return on.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.school_id', ${schoolId}, true)`);
    await tx.execute(sql`select set_config('app.platform', 'off', true)`);
    return fn(tx);
  });
}

async function asPlatform<T>(on: Db, fn: (tx: Tx) => Promise<T>) {
  return on.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.platform', 'on', true)`);
    return fn(tx);
  });
}

/**
 * Run queries scoped to one school, in that school's database. Every
 * statement inside the transaction sees `app.school_id`, which is what the
 * row-level security policies filter on, so a missing `where schoolId = ...`
 * in application code still cannot read another school's rows — and a school
 * with its own database holds no other school's rows to read.
 */
export async function withTenant<T>(schoolId: string, fn: (tx: Tx) => Promise<T>) {
  return asTenant(await homeOf(schoolId), schoolId, fn);
}

/**
 * One school's rows that the platform keeps for it — its subscription,
 * invoices and payments — scoped to that school, in the central database.
 */
export async function withSchoolAccount<T>(schoolId: string, fn: (tx: Tx) => Promise<T>) {
  return asTenant(db, schoolId, fn);
}

/**
 * Run queries as the platform admin, in the central database: policies let
 * these through for every school. Only reachable from admin.<root domain>
 * behind a platform session. Records a school keeps in its own database are
 * not here; reach them with `withTenant` or `acrossHomes`.
 */
export async function withPlatform<T>(fn: (tx: Tx) => Promise<T>) {
  return asPlatform(db, fn);
}

/** The platform's view over every school database, one result per database. */
export async function acrossHomes<T>(fn: (tx: Tx) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (const home of await everyHome()) out.push(...(await asPlatform(home.db, fn)));
  return out;
}

export { schema };
