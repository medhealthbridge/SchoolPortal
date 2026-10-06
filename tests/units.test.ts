import { describe, expect, it } from "vitest";
import { parseCsv, readSheet } from "@/lib/csv";
import { generateTotpSecret, totp, verifyTotp } from "@/lib/totp";
import { activationCode, hashPassword, verifyPassword } from "@/lib/password";
import { subdomainProblem } from "@/lib/tenant";
import { MODULES, MODULE_KEYS } from "@/lib/modules";
import { can, permissionsFor } from "@/lib/roles";

describe("csv import", () => {
  it("reads quoted fields, embedded commas and CRLF", () => {
    const rows = parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x,1", 'he said "hi"'],
    ]);
  });

  it("reports a missing column instead of guessing", () => {
    const { issues } = readSheet("student_number,first_name\n1,Ana\n", [
      "student_number",
      "first_name",
      "last_name",
    ]);
    expect(issues[0].message).toMatch(/last_name/);
  });

  it("numbers lines the way a spreadsheet does", () => {
    const { records } = readSheet("student_number\n7\n8\n", ["student_number"]);
    expect(records[0].__line).toBe("2");
    expect(records[1].__line).toBe("3");
  });
});

describe("second factor", () => {
  it("accepts the current code and rejects a stale one", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 300_000), now)).toBe(false);
  });

  it("tolerates one step of clock drift", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).toBe(true);
  });
});

describe("passwords and codes", () => {
  it("round-trips a password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });

  it("leaves look-alike characters out of activation codes", () => {
    const code = activationCode(200);
    expect(code).not.toMatch(/[01OIL]/);
  });
});

describe("subdomains", () => {
  it("blocks reserved words and bad shapes", () => {
    expect(subdomainProblem("admin")).toMatch(/reserved/i);
    expect(subdomainProblem("ab")).toMatch(/3 characters/);
    expect(subdomainProblem("St Mary")).toMatch(/lowercase/);
    expect(subdomainProblem("-stmary")).toMatch(/lowercase/);
    expect(subdomainProblem("stmary")).toBeNull();
  });
});

describe("module registry", () => {
  it("only core is always on", () => {
    expect(MODULE_KEYS.filter((k) => MODULES[k].alwaysOn)).toEqual(["core"]);
  });

  it("every event a module listens to is emitted by some module", () => {
    const emitted = new Set(MODULE_KEYS.flatMap((k) => MODULES[k].emits));
    for (const key of MODULE_KEYS) {
      for (const event of MODULES[key].listensTo) {
        if (event === "*") continue;
        expect(emitted.has(event), `${key} listens to ${event}`).toBe(true);
      }
    }
  });
});

describe("roles", () => {
  it("a teacher can take attendance but cannot manage users", () => {
    expect(can(["teacher"], "attendance.take")).toBe(true);
    expect(can(["teacher"], "users.manage")).toBe(false);
  });

  it("an adviser adds the whole section on top of teacher rights", () => {
    expect(can(["adviser"], "attendance.view_all")).toBe(true);
  });

  it("holding two roles unions their permissions", () => {
    const perms = permissionsFor(["teacher", "accounting"]);
    expect(perms.has("attendance.take")).toBe(true);
    expect(perms.has("accounting.manage")).toBe(true);
  });

  it("a parent reaches only their own children", () => {
    expect(can(["parent"], "attendance.view_own_children")).toBe(true);
    expect(can(["parent"], "students.view")).toBe(false);
  });
});

describe("addresses made from the school's name", () => {
  it("turns a name into an address", async () => {
    const { suggestSubdomain } = await import("@/lib/slug");
    expect(suggestSubdomain("St. Mary's Academy")).toBe("st-marys-academy");
    expect(suggestSubdomain("  Colegio de San José  ")).toBe("colegio-de-san-jose");
    expect(suggestSubdomain("Holy Child — Main #2")).toBe("holy-child-main-2");
    expect(suggestSubdomain("???")).toBe("");
  });

  it("never runs past the limit or ends in a hyphen", async () => {
    const { suggestSubdomain } = await import("@/lib/slug");
    const { subdomainProblem } = await import("@/lib/tenant");
    const long = suggestSubdomain("The Very Long Named Institute of Science and Technology and the Arts of Mindanao");
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith("-")).toBe(false);
    expect(subdomainProblem(long)).toBeNull();
  });

  it("builds a role's address at the school", async () => {
    const { roleAddress } = await import("@/lib/slug");
    expect(roleAddress("teacher", "st-marys", "schoolportal.example.com")).toBe(
      "teacher@st-marys.schoolportal.example.com",
    );
    expect(roleAddress("guidance_counselor", "demo", "lvh.me:3000")).toBe(
      "guidance-counselor@demo.lvh.me",
    );
  });
});
