import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { outboundMessages, schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { Card, Table } from "@/components/ui";

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
    <Card
      title="Outbox"
      subtitle="Everything the platform sent. A mail provider and an SMS gateway drop in behind the same call."
    >
      <Table head={["When", "Channel", "School", "To", "Message"]}>
        {rows.map(({ message, school }) => (
          <tr key={message.id}>
            <td className="py-2 pr-4 whitespace-nowrap text-xs tabular-nums">
              {message.sentAt.toLocaleString("en-PH")}
            </td>
            <td className="py-2 pr-4">{message.channel}</td>
            <td className="py-2 pr-4">{school?.name ?? "—"}</td>
            <td className="py-2 pr-4 text-xs">{message.toAddress}</td>
            <td className="py-2 pr-4 text-xs">{message.body}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
