import Link from "next/link";
import { notFound } from "next/navigation";
import { currentSchool, getSchoolSession } from "@/lib/session";
import { needsConsent, noticeOf } from "@/lib/privacy";
import { Panel } from "@/components/ui";
import { signOutAction } from "../login/actions";
import { AcceptPrivacy } from "./accept";

export const metadata = { title: "Privacy notice" };

export default async function PrivacyPage() {
  const school = await currentSchool();
  if (!school) notFound();
  const session = await getSchoolSession();
  const asking = session && session.schoolId === school.id && needsConsent(school, session);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[40rem] flex-col justify-center px-[var(--gutter)] py-12">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{school.name}: privacy notice</h1>
      <p className="mb-6 mt-1 max-w-[52ch] text-muted">
        {asking
          ? "Before you go on, read how the school keeps your personal information, as the Data Privacy Act of 2012 asks."
          : "How the school keeps personal information, under the Data Privacy Act of 2012 (RA 10173)."}
      </p>
      <Panel>
        <div className="flex flex-col gap-4">
          {noticeOf(school)
            .split(/\n\s*\n/)
            .map((para, i) => (
              <p key={i} className="max-w-[65ch] leading-relaxed">
                {para}
              </p>
            ))}
          <p className="text-sm text-muted">
            Questions, or to use your rights:{" "}
            {school.privacyOfficer?.trim() || `the school office${school.phone ? `, ${school.phone}` : ""}`}.
          </p>
          {asking && <AcceptPrivacy signOut={signOutAction} />}
        </div>
      </Panel>
      {!asking && (
        <p className="mt-5 text-muted">
          <Link href={session ? "/" : "/login"} className="font-medium underline underline-offset-2">
            {session ? "Back to the portal" : "Sign in"}
          </Link>
        </p>
      )}
    </div>
  );
}
