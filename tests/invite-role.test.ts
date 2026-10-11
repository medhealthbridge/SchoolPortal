import "../src/db/load-env";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { invites } from "@/db/schema";
import { dropSchool, makeSchool } from "./helpers";

const made: string[] = [];
let current: { school: unknown; session: unknown } | null = null;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/guard", () => ({ requirePermission: async () => current }));
// acceptInvite reads the school from the request's headers, which a unit test
// has none of; everything else in the module stays real.
vi.mock("@/lib/session", async (actual) => ({
  ...(await actual<typeof import("@/lib/session")>()),
  currentSchool: async () => current?.school ?? null,
}));

afterAll(async () => {
  for (const id of made) await dropSchool(id);
});

describe("inviting staff", () => {
  it("refuses a role that does not exist instead of failing in the database", async () => {
    const t = await makeSchool();
    made.push(t.school.id);
    current = {
      school: t.school,
      session: { userId: t.teacher.id, name: "Admin", roles: ["school_admin"], schoolId: t.school.id },
    };
    const { inviteStaff } = await import("@/app/s/(app)/setup/actions");
    const form = new FormData();
    form.set("email", "x@example.test");
    form.set("name", "X");
    form.set("role", "superuser");
    const out = await inviteStaff(null, form);
    expect(out?.error).toMatch(/role/i);
    const rows = await withTenant(t.school.id, (tx) => tx.select().from(invites).where(eq(invites.email, "x@example.test")));
    expect(rows).toHaveLength(0);
  });

  /**
   * Claiming the address of an invite still waiting would make this account
   * the "existing" one when that invite is accepted, handing over the role it
   * carries — the principal's school_admin lands on the teacher's account.
   */
  it("refuses an email that another invite is still waiting on", async () => {
    const t = await makeSchool();
    made.push(t.school.id);
    current = {
      school: t.school,
      session: { userId: t.teacher.id, name: "Admin", roles: ["school_admin"], schoolId: t.school.id },
    };
    const { inviteStaff, acceptInvite } = await import("@/app/s/(app)/setup/actions");

    for (const [email, name, role] of [
      ["boss@example.test", "The Principal", "principal"],
      ["ana@example.test", "Ana", "teacher"],
    ]) {
      const form = new FormData();
      form.set("email", email);
      form.set("name", name);
      form.set("role", role);
      expect((await inviteStaff(null, form))?.error).toBeUndefined();
    }

    const [ana] = await withTenant(t.school.id, (tx) =>
      tx.select().from(invites).where(eq(invites.email, "ana@example.test")),
    );
    const out = await acceptInvite(ana.token, "Ana", "a-long-password", "boss@example.test");
    expect("error" in out && out.error).toMatch(/spoken for/i);

    // Her own address still works.
    const ok = await acceptInvite(ana.token, "Ana", "a-long-password", "ana@example.test");
    expect("userId" in ok && ok.userId).toBeTruthy();
  });
});
