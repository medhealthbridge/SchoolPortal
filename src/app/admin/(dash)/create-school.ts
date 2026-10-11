"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/guard";
import { createSchoolWithOwner } from "@/lib/onboarding";
import { hashPassword } from "@/lib/password";
import { issueReset } from "@/lib/password-reset";
import { schoolUrl } from "@/lib/school-url";
import { subdomainAvailable, subdomainProblem } from "@/lib/tenant";

export type CreateSchoolResult =
  | { error: string }
  | { ok: string; signIn: string; setPassword: string }
  | null;

const TIERS = ["starter", "academic", "student_life", "all_in"] as const;

/**
 * The platform adds a school by hand: for a school that signed a contract, or
 * while self-registration cannot send its verification email. The owner gets
 * a link to choose their own password; nobody ever sees one.
 */
export async function createSchool(_prev: CreateSchoolResult, form: FormData): Promise<CreateSchoolResult> {
  const admin = await requireAdmin();
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const subdomain = String(form.get("subdomain") ?? "").trim().toLowerCase();
  const tier = String(form.get("tier") ?? "all_in");
  const ownerName = String(form.get("ownerName") ?? "").trim();
  const ownerEmail = String(form.get("ownerEmail") ?? "").trim().toLowerCase();
  const type = String(form.get("type") ?? "k12");
  const ownDatabase = String(form.get("storage") ?? "own") !== "shared";

  if (name.length < 2) return { error: "Enter the school's name." };
  const problem = subdomainProblem(subdomain);
  if (problem) return { error: `Address: ${problem}` };
  if (!(await subdomainAvailable(subdomain))) return { error: "That address is taken." };
  if (!(TIERS as readonly string[]).includes(tier)) return { error: "Choose a plan." };
  if (ownerName.length < 2) return { error: "Enter the owner's name." };
  if (!z.string().email().safeParse(ownerEmail).success) return { error: "Enter the owner's email." };
  if (!["k12", "senior_high", "college"].includes(type)) return { error: "Choose the school type." };

  let school;
  try {
    school = await createSchoolWithOwner({
      subdomain,
      name,
      type: type as "k12" | "senior_high" | "college",
      tier: tier as (typeof TIERS)[number],
      ownerName,
      ownerEmail,
      // Never used: the owner sets their own through the link below.
      passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
      branchNames: ["Main campus"],
      actorLabel: `platform: ${admin.name}`,
      action: "school.created_by_platform",
      ownDatabase,
    });
  } catch (err) {
    console.error("createSchool", err);
    const why = err instanceof Error ? err.message : String(err);
    return { error: ownDatabase ? `The school's database could not be made: ${why}` : "The school could not be created. Try again." };
  }

  const token = await withTenant(school.id, (tx) =>
    issueReset(tx, { schoolId: school.id, userId: school.ownerId, hours: 7 * 24 }),
  );

  revalidatePath("/");
  return {
    ok: `${name} is ready on a 30-day trial${ownDatabase ? ", in its own database" : ""}.`,
    signIn: schoolUrl(school.subdomain, "/login"),
    setPassword: schoolUrl(school.subdomain, `/reset/${token}`),
  };
}
