import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { Card } from "@/components/ui";
import AdminLoginForm from "./form";

export const metadata = { title: "Platform admin" };

export default async function AdminLogin() {
  if (await getAdminSession()) redirect("/");
  return (
    <div className="mx-auto max-w-md px-5 py-20">
      <h1 className="mb-1 text-2xl font-semibold">Platform admin</h1>
      <p className="mb-6 text-sm text-black/65 dark:text-white/65">
        Every school, every subscription. Email, password and a second factor.
      </p>
      <Card>
        <AdminLoginForm />
      </Card>
    </div>
  );
}
