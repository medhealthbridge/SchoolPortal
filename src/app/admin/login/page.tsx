import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { Panel } from "@/components/ui";
import AdminLoginForm from "./form";

export const metadata = { title: "Platform admin" };

export default async function AdminLogin() {
  if (await getAdminSession()) redirect("/");
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-[var(--gutter)] py-12">
      <span
        aria-hidden
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-control bg-primary text-sm font-semibold text-[#FAFAFA]"
      >
        SP
      </span>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Platform admin</h1>
      <p className="mb-6 mt-1 max-w-[42ch] text-muted">
        Every school, every subscription. This account reaches all of them, so it needs a code
        from your authenticator as well as a password.
      </p>
      <Panel>
        <AdminLoginForm />
      </Panel>
    </div>
  );
}
