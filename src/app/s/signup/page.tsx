import Link from "next/link";
import { currentSchool } from "@/lib/session";
import { Panel } from "@/components/ui";
import SignupForms from "./forms";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  const school = await currentSchool();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-[var(--gutter)] py-12">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{school?.name}</h1>
      <p className="mb-6 mt-1 max-w-[44ch] text-muted">
        Your record is already here. This claims it, so you need the code your school printed
        for you.
      </p>
      <Panel>
        <SignupForms />
      </Panel>
      <p className="mt-5 text-muted">
        Already claimed it?{" "}
        <Link href="/login" className="font-medium underline underline-offset-2">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
