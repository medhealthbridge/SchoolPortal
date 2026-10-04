import { currentSchool } from "@/lib/session";
import { Panel } from "@/components/ui";

export const metadata = { title: "Account on hold" };

export default async function OnHold() {
  const school = await currentSchool();
  return (
    <div className="mx-auto w-full max-w-[34rem] px-5 py-14 sm:py-24">
      <h1 className="w-wide text-[1.75rem] font-bold leading-tight">Account on hold</h1>
      <Panel className="mt-6">
        <p className="max-w-[60ch]">
          {school?.name ?? "This school"} is on hold while an invoice is
          settled. Nothing has been deleted. Every record is exactly as it was
          left, and all of it returns the moment the payment is recorded.
        </p>
        <p className="mt-4 max-w-[60ch] text-[var(--ink-soft)]">
          The school admin can still open Billing to see the invoice.
          Attendance already taken on a teacher&apos;s phone stays on the phone
          and goes up once the school is back.
        </p>
        <a
          className="mt-5 inline-block font-medium text-[var(--brand)] underline underline-offset-2"
          href="/billing"
        >
          Open Billing
        </a>
      </Panel>
    </div>
  );
}
