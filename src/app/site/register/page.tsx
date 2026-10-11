import { Suspense } from "react";
import RegisterWizard from "./wizard";

export const metadata = { title: "Register your school" };

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-[40rem] px-[var(--gutter)] py-10 sm:py-14">
      <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em]">
        Register your school
      </h1>
      <p className="mb-8 mt-2 max-w-[54ch] text-base text-muted">
        Four steps here, five more inside, and your school is live on its own address. Nothing
        to install and nobody to call.
      </p>
      <Suspense fallback={null}>
        <RegisterWizard />
      </Suspense>
    </div>
  );
}
