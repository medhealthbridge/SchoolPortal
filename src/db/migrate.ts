/**
 * Applies row-level security and grants after `drizzle-kit push` has created
 * the tables. Run with `npm run db:push`.
 */
import "./load-env";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { grantStatements, rlsStatements } from "./rls";

const ownerUrl = process.env.DATABASE_URL!;

console.log("→ pushing schema");
execFileSync("npx", ["drizzle-kit", "push", "--force"], {
  stdio: "inherit",
  env: process.env,
});

const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });

const tables: { tablename: string }[] =
  await sql`select tablename from pg_tables where schemaname = 'public'`;

console.log("→ granting app_user");
for (const stmt of grantStatements(tables.map((t) => t.tablename))) {
  await sql.unsafe(stmt);
}

console.log("→ applying row-level security");
for (const stmt of rlsStatements()) {
  await sql.unsafe(stmt);
}

await sql.end();
console.log("✓ database ready");
