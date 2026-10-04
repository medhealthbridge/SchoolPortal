import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSchool, getSchoolSession } from "@/lib/session";
import { Card } from "@/components/ui";
import LoginForm from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const school = await currentSchool();
  const session = await getSchoolSession();
  if (session && school && session.schoolId === school.id) redirect("/");

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="mb-1 text-2xl font-semibold">{school?.name}</h1>
      <p className="mb-6 text-sm text-black/65 dark:text-white/65">
        Staff, students and parents sign in here.
      </p>
      <Card>
        <LoginForm />
      </Card>
      <p className="mt-4 text-sm text-black/65 dark:text-white/65">
        A student or parent with no account yet?{" "}
        <Link href="/signup" className="brand-text font-medium underline">
          Sign up with a student ID
        </Link>
        .
      </p>
    </div>
  );
}
