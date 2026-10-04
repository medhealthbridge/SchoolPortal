import { asc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { invites, userRoles, users } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { ROLE_LABELS, ROLE_SCOPES, STAFF_ROLES } from "@/lib/roles";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, Select, Table } from "@/components/ui";
import { inviteStaff } from "../setup/actions";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const { school } = await requirePermission("users.manage");

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
    <div className="grid gap-5">
      <Card
        title="Invite staff"
        subtitle="Staff accounts are invite-only. There is no public staff signup."
      >
        <ActionForm action={inviteStaff} submitLabel="Send invite" className="grid gap-3 sm:grid-cols-3">
          <Field label="Name">
            <Input name="name" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Role">
            <Select name="role" required defaultValue="teacher">
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
        </ActionForm>
      </Card>

      <Card title="People" subtitle={`${data.staff.length} accounts`}>
        <Table head={["Name", "Email", "Roles", "Status"]}>
          {data.staff.map((u) => (
            <tr key={u.id}>
              <td className="py-2 pr-4 font-medium">{u.name}</td>
              <td className="py-2 pr-4">{u.email ?? "—"}</td>
              <td className="py-2 pr-4">
                {(rolesByUser.get(u.id) ?? []).map((r) => ROLE_LABELS[r as never] ?? r).join(", ") ||
                  "—"}
              </td>
              <td className="py-2 pr-4">{u.status}</td>
            </tr>
          ))}
        </Table>
      </Card>

      {data.pending.filter((i) => !i.acceptedAt).length > 0 && (
        <Card title="Invites not yet accepted">
          <Table head={["Name", "Email", "Role", "Link"]}>
            {data.pending
              .filter((i) => !i.acceptedAt)
              .map((i) => (
                <tr key={i.id}>
                  <td className="py-2 pr-4">{i.name}</td>
                  <td className="py-2 pr-4">{i.email}</td>
                  <td className="py-2 pr-4">{ROLE_LABELS[i.role as never] ?? i.role}</td>
                  <td className="py-2 pr-4">
                    <a className="brand-text underline" href={`/invite/${i.token}`}>
                      /invite/{i.token.slice(0, 8)}…
                    </a>
                  </td>
                </tr>
              ))}
          </Table>
        </Card>
      )}

      <Card title="What each role reaches" subtitle="Checked on the server for every request.">
        <Table head={["Role", "Scope"]}>
          {STAFF_ROLES.concat(["parent", "student"]).map((r) => (
            <tr key={r}>
              <td className="py-2 pr-4 font-medium">{ROLE_LABELS[r]}</td>
              <td className="py-2 pr-4">{ROLE_SCOPES[r]}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
