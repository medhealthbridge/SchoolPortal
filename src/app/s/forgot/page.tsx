import Link from "next/link";
import { currentSchool } from "@/lib/session";
import { Panel } from "@/components/ui";
import { ForgotForm } from "./form";

export const metadata = { title: "Forgot your password" };

export default async function ForgotPage() {
  const school = await currentSchool();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-[var(--gutter)] py-12">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Forgot your password?</h1>
      <p className="mb-6 mt-1 max-w-[44ch] text-muted">
        We email a link to set a new one{school ? ` for ${school.name}` : ""}. It works once, for an
        hour.
      </p>
      <Panel>
        <ForgotForm />
      </Panel>
      <p className="mt-5 text-muted">
        <Link href="/login" className="font-medium underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
