import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequirePermission } from "@/lib/guard";
import { submitAttendance } from "@/modules/attendance/submit";
import { processEvents } from "@/lib/events";
import { errorResponse } from "@/lib/api";

const recordSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  slotId: z.string().uuid(),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["present", "absent", "late", "excused"]),
  note: z.string().max(500).nullish(),
  markedAt: z.string().datetime(),
});

const bodySchema = z.object({ records: z.array(recordSchema).max(500) });

/**
 * The sync queue's endpoint. Safe to call with the same batch again: an id the
 * server already has is ignored.
 */
export async function POST(req: Request) {
  try {
    const { school, session } = await apiRequirePermission("attendance.take");
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Malformed batch." }, { status: 400 });
    }

    const outcome = await submitAttendance(
      school.id,
      session.userId,
      session.name,
      parsed.data.records,
    );
    await processEvents(school.id);

    return NextResponse.json(outcome);
  } catch (err) {
    return errorResponse(err);
  }
}
