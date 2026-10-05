/**
 * Brings a database up to the current schema, then applies the grants and the
 * row-level security policies. Run with `npm run db:migrate`.
 *
 * Versioned migrations rather than `drizzle-kit push`: push diffs the live
 * database and asks questions when the answer could lose data, which is right
 * for a scratch database and wrong for a deploy. The files in `drizzle/` are
 * the record of what has been applied, and running this twice is a no-op.
 *
 * After a schema change: `npm run db:generate`, read the SQL it wrote, commit
 * it, then run this.
 */
import "./load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { grantStatements, rlsStatements } from "./rls";

const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) throw new Error("DATABASE_URL is not set");

// The owner connection: migrations create tables, and RLS policies can only be
// written by the table's owner. The app itself never connects this way.
const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });

console.log("→ applying migrations");
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });

const tables: { tablename: string }[] =
  await sql`select tablename from pg_tables where schemaname = 'public'`;

console.log("→ granting app_user");
for (const stmt of grantStatements(tables.map((t) => t.tablename))) {
  await sql.unsafe(stmt);
}

// Re-applied every time: a new table added by a migration needs its policy,
// and every statement in here is idempotent.
console.log("→ applying row-level security");
for (const stmt of rlsStatements()) {
  await sql.unsafe(stmt);
}

await sql.end();
console.log("✓ database ready");
