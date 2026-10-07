import { requirePermission } from "@/lib/guard";
import TodayClasses from "./today";

export const metadata = { title: "Take attendance" };

export default async function AttendancePage() {
  await requirePermission("attendance.take");
  return <TodayClasses />;
}
