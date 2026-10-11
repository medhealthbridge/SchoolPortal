import { requirePermission } from "@/lib/guard";
import { studentTemplateCsv } from "@/lib/student-profile";

/** The blank spreadsheet the registrar fills in, with one worked row. */
export async function GET() {
  await requirePermission("students.manage");
  return new Response(studentTemplateCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="students-template.csv"',
      "cache-control": "no-store",
    },
  });
}
