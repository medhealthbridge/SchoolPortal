import "../src/db/load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { platformAdmins } from "@/db/schema";
import { checkAdminSignIn } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/password";
import { generateTotpSecret, totp } from "@/lib/totp";

const PASSWORD = "a-long-test-password-9";
const stamp = Date.now().toString(36);
const emails = {
  enrolled: `enrolled-${stamp}@admin.test`,
  fresh: `fresh-${stamp}@admin.test`,
  racing: `racing-${stamp}@admin.test`,
};
const knownSecret = generateTotpSecret();

const signIn = (email: string, extra: { code?: string; enrolling?: string; password?: string } = {}) =>
  checkAdminSignIn({ email, password: extra.password ?? PASSWORD, code: extra.code ?? "", enrolling: extra.enrolling });

const stored = async (email: string) =>
  (await db.select().from(platformAdmins).where(eq(platformAdmins.email, email)))[0]!.totpSecret;

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  await db.insert(platformAdmins).values([
    { email: emails.enrolled, name: "Enrolled", passwordHash, totpSecret: knownSecret },
    { email: emails.fresh, name: "Fresh", passwordHash, totpSecret: null },
    { email: emails.racing, name: "Racing", passwordHash, totpSecret: null },
  ]);
});

afterAll(async () => {
  await db.delete(platformAdmins).where(inArray(platformAdmins.email, Object.values(emails)));
});

describe("an admin who already has an authenticator", () => {
  it("signs in with the password and a current code", async () => {
    const out = await signIn(emails.enrolled, { code: totp(knownSecret) });
    expect(out.kind).toBe("ok");
  });

  it("is refused a wrong code, a missing code and a wrong password, with different words only where it is safe", async () => {
    expect(await signIn(emails.enrolled, { code: "000000" })).toEqual({
      kind: "error",
      error: "That second-factor code is wrong.",
    });
    expect(await signIn(emails.enrolled, { code: "" })).toMatchObject({
      kind: "error",
      error: expect.stringMatching(/six-digit code/),
    });
    // Before the password is right, nothing about the second factor is revealed.
    expect(await signIn(emails.enrolled, { password: "wrong-password", code: "" })).toEqual({
      kind: "error",
      error: "That sign-in did not match.",
    });
    expect(await signIn("nobody@admin.test", { code: "123456" })).toEqual({
      kind: "error",
      error: "That sign-in did not match.",
    });
  });

  it("cannot be re-enrolled by handing the form a key of the caller's choosing", async () => {
    const attacker = generateTotpSecret();
    const out = await signIn(emails.enrolled, { enrolling: attacker, code: totp(attacker) });
    expect(out.kind).toBe("error"); // the stored key decides, not the submitted one
    expect(await stored(emails.enrolled)).toBe(knownSecret);
  });
});

describe("the first sign-in of a new admin", () => {
  it("shows a key to enrol, and only after the password was right", async () => {
    const wrong = await signIn(emails.fresh, { password: "wrong-password" });
    expect(wrong).toEqual({ kind: "error", error: "That sign-in did not match." });

    const out = await signIn(emails.fresh);
    expect(out.kind).toBe("enroll");
    if (out.kind !== "enroll") return;
    expect(out.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(out.uri).toContain(`secret=${out.secret}`);
    expect(out.uri).toContain(encodeURIComponent(emails.fresh));
    // Showing a key saves nothing: an abandoned first sign-in leaves no half-enrolment.
    expect(await stored(emails.fresh)).toBe(null);
  });

  it("keeps the same key when the code is wrong, so the one already in the app still works", async () => {
    const first = await signIn(emails.fresh);
    if (first.kind !== "enroll") throw new Error("expected enrolment");
    const retry = await signIn(emails.fresh, { enrolling: first.secret, code: "000000" });
    expect(retry).toMatchObject({ kind: "enroll", secret: first.secret, error: expect.stringMatching(/not right/) });
    expect(await stored(emails.fresh)).toBe(null);
  });

  it("replaces a key that is not the shape we generate, so a weak one cannot be installed", async () => {
    for (const enrolling of ["AAAA", "a".repeat(32), "!".repeat(32), "A".repeat(31), "A".repeat(33)]) {
      const out = await signIn(emails.fresh, { enrolling, code: "123456" });
      expect(out.kind).toBe("enroll");
      if (out.kind === "enroll") expect(out.secret).not.toBe(enrolling);
    }
    expect(await stored(emails.fresh)).toBe(null);
  });

  it("saves the key only once the code proves the app has it, then needs that code from then on", async () => {
    const first = await signIn(emails.fresh);
    if (first.kind !== "enroll") throw new Error("expected enrolment");

    const done = await signIn(emails.fresh, { enrolling: first.secret, code: totp(first.secret) });
    expect(done.kind).toBe("ok");
    expect(await stored(emails.fresh)).toBe(first.secret);

    // Now it behaves like any enrolled admin.
    expect((await signIn(emails.fresh, { code: totp(first.secret) })).kind).toBe("ok");
    expect((await signIn(emails.fresh, { code: "000000" })).kind).toBe("error");
    expect((await signIn(emails.fresh, { code: "" })).kind).toBe("error");
  });
});

describe("two first sign-ins at once", () => {
  it("lets the first key win and refuses to replace it", async () => {
    const a = await signIn(emails.racing);
    const b = await signIn(emails.racing);
    if (a.kind !== "enroll" || b.kind !== "enroll") throw new Error("expected enrolment");
    expect(a.secret).not.toBe(b.secret);

    const [first, second] = await Promise.all([
      signIn(emails.racing, { enrolling: a.secret, code: totp(a.secret) }),
      signIn(emails.racing, { enrolling: b.secret, code: totp(b.secret) }),
    ]);
    const oks = [first, second].filter((r) => r.kind === "ok");
    expect(oks).toHaveLength(1);
    const winner = first.kind === "ok" ? a.secret : b.secret;
    expect(await stored(emails.racing)).toBe(winner);
  });
});
