"use server";

import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, withPlatform } from "@/db";
import { emailVerifications, schools } from "@/db/schema";
import { checkImage, put } from "@/lib/storage";
import { activationCode, hashPassword } from "@/lib/password";
import { deliver } from "@/lib/messaging";
import { subdomainAvailable, subdomainProblem } from "@/lib/tenant";
import { createSchoolWithOwner } from "@/lib/onboarding";

export async function sendVerificationCode(email: string) {
  const parsed = z.string().email().safeParse(email.trim().toLowerCase());
  if (!parsed.success) return { ok: false as const, error: "Enter a valid email address." };

  const code = activationCode(6);
  await db.insert(emailVerifications).values({
    email: parsed.data,
    code,
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  const sent = await deliver({
    channel: "email",
    to: parsed.data,
    subject: "Your SchoolPortal verification code",
    body: `Your verification code is ${code}. It expires in 30 minutes.`,
  });

  // A code nobody can receive is a dead end that looks like a working form:
  // the visitor waits for an email that was never going to come. Say so.
  if (sent.status === "failed") {
    return { ok: false as const, error: "The email could not be sent. Try again in a minute." };
  }
  if (sent.status === "held" && process.env.NODE_ENV === "production") {
    return {
      ok: false as const,
      error:
        "This site cannot send email yet, so new schools cannot register on their own. " +
        "Ask the person who runs SchoolPortal to add yours.",
    };
  }

  // Dev convenience: with no mail provider the code comes back to the screen.
  // In production it is only ever sent, never shown.
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

export async function registerSchool(input: RegistrationInput, logoForm?: FormData | null) {
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

  const school = await createSchoolWithOwner({
    subdomain: data.subdomain,
    name: data.schoolName,
    type: data.type,
    tier: data.tier,
    ownerName: data.ownerName,
    ownerEmail: email,
    ownerMobile: data.ownerMobile,
    passwordHash: await hashPassword(data.password),
    branchNames: data.branchNames,
    actorLabel: `${data.ownerName} <${email}>`,
    action: "school.registered",
  });

  // The logo is optional and never blocks the school: it is saved after the
  // school exists, and a problem with it is reported, not fatal.
  let logoNote: string | undefined;
  const logo = logoForm?.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const checked = await checkImage(logo);
    if (!checked.ok) logoNote = checked.error;
    else {
      try {
        const stored = await put(`schools/${school.id}`, checked.bytes, checked.type, checked.ext);
        await withPlatform((tx) =>
          tx.update(schools).set({ logoUrl: stored.url }).where(eq(schools.id, school.id)),
        );
      } catch (err) {
        console.error(err);
        logoNote = "The logo could not be saved.";
      }
    }
  }

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
    logoNote,
  };
}
