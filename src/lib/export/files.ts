/**
 * Writers for the three download formats. Each takes plain columns and rows,
 * so a screen's data reaches a spreadsheet or a printable page the same way.
 *
 * Excel is written by hand (a zip of five small XML parts) and the PDF with
 * pdf-lib, which keeps both dependencies small and neither needs a font file
 * or a native binary on the server.
 */
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type ExportColumn = { key: string; label: string };
export type ExportRow = Record<string, string | number | null | undefined>;

const text = (v: ExportRow[string]) => (v === null || v === undefined ? "" : String(v));

/* ---------------------------------------------------------------- CSV */

/**
 * A cell that starts with = or @ is a formula to Excel, and a school's data
 * includes things people typed. Prefix those so they open as text. A phone
 * number may start with + and a signed number with -, so those pass.
 */
export function safeCell(raw: string) {
  if (/^[=@\t\r]/.test(raw)) return `'${raw}`;
  if (/^[+-]/.test(raw) && !/^[+-]?[\d(][\d\s().-]*$/.test(raw)) return `'${raw}`;
  return raw;
}

function csvCell(v: string) {
  const s = safeCell(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Headers are the column keys, so a downloaded template re-imports as it is. */
export function toCsv(columns: ExportColumn[], rows: ExportRow[]) {
  const head = columns.map((c) => csvCell(c.key)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(text(r[c.key]))).join(","));
  // The byte-order mark is what makes Excel read Filipino names as UTF-8.
  return `﻿${[head, ...body].join("\r\n")}\r\n`;
}

/* --------------------------------------------------------------- XLSX */

const xml = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function columnName(i: number) {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Excel limits a sheet name to 31 characters and a few symbols. */
const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1";

export function toXlsx(title: string, columns: ExportColumn[], rows: ExportRow[]): Uint8Array {
  const widths = columns.map((c) => {
    const longest = Math.max(c.label.length, ...rows.slice(0, 200).map((r) => text(r[c.key]).length));
    return Math.min(Math.max(longest + 2, 8), 48);
  });

  const cell = (ref: string, v: string | number, style = 0) =>
    typeof v === "number" && Number.isFinite(v)
      ? `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;

  const head = `<row r="1">${columns.map((c, i) => cell(`${columnName(i)}1`, c.label, 1)).join("")}</row>`;
  const body = rows
    .map((r, ri) => {
      const cells = columns
        .map((c, ci) => {
          const raw = r[c.key];
          const ref = `${columnName(ci)}${ri + 2}`;
          return typeof raw === "number" ? cell(ref, raw) : cell(ref, text(raw));
        })
        .join("");
      return `<row r="${ri + 2}">${cells}</row>`;
    })
    .join("");

  const last = `${columnName(Math.max(columns.length - 1, 0))}${rows.length + 1}`;
  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${head}${body}</sheetData>` +
    (rows.length > 0 ? `<autoFilter ref="A1:${last}"/>` : "") +
    `</worksheet>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName(title))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F4F5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  };
  return zipSync(files);
}

/* ---------------------------------------------------------------- PDF */

/** Helvetica carries Latin-1 only; anything else prints as a question mark. */
function printable(font: PDFFont, s: string) {
  let out = "";
  for (const ch of s.replace(/[\r\n\t]+/g, " ")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, s: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (w: string) => {
    // A single word wider than the column is broken, not allowed to overflow.
    let word = w;
    while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
      let n = word.length - 1;
      while (n > 1 && font.widthOfTextAtSize(word.slice(0, n), size) > width) n--;
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, n));
      word = word.slice(n);
    }
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  };
  for (const w of s.split(" ")) if (w !== "") push(w);
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

export async function toPdf(opts: {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  /** Lines printed under the table: a legend, signatures. */
  notes?: string[];
}): Promise<Uint8Array> {
  const { columns, rows } = opts;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const landscape = columns.length > 5;
  const [pw, ph] = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const margin = 36;
  const size = 8;
  const lead = 11;
  const pad = 4;
  const usable = pw - margin * 2;

  // Width follows the content, within limits, so an ID column stays narrow and
  // an address column gets room.
  const want = columns.map((c) => {
    const lens = rows.slice(0, 300).map((r) => text(r[c.key]).length).sort((a, b) => a - b);
    const longest = lens.length > 0 ? lens[lens.length - 1] : 0;
    // A short column (an ID, a date) gets exactly what it needs; a long one
    // (an address) is sized by its typical row so one outlier cannot take the page.
    const typical = longest <= 24 ? longest : lens[Math.floor(lens.length * 0.9)];
    return Math.min(Math.max(c.label.length, typical, 6), 40);
  });
  const total = want.reduce((a, b) => a + b, 0);
  const widths = want.map((w) => (w / total) * usable);

  const cells = rows.map((r) =>
    columns.map((c, i) =>
      wrap(font, printable(font, text(r[c.key])), size, Math.max(widths[i] - pad * 2, 10)),
    ),
  );
  const headCells = columns.map((c, i) =>
    wrap(bold, printable(bold, c.label), size, Math.max(widths[i] - pad * 2, 10)),
  );

  const pages: ReturnType<typeof doc.addPage>[] = [];
  let page = doc.addPage([pw, ph]);
  pages.push(page);
  let y = ph - margin;

  page.drawText(printable(bold, opts.title), { x: margin, y: y - 14, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 22;
  if (opts.subtitle) {
    page.drawText(printable(font, opts.subtitle), { x: margin, y: y - 9, size: 9, font, color: rgb(0.42, 0.42, 0.45) });
    y -= 16;
  }
  y -= 8;

  const drawRow = (lines: string[][], header: boolean) => {
    const h = Math.max(...lines.map((l) => l.length)) * lead + pad * 2 - 2;
    if (y - h < margin + 18) {
      page = doc.addPage([pw, ph]);
      pages.push(page);
      y = ph - margin;
      drawRow(headCells, true);
    }
    if (header)
      page.drawRectangle({ x: margin, y: y - h, width: usable, height: h, color: rgb(0.957, 0.957, 0.961) });
    let x = margin;
    lines.forEach((l, i) => {
      l.forEach((ln, li) =>
        page.drawText(ln, {
          x: x + pad,
          y: y - pad - size - li * lead + 1,
          size,
          font: header ? bold : font,
          color: rgb(0.1, 0.1, 0.1),
        }),
      );
      x += widths[i];
    });
    y -= h;
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + usable, y },
      thickness: 0.5,
      color: rgb(0.88, 0.88, 0.9),
    });
  };

  drawRow(headCells, true);
  if (cells.length === 0) {
    page.drawText("No rows. Fill this in by hand or by spreadsheet.", {
      x: margin + pad,
      y: y - 18,
      size: 9,
      font,
      color: rgb(0.42, 0.42, 0.45),
    });
  }
  for (const row of cells) drawRow(row, false);

  for (const note of opts.notes ?? []) {
    for (const ln of wrap(font, printable(font, note), 9, usable)) {
      if (y - 14 < margin + 18) {
        page = doc.addPage([pw, ph]);
        pages.push(page);
        y = ph - margin;
      }
      y -= 14;
      page.drawText(ln, { x: margin, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
    }
  }

  pages.forEach((p, i) =>
    p.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: pw - margin - 60,
      y: margin - 14,
      size: 8,
      font,
      color: rgb(0.42, 0.42, 0.45),
    }),
  );

  return doc.save();
}
