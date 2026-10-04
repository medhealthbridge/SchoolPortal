import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __sp_pool: ReturnType<typeof postgres> | undefined;
}

function connectionString() {
  // The app connects as app_user (NOBYPASSRLS). DATABASE_URL is the owner
  // connection and is only used by migrations and tests that need to set up
  // fixtures.
  const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("APP_DATABASE_URL / DATABASE_URL is not set");
  return url;
}

/**
 * One pool for the whole process. Dev hot-reload reuses it through globalThis so
 * we do not leak connections on every edit.
 */
export const client =
  globalThis.__sp_pool ??
  postgres(connectionString(), { max: 10, prepare: false, onnotice: () => {} });

if (process.env.NODE_ENV !== "production") globalThis.__sp_pool = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run queries scoped to one school. Every statement inside the transaction sees
 * `app.school_id`, which is what the row-level security policies filter on, so
 * a missing `where schoolId = ...` in application code still cannot read
 * another school's rows.
 */
export async function withTenant<T>(schoolId: string, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.school_id', ${schoolId}, true)`);
    await tx.execute(sql`select set_config('app.platform', 'off', true)`);
    return fn(tx);
  });
}

/**
 * Run queries as the platform admin: policies let these through for every
 * school. Only reachable from admin.<root domain> behind a platform session.
 */
export async function withPlatform<T>(fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.platform', 'on', true)`);
    return fn(tx);
  });
}

export { schema };
