import { currentSchool } from "@/lib/session";
import { Card } from "@/components/ui";

export const metadata = { title: "Account on hold" };

export default async function OnHold() {
  const school = await currentSchool();
  return (
    <div className="mx-auto max-w-xl px-5 py-20">
      <Card title="Account on hold">
        <p className="text-sm">
          {school?.name ?? "This school"} is on hold while an invoice is settled.
          Nothing has been deleted — every record is exactly as it was left, and
          everything returns the moment the payment is recorded.
        </p>
        <p className="mt-3 text-sm text-black/65 dark:text-white/65">
          The school admin can still open the billing page to see the invoice.
          Attendance already taken on a teacher&apos;s phone stays in its queue and
          uploads after reactivation.
        </p>
        <a className="brand-text mt-4 inline-block text-sm font-medium underline" href="/billing">
          Open the billing page
        </a>
      </Card>
    </div>
  );
}
