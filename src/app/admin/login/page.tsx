import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { Panel } from "@/components/ui";
import AdminLoginForm from "./form";

export const metadata = { title: "Platform admin" };

export default async function AdminLogin() {
  if (await getAdminSession()) redirect("/");
  return (
    <div className="mx-auto w-full max-w-[26rem] px-5 py-14 sm:py-24">
      <h1 className="w-wide text-[1.75rem] font-bold leading-tight">Platform admin</h1>
      <p className="mt-1.5 mb-7 max-w-[42ch] text-[var(--ink-soft)]">
        Every school, every subscription. This account reaches all of them, so
        it needs a code from your authenticator as well as a password.
      </p>
      <Panel>
        <AdminLoginForm />
      </Panel>
    </div>
  );
}
