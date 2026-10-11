/**
 * Dev helper: mints a platform admin session, so the admin screens can be
 * swept without a TOTP code in the way.
 *
 *   npx tsx scripts/make-admin-session.ts
 */
import "../src/db/load-env";
import { randomBytes } from "node:crypto";
import { db } from "../src/db";
import { platformAdmins, sessions } from "../src/db/schema";

const [admin] = await db.select().from(platformAdmins).limit(1);
if (!admin) throw new Error("No platform admin — run npm run db:seed first");

const id = randomBytes(24).toString("base64url");
await db.insert(sessions).values({
  id,
  platformAdminId: admin.id,
  expiresAt: new Date(Date.now() + 86_400_000),
});
console.log(id);
process.exit(0);
