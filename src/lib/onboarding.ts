import { z } from "zod";
import { withPlatform, withTenant } from "@/db";
import { branches, schools, subscriptions, userRoles, users } from "@/db/schema";
import { audit } from "./audit";
import { todayIso } from "./format";
import { hashPassword } from "./password";
import { PER_STUDENT_CENTAVOS, platformFeeCentavos, type TierKey } from "./pricing";
import { applyTierModules, findSchoolBySubdomain, subdomainProblem } from "./tenant";

export const TRIAL_DAYS = 30;

export type NewSchool = {
  subdomain: string;
  name: string;
  type: (typeof schools.$inferInsert)["type"];
  tier: TierKey;
  ownerName: string;
  ownerEmail: string;
  ownerMobile?: string | null;
  passwordHash: string;
  /** One per line in the wizard; the first is the main campus. */
  branchNames: string[];
  /** Recorded in the audit log: who brought this school into being. */
  actorLabel: string;
  action: "school.registered" | "school.seeded" | "school.created_by_platform";
};

/**
 * A school and the person who owns it: the platform row, its subscription, the
 * modules its tier includes, its campuses, and an owner who can sign in.
 *
 * The registration wizard and the first-deploy seeding both call this, so
 * "what a new school is" has one definition and the two cannot drift apart.
 * Whoever calls it is responsible for having established that the owner's
 * address is theirs: the wizard by email code, the seeding by the operator
 * having set the variables.
 */
export async function createSchoolWithOwner(input: NewSchool) {
  const email = input.ownerEmail.trim().toLowerCase();

  const school = await withPlatform(async (tx) => {
    const [row] = await tx
      .insert(schools)
      .values({
        subdomain: input.subdomain.toLowerCase(),
        name: input.name,
        type: input.type,
        tier: input.tier,
        status: "trial",
        ownerName: input.ownerName,
        ownerEmail: email,
        ownerMobile: input.ownerMobile ?? null,
        emailVerifiedAt: new Date(),
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
        onboardingStep: 5,
      })
      .returning();

    await tx.insert(subscriptions).values({
      schoolId: row.id,
      tier: input.tier,
      extraModules: [] as never,
      platformFeeCentavos: platformFeeCentavos(input.tier),
      perStudentCentavos: PER_STUDENT_CENTAVOS,
      startedOn: todayIso(),
    });

    await audit(tx, {
      schoolId: row.id,
      actorLabel: input.actorLabel,
      action: input.action,
      entity: "schools",
      entityId: row.id,
      after: { subdomain: row.subdomain, tier: row.tier },
    });

    return row;
  });

  await applyTierModules(school.id, input.tier);

  const ownerId = await withTenant(school.id, async (tx) => {
    for (const [i, name] of input.branchNames.entries()) {
      await tx.insert(branches).values({ schoolId: school.id, name, isMain: i === 0 });
    }
    const [owner] = await tx
      .insert(users)
      .values({
        schoolId: school.id,
        email,
        name: input.ownerName,
        phone: input.ownerMobile ?? null,
        passwordHash: input.passwordHash,
        status: "active",
      })
      .returning();
    await tx.insert(userRoles).values({
      schoolId: school.id,
      userId: owner.id,
      role: "school_admin",
    });
    return owner.id;
  });

  return { ...school, ownerId };
}

/* ------------------------------------------------------------------ *
 * The first school, for a deployment where nobody can register yet
 * ------------------------------------------------------------------ */

const FIRST_SCHOOL_VARS = [
  "BOOTSTRAP_SCHOOL_SUBDOMAIN",
  "BOOTSTRAP_SCHOOL_NAME",
  "BOOTSTRAP_OWNER_EMAIL",
  "BOOTSTRAP_OWNER_PASSWORD",
] as const;

/**
 * Registration verifies the owner's email with a code, and a deployment with
 * no mail provider cannot send one — so on day one there is no way in. This
 * creates one school and its owner from environment variables, once.
 *
 * - none of the variables set: it does nothing;
 * - some set, some not: it refuses, because a deploy that quietly skipped half
 *   of what was asked for is worse than one that stops and says which;
 * - the subdomain already taken: it does nothing, so it is safe on every deploy.
 */
export async function ensureFirstSchool(
  env: Record<string, string | undefined> = process.env,
): Promise<"skipped" | "exists" | "created"> {
  const set = FIRST_SCHOOL_VARS.filter((k) => (env[k] ?? "").trim() !== "");
  if (set.length === 0) return "skipped";
  if (set.length < FIRST_SCHOOL_VARS.length) {
    const missing = FIRST_SCHOOL_VARS.filter((k) => !set.includes(k));
    throw new Error(`First school: ${missing.join(", ")} not set. Set all four or none.`);
  }

  const subdomain = env.BOOTSTRAP_SCHOOL_SUBDOMAIN!.trim().toLowerCase();
  const name = env.BOOTSTRAP_SCHOOL_NAME!.trim();
  const email = env.BOOTSTRAP_OWNER_EMAIL!.trim().toLowerCase();
  const password = env.BOOTSTRAP_OWNER_PASSWORD!;
  const ownerName = (env.BOOTSTRAP_OWNER_NAME ?? "").trim() || "School admin";
  const tier = (env.BOOTSTRAP_SCHOOL_TIER ?? "all_in") as TierKey;

  const problem = subdomainProblem(subdomain);
  if (problem) throw new Error(`First school: subdomain "${subdomain}" — ${problem}`);
  if (!z.string().email().safeParse(email).success) {
    throw new Error("First school: BOOTSTRAP_OWNER_EMAIL is not an email address.");
  }
  if (password.length < 12) {
    throw new Error("First school: BOOTSTRAP_OWNER_PASSWORD must be at least 12 characters.");
  }
  if (!["starter", "academic", "student_life", "all_in"].includes(tier)) {
    throw new Error(`First school: BOOTSTRAP_SCHOOL_TIER "${tier}" is not a tier.`);
  }

  if (await findSchoolBySubdomain(subdomain)) return "exists";

  await createSchoolWithOwner({
    subdomain,
    name,
    type: "k12",
    tier,
    ownerName,
    ownerEmail: email,
    passwordHash: await hashPassword(password),
    branchNames: ["Main campus"],
    actorLabel: "platform (first-deploy seeding)",
    action: "school.seeded",
  });
  return "created";
}
