import Link from "next/link";
import { withTenant } from "@/db";
import { requirePermission } from "@/lib/guard";
import { openTeacherInvites, teacherRoster } from "@/lib/staff";
import { schoolUrl } from "@/lib/school-url";
import { prettyDate } from "@/lib/format";
import { ExportPanel } from "@/components/export-panel";
import { Button, EmptyState, Meta, PageHeader, Pill, Section, Table } from "@/components/ui";
import { cancelTeacherInvite, setTeacherStatus } from "./actions";
import { AddTeacherForm } from "./add-teacher";

export const metadata = { title: "Teachers" };

export default async function TeachersPage() {
  const { school, session } = await requirePermission("staff.manage");
  const { roster, waiting } = await withTenant(school.id, async (tx) => ({
    roster: await teacherRoster(tx, school.id),
    waiting: await openTeacherInvites(tx, school.id),
  }));
  const active = roster.filter((t) => t.status === "active").length;

  return (
    <>
      <PageHeader
        title="Teachers"
        meta={
          <Meta
            items={[
              `${roster.length} ${roster.length === 1 ? "teacher" : "teachers"}`,
              roster.length > 0 ? `${active} can sign in` : null,
              waiting.length > 0 ? `${waiting.length} waiting to join` : null,
            ]}
          />
        }
      />

      <Section
        title="Add a teacher"
        subtitle="They get a link to set their own password. Then give them classes on the Schedule, and they will see their week when they sign in."
      >
        <AddTeacherForm subdomain={school.subdomain} root={process.env.ROOT_DOMAIN ?? "lvh.me:3000"} />
      </Section>

      <Section
        title="Teaching staff"
        subtitle={
          <>
            Classes and advisory sections come from the{" "}
            <Link href="/schedule" className="font-medium underline underline-offset-2">
              Schedule
            </Link>
            . A teacher who leaves is turned off here: they can no longer sign in, and their
            records stay.
          </>
        }
        flush={roster.length > 0}
      >
        {roster.length === 0 ? (
          <EmptyState title="No teachers yet">Add the first one above.</EmptyState>
        ) : (
          <Table
            head={["Teacher", "Advises", "Classes a week", "Subjects", "Account", ""]}
            minWidth={860}
          >
            {roster.map((t) => (
              <tr key={t.id}>
                <th scope="row" className="text-left">
                  <span className="block font-medium">{t.name}</span>
                  <span className="block text-[13px] font-normal text-muted">{t.email}</span>
                </th>
                <td>{t.advises.join(", ") || "—"}</td>
                <td className="tabular-nums">{t.classesPerWeek}</td>
                <td className="max-w-[16rem]">{t.subjects.join(", ") || "—"}</td>
                <td>
                  {t.status === "active" ? (
                    <Pill tone="ok">Active</Pill>
                  ) : t.status === "disabled" ? (
                    <Pill>Turned off</Pill>
                  ) : (
                    <Pill tone="warn">Invited</Pill>
                  )}
                  <span className="mt-1 block text-[13px] text-muted">
                    {t.lastLoginAt ? `Last in ${prettyDate(t.lastLoginAt)}` : "Not signed in yet"}
                  </span>
                </td>
                <td className="text-right">
                  {t.id !== session.userId &&
                    t.roles.every((r) => r === "teacher" || r === "adviser") && (
                      <form action={setTeacherStatus}>
                        <input type="hidden" name="userId" value={t.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={t.status === "disabled" ? "active" : "disabled"}
                        />
                        <Button type="submit" variant={t.status === "disabled" ? "secondary" : "ghost"}>
                          {t.status === "disabled" ? "Turn back on" : "Turn off"}
                        </Button>
                      </form>
                    )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {waiting.length > 0 && (
        <Section
          title="Waiting to join"
          subtitle="If this site cannot send email yet, copy a link and send it to the teacher yourself, by text or chat."
          flush
        >
          <Table head={["Teacher", "Link to send them", ""]} minWidth={760}>
            {waiting.map((w) => (
              <tr key={w.id}>
                <th scope="row" className="text-left">
                  <span className="block font-medium">{w.name}</span>
                  <span className="block text-[13px] font-normal text-muted">{w.email}</span>
                </th>
                <td className="break-all font-mono text-[13px]">
                  {schoolUrl(school.subdomain, `/invite/${w.token}`)}
                </td>
                <td className="text-right">
                  <form action={cancelTeacherInvite}>
                    <input type="hidden" name="id" value={w.id} />
                    <Button type="submit" variant="ghost">
                      Cancel
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      <ExportPanel dataset="teachers" roles={session.roles} />
    </>
  );
}
