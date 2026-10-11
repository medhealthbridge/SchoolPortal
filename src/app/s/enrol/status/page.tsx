import Link from "next/link";
import { currentSchool } from "@/lib/session";
import { Panel } from "@/components/ui";
import { StatusForm } from "./form";

export const metadata = { title: "Check an application" };

export default async function StatusPage() {
  const school = await currentSchool();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-[var(--gutter)] py-12">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Check an application</h1>
      <p className="mb-6 mt-1 text-muted">
        The reference {school ? `${school.name} gave` : "you were given"} and the mobile number on the application.
      </p>
      <Panel>
        <StatusForm />
      </Panel>
      <p className="mt-5 text-muted">
        <Link href="/enrol" className="font-medium underline underline-offset-2">
          Apply for a learner
        </Link>
      </p>
    </div>
  );
}
