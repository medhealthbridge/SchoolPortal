import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { schoolYears } from "@/db/schema";
import { requireModule, requireUser } from "@/lib/guard";
import { canSeeStudent } from "@/lib/student-access";
import { enabledModules } from "@/lib/tenant";
import { sectionOfStudent } from "@/lib/schedule";
import { toPdf } from "@/lib/export/files";
import { PASSING_SCORE, reportCard } from "@/modules/grades/queries";
import { DESCRIPTORS, descriptor } from "@/modules/grades/deped";

/**
 * The Learner's Progress Report Card (SF9) as a PDF: learning areas by
 * quarter, final grade and remarks, the general average, the descriptor
 * legend and attendance, ready to print and sign.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ studentId: string }> }) {
  await requireModule("grades");
  const { school, session } = await requireUser();
  const { studentId } = await ctx.params;
  const on = await enabledModules(school.id);

  const data = await withTenant(school.id, async (tx) => {
    if (!(await canSeeStudent(tx, school.id, session, studentId, "grades.view_all"))) return null;
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, school.id), eq(schoolYears.isCurrent, true)))
      .limit(1);
    if (!year) return null;
    const card = await reportCard(tx, school.id, studentId, year.id, {
      attendance: on.has("attendance"),
      serviceHours: false,
    });
    if (!card) return null;
    return { card, year, section: await sectionOfStudent(tx, school.id, studentId) };
  });
  if (!data) notFound();
  const { card, year, section } = data;

  const columns = [
    { key: "area", label: "Learning areas" },
    ...card.periods.map((p, i) => ({ key: `q${i}`, label: p.name })),
    { key: "final", label: "Final grade" },
    { key: "remarks", label: "Remarks" },
  ];
  const complete = (l: (typeof card.lines)[number]) => l.byPeriod.every((v) => v !== null);
  const rows = card.lines.map((l) => ({
    area: l.subject,
    ...Object.fromEntries(l.byPeriod.map((v, i) => [`q${i}`, v ?? ""])),
    final: complete(l) ? (l.average ?? "") : "",
    remarks: complete(l) && l.average !== null ? (l.average >= PASSING_SCORE ? "Passed" : "Failed") : "",
  }));
  const allComplete = card.lines.length > 0 && card.lines.every(complete);
  rows.push({
    area: "General average",
    ...Object.fromEntries(card.periods.map((_, i) => [`q${i}`, ""])),
    final: allComplete ? (card.general ?? "") : "",
    remarks:
      allComplete && card.general !== null
        ? `${card.general >= PASSING_SCORE ? "Passed" : "Failed"} · ${descriptor(card.general)}`
        : "",
  });

  const s = card.student;
  const name = [s.lastName + ",", s.firstName, s.middleName, s.suffix].filter(Boolean).join(" ");
  const notes = [
    "Descriptors: " + DESCRIPTORS.map((d) => `${d.label} ${d.range}`).join("; ") + ".",
    ...(card.attendance
      ? [
          `Attendance this school year (class marks): present ${card.attendance.present}, absent ${card.attendance.absent}, late ${card.attendance.late}, excused ${card.attendance.excused}.`,
        ]
      : []),
    "",
    `Adviser: ${section?.adviserName ?? "______________________"}          School head: ______________________`,
    "Parent or guardian's signature: ______________________",
  ];

  const pdf = await toPdf({
    title: `${school.name}: Learner's Progress Report Card (SF9)`,
    subtitle: [
      name,
      s.lrn ? `LRN ${s.lrn}` : s.studentNumber,
      section ? `${section.level} ${section.name}` : null,
      `School year ${year.name}`,
    ]
      .filter(Boolean)
      .join(" · "),
    columns,
    rows,
    notes,
  });

  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="sf9-${(s.lrn ?? s.studentNumber).replace(/[^\w-]/g, "")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
