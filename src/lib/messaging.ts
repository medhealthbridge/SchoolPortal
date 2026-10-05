import { eq } from "drizzle-orm";
import { db, withTenant, type Tx } from "@/db";
import { outboundMessages } from "@/db/schema";
import { send, type Channel } from "./delivery";

export type { Channel };

export type OutboundMessage = {
  schoolId?: string | null;
  channel: Channel;
  to: string;
  subject?: string;
  body: string;
};

/**
 * The single seam for anything leaving the system: verification codes,
 * invites, absence alerts, invoice reminders, grade notices.
 *
 * The row is written first and the provider is called second, so a message is
 * never sent without a record of it, and the admin Outbox shows what went out,
 * what is held, and what failed and why. `src/lib/delivery.ts` holds the
 * provider; with none configured every message stays "held", which is what
 * dev and the tests rely on.
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
    (await runner.insert(outboundMessages).values(row).returning())[0]!;

  const saved = tx
    ? await insert(tx)
    : message.schoolId
      ? await withTenant(message.schoolId, insert)
      : await insert(db);

  if (process.env.NODE_ENV !== "production") {
    console.log(`[${message.channel}] → ${message.to}: ${message.body.slice(0, 120)}`);
  }

  const attempt = await send(message);
  if (attempt.status === "held") return saved;

  // The update runs outside the caller's transaction on purpose: the message
  // has already left, so that fact must survive a rollback of whatever
  // triggered it.
  const update = { status: attempt.status, error: attempt.error ?? null };
  const write = (runner: Tx | typeof db) =>
    runner.update(outboundMessages).set(update).where(eq(outboundMessages.id, saved.id));

  if (saved.schoolId) await withTenant(saved.schoolId, (t) => write(t));
  else await write(db);

  return { ...saved, ...update };
}
