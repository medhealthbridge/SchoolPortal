/**
 * Dev helper: mints a session cookie for a user, so flows can be exercised
 * with curl or a headless browser without going through the login form.
 *
 *   npx tsx scripts/make-session.ts stmary teacher@stmary.databridgesol.space
 */
import "../src/db/load-env";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, homeOf, withTenant } from "../src/db";
import { schools, sessions, users } from "../src/db/schema";

const [sub, email] = process.argv.slice(2);
if (!sub || !email) {
  console.error("usage: tsx scripts/make-session.ts <subdomain> <email>");
  process.exit(1);
}

const [school] = await db.select().from(schools).where(eq(schools.subdomain, sub));
if (!school) throw new Error(`No school at ${sub}`);
const [user] = await withTenant(school.id, (tx) =>
  tx
    .select()
    .from(users)
    .where(and(eq(users.schoolId, school.id), eq(users.email, email))),
);
if (!user) throw new Error(`No user ${email} at ${sub}`);

const id = randomBytes(24).toString("base64url");
await (await homeOf(school.id)).insert(sessions).values({
  id,
  userId: user.id,
  schoolId: school.id,
  expiresAt: new Date(Date.now() + 86_400_000),
});
console.log(id);
process.exit(0);
