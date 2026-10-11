import { and, eq, isNull } from "drizzle-orm";
import { withTenant } from "@/db";
import { invites } from "@/db/schema";
import { currentSchool } from "@/lib/session";
import { Callout, Panel } from "@/components/ui";
import InviteForm from "./form";

export const metadata = { title: "Accept your invite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const school = await currentSchool();
  const invite = school
    ? (
        await withTenant(school.id, (tx) =>
          tx
            .select({ name: invites.name, email: invites.email })
            .from(invites)
            // An accepted invite is spent: show that here, not on submit.
            .where(
              and(
                eq(invites.schoolId, school.id),
                eq(invites.token, token),
                isNull(invites.acceptedAt),
              ),
            )
            .limit(1),
        )
      )[0]
    : undefined;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-[var(--gutter)] py-12">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Accept your invite</h1>
      <p className="mb-6 mt-1 max-w-[44ch] text-muted">
        Choose a password and your account is ready.
      </p>
      <Panel>
        {invite ? (
          <InviteForm token={token} name={invite.name} email={invite.email} />
        ) : (
          <Callout tone="danger">
            That invite is no longer valid — it may already have been used. If you have an
            account, <a href="/login" className="font-medium underline underline-offset-2">sign in</a>;
            otherwise ask your school office for a new link.
          </Callout>
        )}
      </Panel>
    </div>
  );
}
