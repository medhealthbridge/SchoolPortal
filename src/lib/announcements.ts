/**
 * Who sees which announcement. Staff see everything posted. A parent or a
 * student sees what went to the whole school and what went to the sections
 * their children (or they) are in, and nothing aimed at other classes.
 */
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Tx } from "@/db";
import { announcements, sections, users } from "@/db/schema";

export async function announcementsFor(
  tx: Tx,
  schoolId: string,
  audience: { everything: true } | { sectionIds: string[] },
  limit = 50,
) {
  const scope =
    "everything" in audience
      ? undefined
      : audience.sectionIds.length > 0
        ? or(isNull(announcements.sectionId), inArray(announcements.sectionId, audience.sectionIds))
        : isNull(announcements.sectionId);
  return tx
    .select({ post: announcements, author: users.name, level: sections.level, section: sections.name })
    .from(announcements)
    .leftJoin(users, eq(users.id, announcements.postedByUserId))
    .leftJoin(sections, eq(sections.id, announcements.sectionId))
    .where(and(eq(announcements.schoolId, schoolId), scope))
    .orderBy(desc(announcements.postedAt))
    .limit(limit);
}
