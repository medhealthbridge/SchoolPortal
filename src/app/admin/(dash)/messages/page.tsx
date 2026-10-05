import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { outboundMessages, schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { EmptyState, PageHeader, Pill, Section, Table } from "@/components/ui";

export const metadata = { title: "Outbox" };

export default async function MessagesPage() {
  await requireAdmin();
  const rows = await db
    .select({ message: outboundMessages, school: schools })
    .from(outboundMessages)
    .leftJoin(schools, eq(schools.id, outboundMessages.schoolId))
    .orderBy(desc(outboundMessages.sentAt))
    .limit(100);

  return (
    <>
      <PageHeader
        title="Outbox"
        meta="Everything the platform sent. A mail provider and an SMS gateway drop in behind the same call."
      />
      <Section title="Recent messages" flush={rows.length > 0}>
        {rows.length === 0 ? (
          <EmptyState title="Nothing sent yet">
            Verification codes, invites, absence alerts and invoice reminders all land here.
          </EmptyState>
        ) : (
          <Table head={["When", "Channel", "School", "To", "Message"]} minWidth={820}>
            {rows.map(({ message, school }) => (
              <tr key={message.id}>
                <td className="whitespace-nowrap text-muted">
                  {message.sentAt.toLocaleString("en-PH")}
                </td>
                <td>
                  <Pill>{message.channel}</Pill>
                </td>
                <td>{school?.name ?? "—"}</td>
                <td className="text-muted">{message.toAddress}</td>
                <td className="max-w-[36ch] truncate">{message.body}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
