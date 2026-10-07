import { desc } from "drizzle-orm";
import { acrossHomes, db } from "@/db";
import { outboundMessages, schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { Callout, EmptyState, PageHeader, Pill, Section, Table } from "@/components/ui";

export const metadata = { title: "Outbox" };

/** "Held" is not a failure — it is what every message does with no provider set. */
const LABEL: Record<string, string> = { held: "Held", sent: "Sent", failed: "Failed" };
const TONE: Record<string, "neutral" | "ok" | "danger"> = {
  held: "neutral",
  sent: "ok",
  failed: "danger",
};

const heldAll = (n: number) => (n === 1 ? "The one message here is held" : `All ${n} are held`);

export default async function MessagesPage() {
  await requireAdmin();
  // Platform-wide, not db: without it row-level security hands back only the
  // messages that belong to no school. A school with its own database keeps
  // its messages there, so every database is read.
  const sent = await acrossHomes((tx) =>
    tx.select().from(outboundMessages).orderBy(desc(outboundMessages.sentAt)).limit(100),
  );
  const named = new Map((await db.select().from(schools)).map((s) => [s.id, s]));
  const rows = sent
    .sort((a, b) => +b.sentAt - +a.sentAt)
    .slice(0, 100)
    .map((message) => ({ message, school: message.schoolId ? (named.get(message.schoolId) ?? null) : null }));

  const held = rows.filter((r) => r.message.status === "held").length;
  const failed = rows.filter((r) => r.message.status === "failed").length;

  return (
    <>
      <PageHeader
        title="Outbox"
        meta="Everything the platform sent, and everything it could not."
      />
      {held > 0 && (
        <Callout
          tone="warn"
          title={held === rows.length ? heldAll(held) : `${held} of the last ${rows.length} are held`}
        >
          No mail or SMS provider is configured, so these were written down and
          went no further. Set EMAIL_API_URL and SMS_API_URL to send them for
          real — .env.example has the two lines.
        </Callout>
      )}
      {failed > 0 && (
        <Callout tone="danger" title={`${failed} failed to send`}>
          The provider refused them. The reason is on each row.
        </Callout>
      )}
      <Section title="Recent messages" flush={rows.length > 0}>
        {rows.length === 0 ? (
          <EmptyState title="Nothing sent yet">
            Verification codes, invites, absence alerts and invoice reminders all land here.
          </EmptyState>
        ) : (
          <Table head={["When", "Channel", "School", "To", "Message", "Sent"]} minWidth={940}>
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
                <td className="max-w-[32ch] truncate">{message.body}</td>
                <td>
                  <Pill tone={TONE[message.status] ?? "neutral"}>
                    {message.status === "failed" && message.error
                      ? `Failed: ${message.error.slice(0, 40)}`
                      : LABEL[message.status] ?? message.status}
                  </Pill>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
