import "../src/db/load-env";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, withPlatform, withTenant } from "@/db";
import { auditLog, branches, schools, subscriptions, userRoles, users } from "@/db/schema";
import { createSchoolWithOwner, ensureFirstSchool } from "@/lib/onboarding";
import { hashPassword, verifyPassword } from "@/lib/password";
import { enabledModules } from "@/lib/tenant";
import { schoolFrom } from "@/app/site/signin/find-school";
import { sendVerificationCode } from "@/app/site/register/actions";
import { dropSchool } from "./helpers";

const stamp = Date.now().toString(36);
const made: string[] = [];
const sub = (n: string) => `${n}${stamp}`;

afterAll(async () => {
  for (const id of made) await dropSchool(id);
});

const bySubdomain = async (subdomain: string) =>
  (await withPlatform((tx) => tx.select().from(schools).where(eq(schools.subdomain, subdomain))))[0];

describe("creating a school with its owner", () => {
  it("makes everything a school needs, and an owner who can sign in", async () => {
    const subdomain = sub("full");
    const school = await createSchoolWithOwner({
      subdomain,
      name: "Full Test School",
      type: "k12",
      tier: "academic",
      ownerName: "Olga Owner",
      ownerEmail: "  Olga@Full.TEST ",
      ownerMobile: "+639170000009",
      passwordHash: await hashPassword("a-long-owner-password"),
      branchNames: ["Main campus", "Annex"],
      actorLabel: "test",
      action: "school.registered",
    });
    made.push(school.id);

    expect(school.status).toBe("trial");
    expect(school.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);

    const details = await withTenant(school.id, async (tx) => ({
      owner: (await tx.select().from(users))[0]!,
      roles: await tx.select().from(userRoles),
      branches: await tx.select().from(branches),
    }));
    // The address is normalised, so the owner can sign in however they type it.
    expect(details.owner.email).toBe("olga@full.test");
    expect(await verifyPassword("a-long-owner-password", details.owner.passwordHash)).toBe(true);
    expect(details.roles.map((r) => r.role)).toEqual(["school_admin"]);
    expect(details.branches.map((b) => [b.name, b.isMain])).toEqual([
      ["Main campus", true],
      ["Annex", false],
    ]);

    const [sub1] = await withTenant(school.id, (tx) => tx.select().from(subscriptions));
    expect(sub1!.tier).toBe("academic");

    // The tier decides the modules: academic has Grades, not Registrar.
    const modules = await enabledModules(school.id);
    expect(modules.has("grades")).toBe(true);
    expect(modules.has("registrar")).toBe(false);

    const audit = await withPlatform((tx) => tx.select().from(auditLog).where(eq(auditLog.schoolId, school.id)));
    expect(audit.map((a) => a.action)).toContain("school.registered");
  });

  it("refuses a subdomain that is already taken, rather than making a second school", async () => {
    const subdomain = sub("dup");
    const input = {
      subdomain,
      name: "Dup",
      type: "k12" as const,
      tier: "starter" as const,
      ownerName: "O",
      ownerEmail: "o@dup.test",
      passwordHash: await hashPassword("a-long-owner-password"),
      branchNames: ["Main"],
      actorLabel: "test",
      action: "school.registered" as const,
    };
    made.push((await createSchoolWithOwner(input)).id);
    await expect(createSchoolWithOwner(input)).rejects.toThrow();
    const rows = await withPlatform((tx) => tx.select().from(schools).where(eq(schools.subdomain, subdomain)));
    expect(rows).toHaveLength(1);
  });
});

describe("the first school, for a deployment nobody can register on yet", () => {
  const complete = (subdomain: string) => ({
    BOOTSTRAP_SCHOOL_SUBDOMAIN: subdomain,
    BOOTSTRAP_SCHOOL_NAME: "First School",
    BOOTSTRAP_OWNER_EMAIL: "owner@first.test",
    BOOTSTRAP_OWNER_PASSWORD: "a-long-first-password",
  });

  it("does nothing at all when none of the variables are set", async () => {
    expect(await ensureFirstSchool({})).toBe("skipped");
    expect(await ensureFirstSchool({ BOOTSTRAP_SCHOOL_SUBDOMAIN: "   " })).toBe("skipped");
  });

  it("refuses a half-asked-for school and names what is missing, so a deploy cannot quietly skip it", async () => {
    await expect(ensureFirstSchool({ BOOTSTRAP_SCHOOL_SUBDOMAIN: sub("half") })).rejects.toThrow(
      /BOOTSTRAP_SCHOOL_NAME.*BOOTSTRAP_OWNER_EMAIL.*BOOTSTRAP_OWNER_PASSWORD.*Set all four or none/,
    );
  });

  it("refuses what would make a bad school: a weak password, a bad address, a reserved name, an unknown tier", async () => {
    const base = complete(sub("bad"));
    await expect(ensureFirstSchool({ ...base, BOOTSTRAP_OWNER_PASSWORD: "short" })).rejects.toThrow(/12 characters/);
    await expect(ensureFirstSchool({ ...base, BOOTSTRAP_OWNER_EMAIL: "not-an-email" })).rejects.toThrow(/email/);
    await expect(ensureFirstSchool({ ...base, BOOTSTRAP_SCHOOL_SUBDOMAIN: "admin" })).rejects.toThrow(/subdomain/);
    await expect(ensureFirstSchool({ ...base, BOOTSTRAP_SCHOOL_TIER: "platinum" })).rejects.toThrow(/tier/);
    expect(await bySubdomain(base.BOOTSTRAP_SCHOOL_SUBDOMAIN)).toBeUndefined();
  });

  it("creates the school once, and is a no-op on every deploy after", async () => {
    const env = complete(sub("first"));
    expect(await ensureFirstSchool(env)).toBe("created");
    const school = (await bySubdomain(env.BOOTSTRAP_SCHOOL_SUBDOMAIN))!;
    made.push(school.id);

    expect(school.name).toBe("First School");
    expect(school.tier).toBe("all_in");
    expect((await enabledModules(school.id)).has("analytics")).toBe(true);

    const [owner] = await withTenant(school.id, (tx) => tx.select().from(users));
    expect(owner!.email).toBe("owner@first.test");
    expect(await verifyPassword("a-long-first-password", owner!.passwordHash)).toBe(true);

    expect(await ensureFirstSchool(env)).toBe("exists");
    expect(await ensureFirstSchool(env)).toBe("exists");
    const rows = await withPlatform((tx) => tx.select().from(schools).where(eq(schools.subdomain, env.BOOTSTRAP_SCHOOL_SUBDOMAIN)));
    expect(rows).toHaveLength(1);
    const audit = await withPlatform((tx) => tx.select().from(auditLog).where(eq(auditLog.schoolId, school.id)));
    expect(audit.map((a) => a.action)).toContain("school.seeded");
  });
});

describe("finding a school from what a person types", () => {
  const root = "schoolportal.example.com";

  it("takes the bare name, the full address and a pasted link as the same answer", () => {
    for (const typed of ["demo", "  Demo ", "demo.schoolportal.example.com", "https://demo.schoolportal.example.com/login", "http://DEMO.schoolportal.example.com/", "demo.schoolportal.example.com:443", "demo.schoolportal.example.com/anything?x=1#y"]) {
      expect(schoolFrom(typed, root), typed).toBe("demo");
    }
    expect(schoolFrom("st-mary-2", root)).toBe("st-mary-2");
  });

  it("refuses what cannot be a school address, so nobody is sent somewhere strange", () => {
    for (const typed of ["", "   ", "evil.com", "demo.evil.com", "-demo", "demo-", "de mo", "demo_school", "a".repeat(41), "demo@evil.com", "evil.com/demo.schoolportal.example.com", "javascript:alert(1)"]) {
      expect(schoolFrom(typed, root), typed).toBe(null);
    }
  });
});

describe("registering when the site cannot send email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("says so in production, instead of waiting for a code that was never going to come", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const out = await sendVerificationCode(`nobody-${stamp}@register.test`);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toMatch(/cannot send email yet/);
    expect("devCode" in out).toBe(false); // and never shows the code on screen
  });

  it("still hands the code back on screen in development, where that is the point", async () => {
    const out = await sendVerificationCode(`dev-${stamp}@register.test`);
    expect(out.ok).toBe(true);
    expect(out.ok && out.devCode).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("reports a provider that refused the message, rather than pretending it went", async () => {
    vi.stubEnv("EMAIL_API_URL", "https://provider.test/send");
    vi.stubEnv("EMAIL_API_KEY", "key");
    vi.stubEnv("EMAIL_BODY_TEMPLATE", "{}");
    vi.stubGlobal("fetch", async () => new Response("no credit", { status: 402 }));
    const out = await sendVerificationCode(`failed-${stamp}@register.test`);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toMatch(/could not be sent/);
  });

  it("never sends the verification code in the clear to the screen when mail did go out", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_API_URL", "https://provider.test/send");
    vi.stubEnv("EMAIL_API_KEY", "key");
    vi.stubEnv("EMAIL_BODY_TEMPLATE", '{"to":"{{to}}","text":"{{body}}"}');
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
    const out = await sendVerificationCode(`sent-${stamp}@register.test`);
    expect(out.ok).toBe(true);
    expect("devCode" in out && out.devCode).toBeFalsy();
  });
});
