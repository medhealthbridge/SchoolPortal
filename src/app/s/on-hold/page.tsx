import { currentSchool } from "@/lib/session";
import { LinkButton, Panel } from "@/components/ui";
import { LockIcon } from "@/components/icons";

export const metadata = { title: "Account on hold" };

export default async function OnHold() {
  const school = await currentSchool();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col justify-center px-[var(--gutter)] py-12">
      <Panel>
        <span
          aria-hidden
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-control bg-subtle text-muted"
        >
          <LockIcon size={20} />
        </span>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Account on hold</h1>
        <p className="mt-3 max-w-[60ch]">
          {school?.name ?? "This school"} is on hold while an invoice is settled. Nothing has
          been deleted. Every record is exactly as it was left, and all of it returns the
          moment the payment is recorded.
        </p>
        <p className="mt-3 max-w-[60ch] text-muted">
          The school admin can still open Billing to see the invoice. Attendance already taken
          on a teacher&apos;s phone stays on the phone and goes up once the school is back.
        </p>
        <div className="mt-6">
          <LinkButton href="/billing">Open Billing</LinkButton>
        </div>
      </Panel>
    </div>
  );
}
