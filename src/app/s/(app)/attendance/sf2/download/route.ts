import { notFound } from "next/navigation";
import { withTenant } from "@/db";
import { requireModule, requireUser } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { monthKey } from "@/lib/format";
import { toPdf, toXlsx } from "@/lib/export/files";
import { sf2 } from "@/modules/attendance/sf2";
import { sf2Sections } from "@/modules/attendance/sf2-access";

export async function GET(req: Request) {
  await requireModule("attendance");
  const { school, session } = await requireUser();
  const q = new URL(req.url).searchParams;
  const sectionId = q.get("section") ?? "";
  const month = /^\d{4}-\d{2}$/.test(q.get("month") ?? "") ? q.get("month")! : monthKey();
  const format = q.get("format") === "pdf" ? "pdf" : "xlsx";

  const data = await withTenant(school.id, async (tx) => {
    const allowed = await sf2Sections(tx, school.id, session);
    if (!allowed.some((s) => s.id === sectionId)) return null;
    const sheet = await sf2(tx, school.id, sectionId, month);
    if (sheet)
      await audit(tx, {
        schoolId: school.id,
        actorUserId: session.userId,
        actorLabel: session.name,
        action: "export.downloaded",
        entity: "sf2",
        after: { sectionId, month, format },
      });
    return sheet;
  });
  if (!data) notFound();

  const columns = [
    { key: "name", label: "Learner" },
    { key: "lrn", label: "LRN" },
    ...data.days.map((d) => ({ key: d, label: String(Number(d.slice(8))) })),
    { key: "absent", label: "Absent" },
    { key: "tardy", label: "Tardy" },
  ];
  const rows: Record<string, string | number>[] = data.rows.map((r) => ({
    name: r.name,
    lrn: r.lrn ?? "",
    ...Object.fromEntries(data.days.map((d, i) => [d, r.days[i]])),
    absent: r.absent,
    tardy: r.tardy,
  }));
  rows.push({
    name: "Present that day",
    lrn: "",
    ...Object.fromEntries(data.days.map((d, i) => [d, data.dailyPresent[i]])),
    absent: "",
    tardy: "",
  });
  const title = `${school.name}: School Form 2 (SF2), ${data.section.level} ${data.section.name}, ${month}`;
  const name = `sf2-${data.section.level}-${data.section.name}-${month}`.replace(/[^\w-]+/g, "-");

  if (format === "pdf") {
    const pdf = await toPdf({
      title,
      subtitle: "P present · A absent · L late (tardy) · E excused · blank: no class marked",
      columns,
      rows,
      notes: ["", "Adviser: ______________________          School head: ______________________"],
    });
    return new Response(pdf as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const xlsx = toXlsx("SF2", columns, rows);
  return new Response(xlsx as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
