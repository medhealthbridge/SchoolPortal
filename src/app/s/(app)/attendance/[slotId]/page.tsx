import { requirePermission } from "@/lib/guard";
import TakeAttendance from "./take";

export const metadata = { title: "Class attendance" };

export default async function SlotPage({
  params,
  searchParams,
}: {
  params: Promise<{ slotId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  await requirePermission("attendance.take");
  const { slotId } = await params;
  const { date } = await searchParams;
  return <TakeAttendance slotId={slotId} date={date ?? new Date().toISOString().slice(0, 10)} />;
}
