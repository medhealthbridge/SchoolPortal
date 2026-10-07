import { withTenant } from "@/db";
import { apiRequirePermission } from "@/lib/guard";
import { monthlyReport } from "@/modules/attendance/queries";
import { monthKey } from "@/lib/format";
import { errorResponse } from "@/lib/api";

/** The attendance report in the school's official format, as a file. */
export async function GET(req: Request) {
  try {
    const { school } = await apiRequirePermission("attendance.view_all");
    const url = new URL(req.url);
    const month = url.searchParams.get("month") ?? monthKey();
    const sectionId = url.searchParams.get("section") || undefined;

    const rows = await withTenant(school.id, (tx) =>
      monthlyReport(tx, school.id, month, sectionId),
    );

    const csv = [
      ["Student number", "Name", "Present", "Absent", "Late", "Excused"],
      ...rows.map((r) => [
        r.studentNumber,
        r.name,
        r.present,
        r.absent,
        r.late,
        r.excused,
      ]),
    ]
      .map((line) => line.map(csvCell).join(","))
      .join("\r\n");

    return new Response(`﻿${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="attendance-${school.subdomain}-${month}.csv"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
