/** A small CSV reader: quoted fields, embedded commas and newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const clean = text.replace(/^﻿/, "");
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export type ImportIssue = { line: number; message: string };

/**
 * Maps a sheet onto named columns. Errors are collected rather than thrown, so
 * the whole file can be shown back before anything is saved.
 */
export function readSheet(text: string, required: string[]) {
  const rows = parseCsv(text);
  const issues: ImportIssue[] = [];
  if (rows.length === 0) return { header: [], records: [], issues: [{ line: 0, message: "The file is empty." }] };

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  for (const col of required) {
    if (!header.includes(col)) issues.push({ line: 1, message: `Missing column "${col}".` });
  }

  const records = rows.slice(1).map((cells, i) => {
    const record: Record<string, string> = { __line: String(i + 2) };
    header.forEach((key, idx) => (record[key] = (cells[idx] ?? "").trim()));
    return record;
  });

  return { header, records, issues };
}
