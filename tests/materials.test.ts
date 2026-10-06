import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { strToU8, unzipSync, zipSync } from "fflate";
import { withTenant } from "@/db";
import { sections, userRoles, users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { shrinkOfficeFile, isOfficeZip } from "@/lib/compress-office";
import { mayRemove, mayUpload, readableSections, safeName, typeOfFile, uploadTargets } from "@/lib/materials";
import { issueReset, mayResetFor, openReset, useReset } from "@/lib/password-reset";
import { verifyPassword } from "@/lib/password";
import { dropSchool, makeSchool } from "./helpers";

describe("shrinking an office file", () => {
  const deck = () =>
    zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "ppt/slides/slide1.xml": strToU8("<p:sld/>".repeat(50)),
      "ppt/media/image1.jpeg": new Uint8Array(400_000).fill(7),
      "ppt/media/image2.png": new Uint8Array(50_000).fill(3),
      "ppt/media/media1.mp4": new Uint8Array(300_000).fill(9),
    }, { level: 0 });

  it("shrinks the big pictures, leaves small ones and video alone, keeps every name", async () => {
    const seen: string[] = [];
    const out = await shrinkOfficeFile(deck(), async (bytes, kind) => {
      seen.push(`${kind}:${bytes.length}`);
      return bytes.slice(0, bytes.length / 4);
    });
    expect(seen).toEqual(["jpeg:400000"]);
    expect(out.pictures).toBe(1);
    const files = unzipSync(out.bytes);
    expect(Object.keys(files).sort()).toEqual([
      "[Content_Types].xml",
      "ppt/media/image1.jpeg",
      "ppt/media/image2.png",
      "ppt/media/media1.mp4",
      "ppt/slides/slide1.xml",
    ]);
    expect(files["ppt/media/image1.jpeg"]!.length).toBe(100_000);
    expect(files["ppt/media/media1.mp4"]!.length).toBe(300_000);
    expect(out.bytes.length).toBeLessThan(deck().length);
  });

  it("returns the original when nothing gets smaller, or the file is not a zip", async () => {
    const original = deck();
    const same = await shrinkOfficeFile(original, async (b) => b);
    expect(same.bytes).toBe(original);
    const broken = new Uint8Array([1, 2, 3]);
    expect((await shrinkOfficeFile(broken, async () => null)).bytes).toBe(broken);
  });

  it("knows which files it can shrink", () => {
    expect(isOfficeZip("Lesson 3.PPTX")).toBe(true);
    expect(isOfficeZip("handout.pdf")).toBe(false);
  });
});

describe("file names and types", () => {
  it("reads the type from the name", () => {
    expect(typeOfFile("Q1 Fractions.pptx")).toContain("presentationml");
    expect(typeOfFile("notes.PDF")).toBe("application/pdf");
    expect(typeOfFile("virus.exe")).toBeNull();
  });
  it("keeps a storage path safe", () => {
    expect(safeName("Aralin 1: Ang Pamilyá (final).pptx")).toBe("Aralin-1-Ang-Pamilya-final-.pptx");
    expect(safeName("../../etc/passwd")).not.toContain("/");
  });
});

describe("who shares and who opens materials", () => {
  let s: Awaited<ReturnType<typeof makeSchool>>;
  let otherSection: string;
  let stranger: string;
  beforeAll(async () => {
    s = await makeSchool();
    await withTenant(s.school.id, async (tx) => {
      const [b] = await tx
        .insert(sections)
        .values({ schoolId: s.school.id, schoolYearId: s.year.id, level: "Grade 7", name: "B" })
        .returning();
      otherSection = b!.id;
      const [u] = await tx
        .insert(users)
        .values({ schoolId: s.school.id, email: "x@t.test", name: "X", passwordHash: await hashPassword("password123") })
        .returning();
      await tx.insert(userRoles).values({ schoolId: s.school.id, userId: u!.id, role: "teacher" });
      stranger = u!.id;
    });
  });
  afterAll(async () => dropSchool(s.school.id));

  it("lets a teacher share only for the sections and subjects they teach", async () => {
    const r = await withTenant(s.school.id, async (tx) => ({
      own: await mayUpload(tx, s.school.id, { userId: s.teacher.id, roles: ["teacher"] }, s.section.id, s.subject.id),
      otherSection: await mayUpload(tx, s.school.id, { userId: s.teacher.id, roles: ["teacher"] }, otherSection, s.subject.id),
      stranger: await mayUpload(tx, s.school.id, { userId: stranger, roles: ["teacher"] }, s.section.id, s.subject.id),
      registrar: await mayUpload(tx, s.school.id, { userId: stranger, roles: ["registrar"] }, otherSection, s.subject.id),
      parent: await mayUpload(tx, s.school.id, { userId: s.parent.id, roles: ["parent"] }, s.section.id, s.subject.id),
      targets: await uploadTargets(tx, s.school.id, { userId: s.teacher.id, roles: ["teacher"] }),
    }));
    expect(r.own).toBe(true);
    expect(r.otherSection).toBe(false);
    expect(r.stranger).toBe(false);
    expect(r.registrar).toBe(true);
    expect(r.parent).toBe(false);
    expect(r.targets.map((t) => t.id)).toEqual([s.section.id]);
  });

  it("lets a parent open their child's section and no other", async () => {
    const sections_ = await withTenant(s.school.id, (tx) =>
      readableSections(tx, s.school.id, {
        sessionId: "x", userId: s.parent.id, schoolId: s.school.id, name: "P", email: null, roles: ["parent"], privacyConsentVersion: 1,
      }),
    );
    expect(sections_).toEqual([s.section.id]);
  });

  it("lets the uploader or the office take a material down", () => {
    expect(mayRemove({ userId: "a", roles: ["teacher"] }, "a")).toBe(true);
    expect(mayRemove({ userId: "b", roles: ["teacher"] }, "a")).toBe(false);
    expect(mayRemove({ userId: "b", roles: ["principal"] }, "a")).toBe(true);
  });
});

describe("password reset", () => {
  let s: Awaited<ReturnType<typeof makeSchool>>;
  beforeAll(async () => {
    s = await makeSchool();
  });
  afterAll(async () => dropSchool(s.school.id));

  it("sets a new password once, and the link then stops working", async () => {
    const r = await withTenant(s.school.id, async (tx) => {
      const token = await issueReset(tx, { schoolId: s.school.id, userId: s.parent.id, hours: 1 });
      const open = await openReset(tx, s.school.id, token);
      const used = await useReset(tx, s.school.id, token, "brand-new-pass");
      const again = await useReset(tx, s.school.id, token, "another-pass-1");
      const [u] = await tx.select().from(users).where(eq(users.id, s.parent.id));
      return { open, used, again, ok: await verifyPassword("brand-new-pass", u!.passwordHash) };
    });
    expect(r.open?.name).toBe("Parent");
    expect("userId" in r.used).toBe(true);
    expect("error" in r.again).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("refuses an expired link and a short password", async () => {
    const r = await withTenant(s.school.id, async (tx) => {
      const old = await issueReset(tx, { schoolId: s.school.id, userId: s.parent.id, hours: -1 });
      const fresh = await issueReset(tx, { schoolId: s.school.id, userId: s.parent.id, hours: 1 });
      return {
        expired: await openReset(tx, s.school.id, old),
        short: await useReset(tx, s.school.id, fresh, "short"),
      };
    });
    expect(r.expired).toBeNull();
    expect(r.short).toEqual({ error: "Use a password of at least 8 characters." });
  });

  it("lets each office reset only the accounts beneath it", async () => {
    const r = await withTenant(s.school.id, async (tx) => ({
      registrarParent: await mayResetFor(tx, s.school.id, { userId: "r", roles: ["registrar"] }, s.parent.id),
      registrarTeacher: await mayResetFor(tx, s.school.id, { userId: "r", roles: ["registrar"] }, s.teacher.id),
      principalTeacher: await mayResetFor(tx, s.school.id, { userId: "p", roles: ["principal"] }, s.teacher.id),
      principalParent: await mayResetFor(tx, s.school.id, { userId: "p", roles: ["principal"] }, s.parent.id),
      teacherParent: await mayResetFor(tx, s.school.id, { userId: s.teacher.id, roles: ["teacher"] }, s.parent.id),
      self: await mayResetFor(tx, s.school.id, { userId: s.parent.id, roles: ["school_admin"] }, s.parent.id),
    }));
    // The test teacher is also an adviser: a teaching account, which the registrar
    // may reset (staff.manage) as well as the principal.
    expect(r).toEqual({
      registrarParent: true,
      registrarTeacher: true,
      principalTeacher: true,
      principalParent: false,
      teacherParent: false,
      self: false,
    });
  });
});
