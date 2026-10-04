import { db, withTenant, type Tx } from "@/db";
import { outboundMessages } from "@/db/schema";

export type Channel = "email" | "sms" | "inapp";

export type OutboundMessage = {
  schoolId?: string | null;
  channel: Channel;
  to: string;
  subject?: string;
  body: string;
};

/**
 * The single seam for anything leaving the system. Swap the body of this
 * function for a mail provider and a Philippine SMS gateway; everything that
 * calls it — verification codes, invites, absence alerts, invoice reminders —
 * stays as it is. Until then every message lands in the outbox table, which is
 * what the tests and the admin Outbox screen read.
 *
 * Pass `tx` when already inside a tenant transaction; otherwise one is opened
 * so the row satisfies row-level security.
 */
export async function deliver(message: OutboundMessage, tx?: Tx) {
  const row = {
    schoolId: message.schoolId ?? null,
    channel: message.channel,
    toAddress: message.to,
    subject: message.subject ?? null,
    body: message.body,
  };

  const insert = async (runner: Tx | typeof db) =>
    (await runner.insert(outboundMessages).values(row).returning())[0];

  const saved = tx
    ? await insert(tx)
    : message.schoolId
      ? await withTenant(message.schoolId, insert)
      : await insert(db);

  if (process.env.NODE_ENV !== "production") {
    console.log(`[${message.channel}] → ${message.to}: ${message.body.slice(0, 120)}`);
  }
  return saved;
}
