import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSchool, getSchoolSession } from "@/lib/session";
import { Panel } from "@/components/ui";
import LoginForm from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const school = await currentSchool();
  const session = await getSchoolSession();
  if (session && school && session.schoolId === school.id) redirect("/");

  return (
    <div className="mx-auto w-full max-w-[26rem] px-5 py-12 sm:py-20">
      <h1 className="w-wide text-[1.75rem] font-bold leading-tight">{school?.name}</h1>
      <p className="mt-1.5 mb-7 text-[var(--ink-soft)]">
        Staff, students and parents all sign in here.
      </p>
      <Panel>
        <LoginForm />
      </Panel>
      <p className="mt-5 text-sm text-[var(--ink-soft)]">
        No account yet?{" "}
        <Link href="/signup" className="font-medium text-[var(--brand)] underline underline-offset-2">
          Sign up with a student ID
        </Link>
        . Staff are invited by the school admin.
      </p>
    </div>
  );
}
