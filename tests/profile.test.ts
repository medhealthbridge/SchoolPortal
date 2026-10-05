import { describe, expect, it } from "vitest";
import { PROFILE_LIMITS, parseProfile } from "@/lib/profile";
import { initialsOf, readableOn } from "@/lib/brand";

const ok = { name: "St. Mary Academy", address: "", phone: "", primaryColor: "#2f557f" };
const value = (input: Parameters<typeof parseProfile>[0]) => {
  const r = parseProfile(input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const error = (input: Parameters<typeof parseProfile>[0]) => {
  const r = parseProfile(input);
  return r.ok ? null : r.error;
};

describe("the school's name", () => {
  it("is required, and a row of spaces is not a name", () => {
    expect(error({ ...ok, name: "" })).toMatch(/needs a name/);
    expect(error({ ...ok, name: "    " })).toMatch(/needs a name/);
    expect(error({ ...ok, name: undefined })).toMatch(/needs a name/);
  });

  it("is tidied, so a pasted line break cannot reach the badge or an invoice", () => {
    expect(value({ ...ok, name: "  St.   Mary\n Academy " }).name).toBe("St. Mary Academy");
  });

  it("stops at the limit and says what it is", () => {
    expect(error({ ...ok, name: "x".repeat(PROFILE_LIMITS.name + 1) })).toMatch(/120/);
    expect(value({ ...ok, name: "x".repeat(PROFILE_LIMITS.name) }).name).toHaveLength(120);
  });
});

describe("the address", () => {
  it("is optional, and empty is stored as nothing rather than as an empty string", () => {
    expect(value(ok).address).toBe(null);
    expect(value({ ...ok, address: "   " }).address).toBe(null);
  });

  it("keeps what was typed, on one line", () => {
    expect(value({ ...ok, address: "Rizal Ave,\nSan Roque,  Cebu City" }).address).toBe(
      "Rizal Ave, San Roque, Cebu City",
    );
  });

  it("stops at the limit", () => {
    expect(error({ ...ok, address: "x".repeat(PROFILE_LIMITS.address + 1) })).toMatch(/240/);
  });
});

describe("the phone number", () => {
  it("accepts the shapes Philippine numbers are actually written in", () => {
    for (const phone of [
      "+63 917 000 0001",
      "0917-000-0001",
      "(02) 8123 4567",
      "(032) 255 0142",
      "+63 (2) 8123-4567",
      "8123 4567",
    ]) {
      expect(value({ ...ok, phone }).phone).toBe(phone);
    }
  });

  it("is optional", () => {
    expect(value({ ...ok, phone: "" }).phone).toBe(null);
  });

  it("refuses letters, a lone digit, and a number too long to be one", () => {
    for (const phone of ["call the office", "1", "12345", "+63 917 000 0001 ext. 4", "1".repeat(16)]) {
      expect(error({ ...ok, phone }), phone).toMatch(/phone number/);
    }
  });

  it("refuses markup, which a phone field has no reason to carry", () => {
    expect(error({ ...ok, phone: "<script>1</script>" })).toMatch(/phone number/);
  });
});

describe("the brand colour", () => {
  it("is stored as upper-case #RRGGBB whatever case it arrived in", () => {
    expect(value({ ...ok, primaryColor: "#2f557f" }).primaryColor).toBe("#2F557F");
    expect(value({ ...ok, primaryColor: " #AbCdEf " }).primaryColor).toBe("#ABCDEF");
  });

  it("refuses anything else, including CSS, which would end up in a style attribute", () => {
    for (const primaryColor of [
      "",
      "red",
      "#fff",
      "#12345",
      "#1234567",
      "2f557f",
      "#2f557f; background: url(//evil)",
      "var(--x)",
    ]) {
      expect(error({ ...ok, primaryColor }), primaryColor).toMatch(/colour/);
    }
  });
});

describe("what the colour does to the badge", () => {
  it("switches the letters between light and dark so they stay readable", () => {
    expect(readableOn("#FFFFFF")).toBe("#0A0A0A");
    expect(readableOn("#FFE9A8")).toBe("#0A0A0A");
    expect(readableOn("#000000")).toBe("#FFFFFF");
    expect(readableOn("#2F557F")).toBe("#FFFFFF");
  });

  it("makes initials from the first two words", () => {
    expect(initialsOf("St. Mary Academy")).toBe("SM");
    expect(initialsOf("Northgate")).toBe("N");
    expect(initialsOf("  holy   trinity  academy ")).toBe("HT");
    expect(initialsOf("")).toBe("");
  });
});
