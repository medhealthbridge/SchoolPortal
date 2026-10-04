import Link from "next/link";
import { currentSchool } from "@/lib/session";
import { Panel } from "@/components/ui";
import SignupForms from "./forms";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  const school = await currentSchool();
  return (
    <div className="mx-auto w-full max-w-[26rem] px-5 py-12 sm:py-16">
      <h1 className="w-wide text-[1.75rem] font-bold leading-tight">{school?.name}</h1>
      <p className="mt-1.5 mb-7 max-w-[44ch] text-[var(--ink-soft)]">
        Your record is already here. This claims it, so you need the code your
        school printed for you.
      </p>
      <Panel>
        <SignupForms />
      </Panel>
      <p className="mt-5 text-sm text-[var(--ink-soft)]">
        Already claimed it?{" "}
        <Link href="/login" className="font-medium text-[var(--brand)] underline underline-offset-2">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
