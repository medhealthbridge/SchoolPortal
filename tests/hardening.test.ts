import "../src/db/load-env";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attempt, clearAttempts, retryMessage, purgeExpiredAttempts } from "@/lib/throttle";
import { configProblems, assertConfig } from "@/lib/config";
import { authorizeCron, runScheduledJobs } from "@/lib/scheduled";
import { fillTemplate, send } from "@/lib/delivery";
import { db } from "@/db";
import { authThrottle } from "@/db/schema";
import { eq } from "drizzle-orm";

const budget = { max: 3, windowMs: 60_000 };
const key = () => `test:${Math.random().toString(36).slice(2)}`;

describe("sign-in throttle", () => {
  it("allows the budget and refuses the next one", async () => {
    const k = key();
    for (let i = 0; i < budget.max; i += 1) {
      expect((await attempt(k, budget)).allowed).toBe(true);
    }
    expect((await attempt(k, budget)).allowed).toBe(false);
  });

  it("gives the budget back when the password was right", async () => {
    const k = key();
    for (let i = 0; i < budget.max + 2; i += 1) await attempt(k, budget);
    await clearAttempts(k);
    expect((await attempt(k, budget)).allowed).toBe(true);
  });

  it("counts two keys apart, so one account cannot lock out another", async () => {
    const a = key();
    const b = key();
    for (let i = 0; i < budget.max + 1; i += 1) await attempt(a, budget);
    expect((await attempt(b, budget)).allowed).toBe(true);
  });

  it("rolls the window over once it has expired", async () => {
    const k = key();
    const instant = { max: 1, windowMs: -1 }; // a window that is already over
    expect((await attempt(k, instant)).allowed).toBe(true);
    expect((await attempt(k, instant)).allowed).toBe(true);
  });

  it("holds the count in Postgres, so a restart cannot reset someone's budget", async () => {
    const k = key();
    for (let i = 0; i < budget.max + 1; i += 1) await attempt(k, budget);
    const [row] = await db
      .select()
      .from(authThrottle)
      .where(eq(authThrottle.key, k));
    expect(row?.count).toBe(budget.max + 1);
  });

  it("says when to come back, in minutes", () => {
    expect(retryMessage(30)).toContain("a minute");
    expect(retryMessage(400)).toContain("7 minutes");
  });

  it("purges windows that are long gone", async () => {
    await expect(purgeExpiredAttempts()).resolves.not.toThrow();
  });
});

describe("configuration check", () => {
  const good: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://owner@h/db",
    APP_DATABASE_URL: "postgres://app_user@h/db",
    ROOT_DOMAIN: "school.example",
    PLATFORM_ADMIN_PASSWORD: "a-long-enough-password",
    APP_USER_PASSWORD: "a-long-enough-role-password",
  };

  it("passes a sound configuration", () => {
    expect(configProblems(good)).toEqual([]);
  });

  it("catches the dangerous one: no app_user, so no row-level security", () => {
    const { APP_DATABASE_URL: _omitted, ...without } = good;
    expect(configProblems(without).map((p) => p.key)).toContain("APP_DATABASE_URL");
  });

  it("catches app_user pointed at the owner connection", () => {
    const same = { ...good, APP_DATABASE_URL: good.DATABASE_URL };
    expect(configProblems(same).map((p) => p.key)).toContain("APP_DATABASE_URL");
  });

  it("catches the example admin password and a short one", () => {
    expect(configProblems({ ...good, PLATFORM_ADMIN_PASSWORD: "admin12345" })).not.toEqual([]);
    expect(configProblems({ ...good, PLATFORM_ADMIN_PASSWORD: "short" })).not.toEqual([]);
  });

  it("objects to the app role keeping its default password", () => {
    const { APP_USER_PASSWORD: _unset, ...without } = good;
    expect(configProblems(without).map((p) => p.key)).toContain("APP_USER_PASSWORD");
    expect(
      configProblems({ ...good, APP_USER_PASSWORD: "app_user" }).map((p) => p.key),
    ).toContain("APP_USER_PASSWORD");
    expect(
      configProblems({ ...good, APP_USER_PASSWORD: "tooshort" }).map((p) => p.key),
    ).toContain("APP_USER_PASSWORD");
  });

  it("does not need a bucket: with none, logos are kept in the database", () => {
    expect(configProblems(good)).toEqual([]);
    expect(configProblems({ ...good, S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k" })).toEqual([]);
  });

  it("catches a half-configured provider, which would send nothing", () => {
    const half = { ...good, EMAIL_API_KEY: "k" };
    expect(configProblems(half).map((p) => p.key)).toContain("EMAIL_API_KEY");
  });

  it("refuses to start in production and only warns in development", () => {
    const bad: NodeJS.ProcessEnv = { ...good, ROOT_DOMAIN: "", NODE_ENV: "production" };
    expect(() => assertConfig(bad)).toThrow(/Refusing to start/);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertConfig({ ...bad, NODE_ENV: "development" })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("the scheduled runner", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("refuses every caller when no secret is configured", () => {
    expect(authorizeCron("Bearer anything")).toBe(false);
    expect(authorizeCron(null)).toBe(false);
  });

  it("accepts the secret, with or without the Bearer prefix, and nothing else", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(authorizeCron("Bearer s3cret-value")).toBe(true);
    expect(authorizeCron("s3cret-value")).toBe(true);
    expect(authorizeCron("Bearer s3cret-valuf")).toBe(false);
    expect(authorizeCron("Bearer s3cret")).toBe(false);
  });

  it("runs every job and reports what it did", async () => {
    const report = await runScheduledJobs();
    expect(report.errors).toEqual([]);
    expect(report).toMatchObject({
      invoicesIssued: expect.any(Number),
      schoolsPastDue: expect.any(Number),
      eventsProcessed: expect.any(Number),
    });
  });

  it("is safe to run twice — the second pass issues no second invoice", async () => {
    await runScheduledJobs();
    const second = await runScheduledJobs();
    expect(second.invoicesIssued).toBe(0);
    expect(second.errors).toEqual([]);
  });
});

describe("delivery", () => {
  afterEach(() => {
    for (const k of ["EMAIL_API_URL", "EMAIL_API_KEY", "EMAIL_BODY_TEMPLATE", "EMAIL_FROM"]) {
      delete process.env[k];
    }
    vi.unstubAllGlobals();
  });

  it("holds the message when no provider is configured", async () => {
    expect(await send({ channel: "email", to: "a@b.test", body: "hi" })).toEqual({
      status: "held",
    });
  });

  it("escapes the message into the provider's JSON", () => {
    const filled = fillTemplate('{"text":"{{body}}"}', { body: 'he said "hi"\nbye' });
    expect(() => JSON.parse(filled)).not.toThrow();
    expect(JSON.parse(filled).text).toBe('he said "hi"\nbye');
  });

  it("posts to the provider and reports it sent", async () => {
    process.env.EMAIL_API_URL = "https://provider.test/send";
    process.env.EMAIL_API_KEY = "key";
    process.env.EMAIL_BODY_TEMPLATE = '{"to":"{{to}}","text":"{{body}}"}';
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await send({ channel: "email", to: "a@b.test", body: "hi" })).toEqual({
      status: "sent",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ to: "a@b.test", text: "hi" });
  });

  it("records why the provider refused, rather than losing it", async () => {
    process.env.EMAIL_API_URL = "https://provider.test/send";
    process.env.EMAIL_API_KEY = "key";
    process.env.EMAIL_BODY_TEMPLATE = '{"to":"{{to}}"}';
    vi.stubGlobal("fetch", async () => new Response("no credit", { status: 402 }));

    const outcome = await send({ channel: "email", to: "a@b.test", body: "hi" });
    expect(outcome.status).toBe("failed");
    expect(outcome.error).toContain("402");
    expect(outcome.error).toContain("no credit");
  });

  it("treats a provider that never answers as a failure, not a hang", async () => {
    process.env.EMAIL_API_URL = "https://provider.test/send";
    process.env.EMAIL_API_KEY = "key";
    process.env.EMAIL_BODY_TEMPLATE = "{}";
    vi.stubGlobal("fetch", async () => {
      throw new Error("ETIMEDOUT");
    });
    expect((await send({ channel: "email", to: "a@b.test", body: "hi" })).status).toBe("failed");
  });

  it("never sends an in-app notification out of the building", async () => {
    process.env.EMAIL_API_URL = "https://provider.test/send";
    process.env.EMAIL_API_KEY = "key";
    process.env.EMAIL_BODY_TEMPLATE = "{}";
    expect(await send({ channel: "inapp", to: "user", body: "hi" })).toEqual({ status: "held" });
  });
});

/**
 * A guard against the mistake that hid every school's invoice and message from
 * the platform admin: reading a tenant table through the plain `db` handle.
 * Row-level security answers with nothing, no error is raised, and the page
 * renders an empty table that looks like the truth.
 */
describe("the admin screens read through withPlatform", () => {
  it("never selects a tenant table through the plain db handle", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { TENANT_TABLES, NULLABLE_TENANT_TABLES } = await import("@/db/rls");

    const camel = (t: string) => t.replace(/_(.)/g, (_, c: string) => c.toUpperCase());
    const guarded = new Set([...TENANT_TABLES, ...NULLABLE_TENANT_TABLES].map(camel));

    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });

    const offenders: string[] = [];
    for (const file of walk("src/app/admin").filter((f) => /\.tsx?$/.test(f))) {
      const source = readFileSync(file, "utf8");
      for (const [, table] of source.matchAll(/\bdb\s*\n?\s*\.select\([\s\S]{0,200}?\.from\((\w+)\)/g)) {
        if (guarded.has(table)) offenders.push(`${file} reads ${table} without withPlatform`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
