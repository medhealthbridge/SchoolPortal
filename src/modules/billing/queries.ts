import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  enrollments,
  feeItems,
  sections,
  studentCharges,
  studentPayments,
  students,
} from "@/db/schema";

export type Balance = {
  chargedCentavos: number;
  paidCentavos: number;
  balanceCentavos: number;
};

/** What one student still owes the school. */
export async function balanceFor(
  tx: Tx,
  schoolId: string,
  studentId: string,
): Promise<Balance> {
  const [charged] = await tx
    .select({ total: sql<number>`coalesce(sum(${studentCharges.amountCentavos}), 0)` })
    .from(studentCharges)
    .where(
      and(eq(studentCharges.schoolId, schoolId), eq(studentCharges.studentId, studentId)),
    );
  const [paid] = await tx
    .select({ total: sql<number>`coalesce(sum(${studentPayments.amountCentavos}), 0)` })
    .from(studentPayments)
    .where(
      and(eq(studentPayments.schoolId, schoolId), eq(studentPayments.studentId, studentId)),
    );
  const chargedCentavos = Number(charged?.total ?? 0);
  const paidCentavos = Number(paid?.total ?? 0);
  return {
    chargedCentavos,
    paidCentavos,
    balanceCentavos: chargedCentavos - paidCentavos,
  };
}

export type LedgerLine =
  | { kind: "charge"; on: string; label: string; centavos: number }
  | { kind: "payment"; on: string; label: string; centavos: number };

/** One student's charges and payments, newest first. */
export async function ledgerFor(tx: Tx, schoolId: string, studentId: string) {
  const charges = await tx
    .select({
      on: studentCharges.chargedOn,
      label: feeItems.name,
      centavos: studentCharges.amountCentavos,
    })
    .from(studentCharges)
    .innerJoin(feeItems, eq(feeItems.id, studentCharges.feeItemId))
    .where(
      and(eq(studentCharges.schoolId, schoolId), eq(studentCharges.studentId, studentId)),
    );
  const payments = await tx
    .select({
      on: studentPayments.paidOn,
      label: studentPayments.receiptNo,
      centavos: studentPayments.amountCentavos,
    })
    .from(studentPayments)
    .where(
      and(eq(studentPayments.schoolId, schoolId), eq(studentPayments.studentId, studentId)),
    );

  const lines: LedgerLine[] = [
    ...charges.map((c) => ({ kind: "charge" as const, ...c })),
    ...payments.map((p) => ({
      kind: "payment" as const,
      on: p.on,
      label: `Receipt ${p.label}`,
      centavos: p.centavos,
    })),
  ];
  return lines.sort((a, b) => b.on.localeCompare(a.on));
}

export type OwingRow = {
  studentId: string;
  studentNumber: string;
  name: string;
  section: string | null;
  balanceCentavos: number;
};

/** Everyone with something outstanding, biggest first. */
export async function studentsOwing(tx: Tx, schoolId: string): Promise<OwingRow[]> {
  const rows = await tx
    .select({
      studentId: students.id,
      studentNumber: students.studentNumber,
      firstName: students.firstName,
      lastName: students.lastName,
      level: sections.level,
      section: sections.name,
      charged: sql<number>`coalesce((
        select sum(c.amount_centavos) from student_charges c
        where c.student_id = ${students.id}
      ), 0)`,
      paid: sql<number>`coalesce((
        select sum(p.amount_centavos) from student_payments p
        where p.student_id = ${students.id}
      ), 0)`,
    })
    .from(students)
    .leftJoin(enrollments, eq(enrollments.studentId, students.id))
    .leftJoin(sections, eq(sections.id, enrollments.sectionId))
    .where(eq(students.schoolId, schoolId))
    .orderBy(asc(students.lastName));

  return rows
    .map((r) => ({
      studentId: r.studentId,
      studentNumber: r.studentNumber,
      name: `${r.lastName}, ${r.firstName}`,
      section: r.level ? `${r.level} ${r.section}` : null,
      balanceCentavos: Number(r.charged) - Number(r.paid),
    }))
    .filter((r) => r.balanceCentavos > 0)
    .sort((a, b) => b.balanceCentavos - a.balanceCentavos);
}

export async function feeItemsFor(tx: Tx, schoolId: string, schoolYearId: string) {
  return tx
    .select()
    .from(feeItems)
    .where(and(eq(feeItems.schoolId, schoolId), eq(feeItems.schoolYearId, schoolYearId)))
    .orderBy(asc(feeItems.name));
}

export async function recentPayments(tx: Tx, schoolId: string, limit = 20) {
  return tx
    .select({
      payment: studentPayments,
      firstName: students.firstName,
      lastName: students.lastName,
      studentNumber: students.studentNumber,
    })
    .from(studentPayments)
    .innerJoin(students, eq(students.id, studentPayments.studentId))
    .where(eq(studentPayments.schoolId, schoolId))
    .orderBy(desc(studentPayments.createdAt))
    .limit(limit);
}
