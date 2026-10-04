"use server";

import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, withPlatform, withTenant } from "@/db";
import {
  branches,
  emailVerifications,
  schools,
  subscriptions,
  userRoles,
  users,
} from "@/db/schema";
import { activationCode, hashPassword } from "@/lib/password";
import { deliver } from "@/lib/messaging";
import { audit } from "@/lib/audit";
import { applyTierModules, subdomainAvailable, subdomainProblem } from "@/lib/tenant";
import { PER_STUDENT_CENTAVOS, platformFeeCentavos } from "@/lib/pricing";
import { todayIso } from "@/lib/format";

const TRIAL_DAYS = 30;

export async function sendVerificationCode(email: string) {
  const parsed = z.string().email().safeParse(email.trim().toLowerCase());
  if (!parsed.success) return { ok: false as const, error: "Enter a valid email address." };

  const code = activationCode(6);
  await db.insert(emailVerifications).values({
    email: parsed.data,
    code,
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  await deliver({
    channel: "email",
    to: parsed.data,
    subject: "Your SchoolPortal verification code",
    body: `Your verification code is ${code}. It expires in 30 minutes.`,
  });

  // Dev convenience: no mail provider is wired up yet, so the code comes back
  // to the screen. In production `deliver()` sends it and this is dropped.
  return {
    ok: true as const,
    devCode: process.env.NODE_ENV === "production" ? undefined : code,
  };
}

export async function verifyEmailCode(email: string, code: string) {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(emailVerifications)
    .where(
      and(
        eq(emailVerifications.email, normalized),
        eq(emailVerifications.code, code.trim().toUpperCase()),
        gt(emailVerifications.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return { ok: false as const, error: "That code is wrong or has expired." };
  await db
    .update(emailVerifications)
    .set({ verifiedAt: new Date() })
    .where(eq(emailVerifications.id, row.id));
  return { ok: true as const };
}

export async function checkSubdomain(value: string) {
  const problem = subdomainProblem(value);
  if (problem) return { available: false as const, reason: problem };
  const free = await subdomainAvailable(value);
  return free
    ? { available: true as const, reason: null }
    : { available: false as const, reason: "That address is taken." };
}

const registrationSchema = z.object({
  schoolName: z.string().min(2),
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerMobile: z.string().min(7),
  password: z.string().min(8, "Use at least 8 characters."),
  subdomain: z.string(),
  type: z.enum(["k12", "senior_high", "college"]),
  branchNames: z.array(z.string().min(1)).min(1),
  tier: z.enum(["starter", "academic", "student_life", "all_in"]),
});

export type RegistrationInput = z.input<typeof registrationSchema>;

export async function registerSchool(input: RegistrationInput) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;
  const email = data.ownerEmail.trim().toLowerCase();

  // "The email is verified before anything else."
  const verifications = await db
    .select({ verifiedAt: emailVerifications.verifiedAt })
    .from(emailVerifications)
    .where(eq(emailVerifications.email, email));
  if (!verifications.some((v) => v.verifiedAt !== null)) {
    return { ok: false as const, error: "Verify the owner's email address first." };
  }

  if (subdomainProblem(data.subdomain) || !(await subdomainAvailable(data.subdomain))) {
    return { ok: false as const, error: "That address is not available." };
  }

  const fee = platformFeeCentavos(data.tier);
  const passwordHash = await hashPassword(data.password);

  const school = await withPlatform(async (tx) => {
    const [row] = await tx
      .insert(schools)
      .values({
        subdomain: data.subdomain.toLowerCase(),
        name: data.schoolName,
        type: data.type,
        tier: data.tier,
        status: "trial",
        ownerName: data.ownerName,
        ownerEmail: email,
        ownerMobile: data.ownerMobile,
        emailVerifiedAt: new Date(),
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
        onboardingStep: 5,
      })
      .returning();

    await tx.insert(subscriptions).values({
      schoolId: row.id,
      tier: data.tier,
      extraModules: [] as never,
      platformFeeCentavos: fee,
      perStudentCentavos: PER_STUDENT_CENTAVOS,
      startedOn: todayIso(),
    });

    await audit(tx, {
      schoolId: row.id,
      actorLabel: `${data.ownerName} <${email}>`,
      action: "school.registered",
      entity: "schools",
      entityId: row.id,
      after: { subdomain: row.subdomain, tier: row.tier },
    });

    return row;
  });

  await applyTierModules(school.id, data.tier);

  await withTenant(school.id, async (tx) => {
    for (const [i, name] of data.branchNames.entries()) {
      await tx.insert(branches).values({ schoolId: school.id, name, isMain: i === 0 });
    }
    const [owner] = await tx
      .insert(users)
      .values({
        schoolId: school.id,
        email,
        name: data.ownerName,
        phone: data.ownerMobile,
        passwordHash,
        status: "active",
      })
      .returning();
    await tx.insert(userRoles).values({
      schoolId: school.id,
      userId: owner.id,
      role: "school_admin",
    });
  });

  const root = process.env.ROOT_DOMAIN ?? "lvh.me:3000";
  const protocol = root.startsWith("localhost") || root.includes("lvh.me") ? "http" : "https";

  await deliver({
    schoolId: school.id,
    channel: "email",
    to: email,
    subject: `${school.name} is live on SchoolPortal`,
    body: `Your school is ready at ${protocol}://${school.subdomain}.${root}. Sign in with ${email}.`,
  });

  return {
    ok: true as const,
    url: `${protocol}://${school.subdomain}.${root}/login`,
    subdomain: school.subdomain,
  };
}
