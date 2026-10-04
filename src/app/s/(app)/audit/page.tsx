import { desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { auditLog } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { Card, Table } from "@/components/ui";

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
    <Card title="Audit log" subtitle="Every change and every sensitive view, newest first.">
      <Table head={["When", "Who", "Action", "Entity"]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
              {r.at.toLocaleString("en-PH")}
            </td>
            <td className="py-2 pr-4">{r.actorLabel}</td>
            <td className="py-2 pr-4 font-mono text-xs">{r.action}</td>
            <td className="py-2 pr-4 text-xs text-black/60 dark:text-white/60">
              {r.entity ? `${r.entity} ${r.entityId?.slice(0, 8) ?? ""}` : "—"}
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
