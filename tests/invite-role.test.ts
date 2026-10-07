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
});
