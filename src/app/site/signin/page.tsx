import Link from "next/link";
import { Section } from "@/components/ui";
import { FindSchool } from "./find-school";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-6 px-[var(--gutter)] py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Sign in</h1>
        <p className="mt-1.5 text-muted">
          Every school has its own address, and its own sign-in page. Enter yours and we will
          take you there.
        </p>
      </div>
      <Section title="Find your school">
        <FindSchool />
      </Section>
      <p className="text-sm text-muted">
        Parents and students sign in at their school&rsquo;s address too, and claim their account
        there with the code the school printed for them.{" "}
        <Link href="/register" className="font-medium text-primary underline underline-offset-2">
          Is your school new here?
        </Link>
      </p>
    </div>
  );
}
