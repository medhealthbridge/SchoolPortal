import { desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { auditLog } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { Section, Table } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const { school } = await requirePermission("audit.view");
  const rows = await withTenant(school.id, (tx) =>
    tx
      .select()
      .from(auditLog)
      .where(eq(auditLog.schoolId, school.id))
      .orderBy(desc(auditLog.at))
      .limit(200),
  );

  return (
    <Section title="Audit log" subtitle="Every change and every sensitive view, newest first.">
      <Table head={["When", "Who", "Action", "Entity"]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="py-2 pr-5 whitespace-nowrap tabular-nums">
              {r.at.toLocaleString("en-PH")}
            </td>
            <td className="py-2 pr-5">{r.actorLabel}</td>
            <td className="py-2 pr-5">{readableAction(r.action)}</td>
            <td className="py-2 pr-5 text-xs text-[var(--ink-soft)]">
              {r.entity ? `${r.entity} ${r.entityId?.slice(0, 8) ?? ""}` : "—"}
            </td>
          </tr>
        ))}
      </Table>
    </Section>
  );
}

/** `attendance.superseded` reads as "Attendance superseded" in a log people scan. */
function readableAction(action: string) {
  const words = action.replace(/[._]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
