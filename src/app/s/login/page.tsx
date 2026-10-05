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
    <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-[var(--gutter)] py-12">
      <div className="mb-6">
        <span
          aria-hidden
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-control bg-primary text-sm font-semibold text-[#FAFAFA]"
        >
          {school?.name
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase())
            .join("")}
        </span>
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
