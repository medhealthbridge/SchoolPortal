/**
 * Brings the shared database up to the current schema, then every school's
 * own database, applying the grants and the row-level security policies to
 * each. Run with `npm run db:migrate`.
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
import postgres from "postgres";
import { prepareDatabase } from "./prepare";
import { withDatabaseName } from "./index";

const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) throw new Error("DATABASE_URL is not set");

console.log("Shared database");
await prepareDatabase(ownerUrl, console.log);

// Schools with a database of their own get the same migrations, in the same
// deploy, so the code never runs against a school database a version behind.
const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
const own: { name: string }[] =
  await sql`select database_name as name from schools where database_name is not null order by created_at`;
await sql.end();

for (const { name } of own) {
  console.log(`School database ${name}`);
  await prepareDatabase(withDatabaseName(ownerUrl, name), console.log);
}

console.log(`✓ ${own.length + 1} database(s) ready`);
process.exit(0);
