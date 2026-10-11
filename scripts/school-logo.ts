/** Prints a school's stored logo address. Helper for the onboarding check. */
import "../src/db/load-env";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { schools } from "../src/db/schema";

const [s] = await db.select().from(schools).where(eq(schools.subdomain, process.argv[2] ?? ""));
console.log(s?.logoUrl ?? "");
process.exit(0);
