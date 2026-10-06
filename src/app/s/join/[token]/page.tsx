import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { guardianInvites } from "@/db/schema";
import { openInvite } from "@/lib/guardians";
import { currentSchool, getSchoolSession } from "@/lib/session";
import { Callout, Panel } from "@/components/ui";
import { JoinForm } from "./form";

export const metadata = { title: "Follow your child" };

/** Where a parent lands from a teacher's invite. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const school = await currentSchool();
  const found = school ? await withTenant(school.id, (tx) => openInvite(tx, school.id, token)) : null;

  // Accepting signs the parent in, and the new cookie re-renders this page
  // with the invite already used. The person who just used it goes home.
  if (school && !found) {
    const session = await getSchoolSession();
    if (session?.schoolId === school.id) {
      const [used] = await withTenant(school.id, (tx) =>
        tx
          .select({ by: guardianInvites.acceptedByUserId })
          .from(guardianInvites)
          .where(and(eq(guardianInvites.schoolId, school.id), eq(guardianInvites.token, token)))
          .limit(1),
      );
      if (used?.by === session.userId) redirect("/");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-[var(--gutter)] py-12">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">
        {found ? `Follow ${found.student.firstName} at ${school!.name}` : "This invite cannot be used"}
      </h1>
      {found ? (
        <>
          <p className="mb-6 mt-1 max-w-[44ch] text-muted">
            See {found.student.firstName}'s grades, attendance, class schedule and school news.
            One account covers all your children at this school.
          </p>
          <Panel>
            <JoinForm
              token={token}
              email={found.invite.email}
              suggestedName={found.invite.name}
              hasAccount={Boolean(found.account)}
            />
          </Panel>
        </>
      ) : (
        <div className="mt-4">
          <Callout tone="warn" title="It has expired or was already used">
            Invites last 14 days and work once. Ask your child's teacher for a new one. If you
            already linked this child, sign in instead.
          </Callout>
          <p className="mt-4">
            <a href="/login" className="font-medium underline underline-offset-2">
              Sign in
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
