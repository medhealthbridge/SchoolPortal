import { and, asc, count, desc, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { activities, clubMemberships, clubs, serviceHours } from "@/db/schema";

/**
 * The counts behind the SAO and Chaplain screens.
 *
 * They live here rather than inline in the page so a test can hold them to
 * account. Both were once correlated subqueries written with drizzle's `sql`
 * template, which renders ${table.column} as a bare "column" whenever the
 * outer select has no join — inside the subquery that bound to the
 * subquery's own table, and both counts silently came back as zero. A join
 * and a group by cannot go wrong that way.
 */
export async function clubsWithMembers(tx: Tx, schoolId: string) {
  return tx
    .select({ row: clubs, members: count(clubMemberships.studentId) })
    .from(clubs)
    .leftJoin(clubMemberships, eq(clubMemberships.clubId, clubs.id))
    .where(eq(clubs.schoolId, schoolId))
    .groupBy(clubs.id)
    .orderBy(asc(clubs.name));
}

export async function activitiesWithCredits(
  tx: Tx,
  schoolId: string,
  kind: "sao_event" | "ministry",
  limit = 50,
) {
  return tx
    .select({ row: activities, credited: count(serviceHours.id) })
    .from(activities)
    .leftJoin(serviceHours, eq(serviceHours.activityId, activities.id))
    .where(and(eq(activities.schoolId, schoolId), eq(activities.kind, kind)))
    .groupBy(activities.id)
    .orderBy(desc(activities.onDate))
    .limit(limit);
}
