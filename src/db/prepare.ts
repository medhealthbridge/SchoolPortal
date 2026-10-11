/**
 * Brings one database up to the current schema and applies the grants and
 * row-level security. The shared database and every school's own database go
 * through this same function, so they cannot drift apart.
 */
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { grantStatements, rlsStatements } from "./rls";

export const MIGRATIONS_FOLDER = resolve(process.cwd(), "drizzle");

export async function prepareDatabase(ownerUrl: string, log: (line: string) => void = () => {}) {
  // The owner connection: migrations create tables, and RLS policies can only
  // be written by the table's owner. The app itself never connects this way.
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    log("→ applying migrations");
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });

    const tables: { tablename: string }[] =
      await sql`select tablename from pg_tables where schemaname = 'public'`;

    log("→ granting app_user");
    for (const stmt of grantStatements(tables.map((t) => t.tablename))) {
      await sql.unsafe(stmt);
    }

    // Re-applied every time: a new table added by a migration needs its
    // policy, and every statement in here is idempotent.
    log("→ applying row-level security");
    for (const stmt of rlsStatements()) {
      await sql.unsafe(stmt);
    }
  } finally {
    await sql.end();
  }
}
