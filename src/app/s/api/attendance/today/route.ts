import { NextResponse } from "next/server";
import { withTenant } from "@/db";
import { apiRequirePermission } from "@/lib/guard";
import { errorResponse, isoWeekday } from "@/lib/api";
import { slotsForTeacher } from "@/modules/attendance/queries";
import { todayIso } from "@/lib/format";

/**
 * What the teacher's phone downloads in the morning: today's timetable. The
 * class lists follow, one call per class, so a phone with ten classes does not
 * wait on one large response.
 */
export async function GET(req: Request) {
  try {
    const { school, session } = await apiRequirePermission("attendance.take");
    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? todayIso();
    const weekday = isoWeekday(date);

    const slots = await withTenant(school.id, (tx) =>
      slotsForTeacher(tx, school.id, session.userId, weekday),
    );
    return NextResponse.json({ date, weekday, slots });
  } catch (err) {
    return errorResponse(err);
  }
}
