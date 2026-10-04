import { Suspense } from "react";
import RegisterWizard from "./wizard";

export const metadata = { title: "Register your school" };

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-[40rem] px-5 py-12 sm:py-16">
      <h1 className="w-wide text-[2rem] font-bold leading-tight">Register your school</h1>
      <p className="mt-2 mb-9 max-w-[54ch] text-[1.0625rem] text-[var(--ink-soft)]">
        Four steps here, five more inside, and your school is live on its own
        address. Nothing to install and nobody to call.
      </p>
      <Suspense fallback={null}>
        <RegisterWizard />
      </Suspense>
    </div>
  );
}
