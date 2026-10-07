import { notFound } from "next/navigation";
import { withTenant } from "@/db";
import { requirePermission } from "@/lib/guard";
import { can } from "@/lib/roles";
import { audit } from "@/lib/audit";
import { EXPORTS, chooseColumns } from "@/lib/export/datasets";
import { toCsv, toPdf, toXlsx } from "@/lib/export/files";

const TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
} as const;

/**
 * One download route for every module. The dataset says what may be taken and
 * by whom; the query string says which columns, which format and whether the
 * file should be a blank template. Nothing here trusts the page that sent it:
 * the permission, the restricted columns and the school are all decided on
 * the server.
 */
export async function GET(req: Request, ctx: { params: Promise<{ dataset: string }> }) {
  const { dataset: key } = await ctx.params;
  const dataset = EXPORTS[key];
  if (!dataset) notFound();

  const { school, session } = await requirePermission(dataset.permission);
  const mayRestricted = dataset.restrictedPermission
    ? can(session.roles, dataset.restrictedPermission)
    : true;

  const q = new URL(req.url).searchParams;
  const format = (["xlsx", "pdf", "csv"] as const).find((f) => f === q.get("format")) ?? "xlsx";
  const blank = q.get("blank") === "1";
  const columns = chooseColumns(dataset, q.getAll("cols"), mayRestricted);
  const params = {
    from: q.get("from") ?? undefined,
    to: q.get("to") ?? undefined,
    withdrawn: q.get("withdrawn") === "1",
  };

  const rows = await withTenant(school.id, async (tx) => {
    const out = blank ? [] : await dataset.load(tx, school.id, params);
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "export.downloaded",
      entity: dataset.key,
      after: { format, blank, columns: columns.map((c) => c.key), rows: out.length },
    });
    return out;
  });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const name = `${dataset.key}${blank ? "-template" : `-${today}`}.${format}`;

  const cols = columns.map((c) => ({ key: c.key, label: c.label }));
  let body: BodyInit;
  if (format === "csv") body = toCsv(cols, rows);
  else if (format === "xlsx") body = toXlsx(dataset.title, cols, rows) as unknown as BodyInit;
  else {
    const range = params.from || params.to ? ` · ${params.from ?? "start"} to ${params.to ?? "today"}` : "";
    body = (await toPdf({
      title: `${dataset.title}${blank ? " (blank template)" : ""}`,
      subtitle: `${school.name} · ${today}${range}${blank ? "" : ` · ${rows.length.toLocaleString("en-PH")} rows`}`,
      columns: cols,
      rows,
    })) as unknown as BodyInit;
  }

  return new Response(body, {
    headers: {
      "content-type": TYPES[format],
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
