import Link from "next/link";
import { withTenant } from "@/db";
import { openReset } from "@/lib/password-reset";
import { currentSchool } from "@/lib/session";
import { Callout, Panel } from "@/components/ui";
import { ResetForm } from "./form";

export const metadata = { title: "Set a new password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const school = await currentSchool();
  const found = school ? await withTenant(school.id, (tx) => openReset(tx, school.id, token)) : null;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-[var(--gutter)] py-12">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">
        {found ? "Set a new password" : "This link cannot be used"}
      </h1>
      {found ? (
        <>
          <p className="mb-6 mt-1 max-w-[44ch] text-muted">
            For {found.name}
            {found.email ? ` (${found.email})` : ""}. Every device signed in with the old password
            is signed out.
          </p>
          <Panel>
            <ResetForm token={token} />
          </Panel>
        </>
      ) : (
        <div className="mt-4 grid gap-4">
          <Callout tone="warn" title="It has expired or was already used">
            Reset links work once. Ask for a new one, or ask your school office.
          </Callout>
          <Link href="/forgot" className="font-medium underline underline-offset-2">
            Ask for a new link
          </Link>
        </div>
      )}
    </div>
  );
}
