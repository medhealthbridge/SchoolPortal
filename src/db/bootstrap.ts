/**
 * Creates the platform admin on a database that has none. Nothing else.
 *
 * `db:seed` is for demos and deletes every school before it starts; this is
 * the opposite — safe to run on every production deploy, because once an admin
 * exists it does nothing at all.
 *
 * The account is created without an authenticator. The first sign-in enrols
 * one in the app (see src/lib/admin-auth.ts), so no second-factor key is ever
 * printed to a log or left in a chat.
 */
import "./load-env";
import postgres from "postgres";
import { hashPassword } from "../lib/password";

const email = (process.env.PLATFORM_ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
const ownerUrl = process.env.DATABASE_URL;

function stop(message: string): never {
  console.error(`✗ bootstrap: ${message}`);
  process.exit(1);
}

if (!ownerUrl) stop("DATABASE_URL is not set.");
if (!email) stop("PLATFORM_ADMIN_EMAIL is not set.");
if (password.length < 12) {
  stop("PLATFORM_ADMIN_PASSWORD must be at least 12 characters — that account reaches every school.");
}

// The owner connection, as migrate uses: this runs right after it, and nothing
// here needs to go through row-level security.
const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });

const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from platform_admins`;
if (n > 0) {
  console.log("→ platform admin already exists; nothing to do");
} else {
  await sql`
    insert into platform_admins (email, name, password_hash)
    values (${email}, 'Platform admin', ${await hashPassword(password)})
  `;
  console.log(`✓ platform admin created for ${email}; the first sign-in sets up the authenticator`);
}

await sql.end();
