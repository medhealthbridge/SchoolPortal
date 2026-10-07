import { desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { auditLog } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { EmptyState, PageHeader, Section, Table } from "@/components/ui";
import { ExportPanel } from "@/components/export-panel";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const { school, session } = await requirePermission("audit.view");
  const rows = await withTenant(school.id, (tx) =>
    tx
      .select()
      .from(auditLog)
      .where(eq(auditLog.schoolId, school.id))
      .orderBy(desc(auditLog.at))
      .limit(200),
  );

  return (
    <>
      <PageHeader title="Audit log" meta={`${rows.length} most recent entries`} />
      <Section
        flush={rows.length > 0}
        title="Every change and every sensitive view"
        subtitle="Newest first. Entries are never edited or removed."
      >
      {rows.length === 0 ? (
        <EmptyState title="Nothing logged yet">
          Every write lands here the moment someone makes one.
        </EmptyState>
      ) : (
      <Table head={["When", "Who", "What", "Record"]} minWidth={620}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap tabular-nums">
              {r.at.toLocaleString("en-PH")}
            </td>
            <td>{r.actorLabel}</td>
            <td>{readableAction(r.action)}</td>
            <td className="text-xs text-muted">
              {r.entity ? `${r.entity} ${r.entityId?.slice(0, 8) ?? ""}` : "—"}
            </td>
          </tr>
        ))}
      </Table>
      )}
      </Section>
      <ExportPanel dataset="audit" roles={session.roles} />
    </>
  );
}

/** `attendance.superseded` reads as "Attendance superseded" in a log people scan. */
function readableAction(action: string) {
  const words = action.replace(/[._]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
