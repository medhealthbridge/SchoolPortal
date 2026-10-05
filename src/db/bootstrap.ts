/**
 * Brings a fresh database to the point where a person can sign in: the platform
 * admin, and — if the BOOTSTRAP_* variables ask for one — a first school with
 * its owner. Nothing else.
 *
 * `db:seed` is for demos and deletes every school before it starts; this is
 * the opposite — safe to run on every production deploy, because once the admin
 * and the school exist it does nothing at all.
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

// The first school. Registration verifies the owner's email with a code, and a
// deployment with no mail provider cannot send one, so on day one there would
// otherwise be no way in for anyone but the platform admin. Loaded here rather
// than at the top: it opens the app's own connection pool, which should not
// exist when the checks above have already decided to stop.
const { ensureFirstSchool } = await import("../lib/onboarding");
const { client } = await import("./index");
try {
  const outcome = await ensureFirstSchool();
  if (outcome === "created") {
    console.log(`✓ first school created at ${process.env.BOOTSTRAP_SCHOOL_SUBDOMAIN}; its owner can sign in`);
  } else if (outcome === "exists") {
    console.log("→ first school already exists; nothing to do");
  }
} catch (err) {
  stop(err instanceof Error ? err.message : String(err));
} finally {
  await client.end();
}
