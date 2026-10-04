import { Suspense } from "react";
import RegisterWizard from "./wizard";

export const metadata = { title: "Register your school · SchoolPortal" };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Register your school</h1>
      <p className="mt-2 text-sm text-black/70 dark:text-white/70">
        Four steps here, five more inside. You can go live without us.
      </p>
      <div className="mt-8">
        <Suspense fallback={null}>
          <RegisterWizard />
        </Suspense>
      </div>
    </div>
  );
}
