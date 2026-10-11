import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { safeCell, toCsv, toPdf, toXlsx } from "@/lib/export/files";

const cols = [
  { key: "name", label: "Name" },
  { key: "note", label: "Note" },
  { key: "n", label: "Count" },
];

describe("csv", () => {
  it("uses the keys as headers, quotes what needs it, and opens in Excel as UTF-8", () => {
    const out = toCsv(cols, [{ name: 'Dela "Cruz", Ma.', note: "Peña\nline two", n: 3 }]);
    expect(out.startsWith("﻿name,note,count".replace("count", "n"))).toBe(true);
    expect(out).toContain('"Dela ""Cruz"", Ma."');
    expect(out).toContain('"Peña\nline two"');
  });

  it("stops a typed formula from running when the file is opened", () => {
    expect(safeCell("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(safeCell("@SUM(1)")).toBe("'@SUM(1)");
    expect(safeCell("-1+cmd|' /c calc'!A1")).toBe("'-1+cmd|' /c calc'!A1");
    expect(safeCell("+63 917 123 4567")).toBe("+63 917 123 4567");
    expect(safeCell("-12.5")).toBe("-12.5");
    expect(safeCell("Maria")).toBe("Maria");
  });
});

describe("xlsx", () => {
  it("is a zip with a workbook, a styled header and the rows as text and numbers", () => {
    const bytes = toXlsx("Students", cols, [
      { name: "A & B <c>", note: null, n: 7 },
      { name: "Z", note: "x", n: 2 },
    ]);
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("A &amp; B &lt;c&gt;");
    expect(sheet).toContain('<c r="C2"><v>7</v></c>');
    expect(sheet).toContain('<autoFilter ref="A1:C3"/>');
    expect(strFromU8(files["xl/workbook.xml"])).toContain('name="Students"');
  });

  it("writes a header-only sheet for a blank template", () => {
    const sheet = strFromU8(unzipSync(toXlsx("Blank", cols, []))["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("Name");
    expect(sheet).not.toContain("autoFilter");
  });

  it("keeps a sheet name Excel will accept", () => {
    const wb = strFromU8(unzipSync(toXlsx("A/B:C*?[x]" + "y".repeat(40), cols, []))["xl/workbook.xml"]);
    const name = /name="([^"]*)"/.exec(wb)![1];
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[\\/?*[\]:]/);
  });
});

describe("pdf", () => {
  it("makes a readable document with a header on every page", async () => {
    const rows = Array.from({ length: 140 }, (_, i) => ({ name: `Student ${i}`, note: "ñ ä 日本", n: i }));
    const bytes = await toPdf({ title: "Class list", subtitle: "Printed today", columns: cols, rows });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(2);
  });

  it("goes landscape for a wide table and survives a blank template", async () => {
    const wide = Array.from({ length: 8 }, (_, i) => ({ key: `c${i}`, label: `Column ${i}` }));
    const doc = await PDFDocument.load(await toPdf({ title: "Blank", columns: wide, rows: [] }));
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
  });

  it("does not choke on a word wider than its column", async () => {
    const bytes = await toPdf({
      title: "Long",
      columns: cols,
      rows: [{ name: "x".repeat(400), note: "", n: 1 }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
