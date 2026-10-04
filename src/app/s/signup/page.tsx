import { currentSchool } from "@/lib/session";
import { Card } from "@/components/ui";
import SignupForms from "./forms";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  const school = await currentSchool();
  return (
    <div className="mx-auto max-w-md px-5 py-14">
      <h1 className="mb-1 text-2xl font-semibold">{school?.name}</h1>
      <p className="mb-6 text-sm text-black/65 dark:text-white/65">
        Your record already exists — this only claims it. Staff accounts are
        invited by the school admin, not signed up here.
      </p>
      <Card>
        <SignupForms />
      </Card>
    </div>
  );
}
