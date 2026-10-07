import { auditLog, events } from "@/db/schema";
import type { Tx } from "@/db";

export type AuditEntry = {
  schoolId: string | null;
  actorUserId?: string | null;
  actorLabel: string;
  action: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
};

/** Every write goes to the audit log. */
export async function audit(tx: Tx, entry: AuditEntry) {
  await tx.insert(auditLog).values({
    schoolId: entry.schoolId,
    actorUserId: entry.actorUserId ?? null,
    actorLabel: entry.actorLabel,
    action: entry.action,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
  });
}

/**
 * Modules talk only through events. Emitting is always safe: if no module
 * listens, the row is simply marked processed with nothing done.
 */
export async function emit(
  tx: Tx,
  schoolId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  await tx.insert(events).values({ schoolId, type, payload: payload as never });
}
