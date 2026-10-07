import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { invites, userRoles, users } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { ROLE_LABELS, ROLE_SCOPES, STAFF_ROLES } from "@/lib/roles";
import { PageHeader, Pill, Section, Table } from "@/components/ui";
import { InviteForm } from "./invite-form";
import { ResetLinkButton } from "@/components/reset-link";
import { ExportPanel } from "@/components/export-panel";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const { school, session } = await requirePermission("users.manage");

  const data = await withTenant(school.id, async (tx) => {
    const staff = await tx
      .select({ id: users.id, name: users.name, email: users.email, status: users.status })
      .from(users)
      .where(eq(users.schoolId, school.id))
      .orderBy(asc(users.name));
    const roles = await tx
      .select({ userId: userRoles.userId, role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.schoolId, school.id));
    const pending = await tx
      .select()
      .from(invites)
      .where(eq(invites.schoolId, school.id))
      .orderBy(asc(invites.createdAt));
    return { staff, roles, pending };
  });

  const rolesByUser = new Map<string, string[]>();
  for (const r of data.roles) {
    rolesByUser.set(r.userId, [...(rolesByUser.get(r.userId) ?? []), r.role]);
  }

  return (
    <>
      <PageHeader
        title="People"
        meta={`${data.staff.length} accounts, ${data.pending.filter((i) => !i.acceptedAt).length} invites open`}
      />
      <Section
        title="Invite staff"
        subtitle="Staff accounts are invite-only. There is no public staff signup."
      >
        <InviteForm subdomain={school.subdomain} root={process.env.ROOT_DOMAIN ?? "lvh.me:3000"} />
      </Section>

      <Section title="Accounts" subtitle="Staff are invited; students and parents claim their own." flush>
        <Table head={["Name", "Email", "Roles", "Status", ""]} minWidth={760}>
          {data.staff.map((u) => (
            <tr key={u.id}>
              <td className="font-medium">{u.name}</td>
              <td>{u.email ?? "—"}</td>
              <td>
                {(rolesByUser.get(u.id) ?? []).map((r) => ROLE_LABELS[r as never] ?? r).join(", ") ||
                  "—"}
              </td>
              <td><Pill tone={u.status === "active" ? "ok" : "neutral"}>{u.status}</Pill></td>
              <td className="text-right">
                {u.id !== session.userId && u.status === "active" && (
                  <ResetLinkButton userId={u.id} name={u.name} />
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      {data.pending.filter((i) => !i.acceptedAt).length > 0 && (
        <Section title="Invites not yet accepted" flush>
          <Table head={["Name", "Email", "Role", "Link to send them"]} minWidth={720}>
            {data.pending
              .filter((i) => !i.acceptedAt)
              .map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{i.email}</td>
                  <td>{ROLE_LABELS[i.role as never] ?? i.role}</td>
                  <td>
                    <a className="brand-text underline" href={`/invite/${i.token}`}>
                      /invite/{i.token}
                    </a>
                  </td>
                </tr>
              ))}
          </Table>
        </Section>
      )}

      <Section
        title="What each role reaches"
        subtitle={
          <>
            Checked on the server for every request, not just hidden from the
            menu. Students and parents claim their own accounts with the codes
            on the{" "}
            <Link href="/students" className="font-medium text-primary underline underline-offset-2">
              Students
            </Link>{" "}
            page.
          </>
        }
      >
        <Table head={["Role", "Scope"]}>
          {STAFF_ROLES.concat(["parent", "student"]).map((r) => (
            <tr key={r}>
              <td className="font-medium">{ROLE_LABELS[r]}</td>
              <td>{ROLE_SCOPES[r]}</td>
            </tr>
          ))}
        </Table>
      </Section>
      <ExportPanel dataset="staff" roles={session.roles} />
    </>
  );
}
