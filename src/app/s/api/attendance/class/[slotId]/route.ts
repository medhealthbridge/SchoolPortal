import { NextResponse } from "next/server";
import { withTenant } from "@/db";
import { apiRequirePermission } from "@/lib/guard";
import { recordsForSlot, roster, slotDetail } from "@/modules/attendance/queries";
import { todayIso } from "@/lib/format";
import { errorResponse } from "@/lib/api";

/** One class: the roster, the seat plan and whatever is already marked. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ slotId: string }> },
) {
  try {
    const { school } = await apiRequirePermission("attendance.take");
    const { slotId } = await ctx.params;
    const date = new URL(req.url).searchParams.get("date") ?? todayIso();

    const data = await withTenant(school.id, async (tx) => {
      const detail = await slotDetail(tx, school.id, slotId);
      if (!detail) return null;
      const entries = await roster(tx, school.id, detail.slot.sectionId, detail.slot.roomId);
      const marked = await recordsForSlot(tx, school.id, slotId, date);
      return {
        slot: {
          id: detail.slot.id,
          subjectName: detail.subjectName,
          sectionLabel: `${detail.sectionLevel} ${detail.sectionName}`,
          roomName: detail.roomName,
          startsAt: detail.slot.startsAt,
          endsAt: detail.slot.endsAt,
        },
        roster: entries,
        marked: marked.map((m) => ({
          id: m.id,
          studentId: m.studentId,
          status: m.status,
          markedAt: m.markedAt.toISOString(),
        })),
        date,
      };
    });

    if (!data) return NextResponse.json({ error: "No such class." }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
