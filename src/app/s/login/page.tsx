import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSchool, getSchoolSession } from "@/lib/session";
import { Panel } from "@/components/ui";
import { initialsOf } from "@/lib/brand";
import LoginForm from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const school = await currentSchool();
  const session = await getSchoolSession();
  if (session && school && session.schoolId === school.id) redirect("/");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-[var(--gutter)] py-12">
      <div className="mb-6">
        {school?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- on our own origin or the school's bucket
          <img
            src={school.logoUrl}
            alt=""
            aria-hidden
            className="mb-4 h-12 w-12 rounded-control border border-line bg-surface object-contain"
          />
        ) : (
          <span
            aria-hidden
            className="mb-4 flex h-10 w-10 items-center justify-center rounded-control text-sm font-semibold"
            style={{
              background: "var(--school-badge, var(--primary))",
              color: "var(--school-badge-fg, #FAFAFA)",
            }}
          >
            {school ? initialsOf(school.name) : ""}
          </span>
        )}
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{school?.name}</h1>
        <p className="mt-1 text-muted">Staff, students and parents all sign in here.</p>
      </div>
      <Panel>
        <LoginForm />
      </Panel>
      <p className="mt-5 text-muted">
        No account yet?{" "}
        <Link href="/signup" className="font-medium underline underline-offset-2">
          Sign up with a student ID
        </Link>
        . Staff are invited by the school admin.
      </p>
    </div>
  );
}
