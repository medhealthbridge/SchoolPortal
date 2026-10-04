import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { enabledModules } from "@/lib/tenant";
import { permissionsFor } from "@/lib/roles";
import { Banner } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out";
import { signOutAction } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { school, session } = await requireUser();
  const on = await enabledModules(school.id);
  const perms = permissionsFor(session.roles);

  const nav: { href: string; label: string }[] = [{ href: "/", label: "Home" }];
  if (perms.has("attendance.take")) nav.push({ href: "/attendance", label: "Take attendance" });
  if (perms.has("attendance.view_all") && on.has("attendance"))
    nav.push({ href: "/attendance/report", label: "Attendance report" });
  if (perms.has("students.view")) nav.push({ href: "/students", label: "Students" });
  if (perms.has("sections.manage")) nav.push({ href: "/setup", label: "Setup" });
  if (perms.has("users.manage")) nav.push({ href: "/people", label: "People" });
  if (perms.has("school.manage")) nav.push({ href: "/modules", label: "Modules" });
  if (perms.has("school.billing.view")) nav.push({ href: "/billing", label: "Billing" });
  if (perms.has("audit.view")) nav.push({ href: "/audit", label: "Audit log" });

  return (
    <div className="min-h-full">
      <header className="brand-bg text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <Link href="/" className="font-semibold">
              {school.name}
            </Link>
            <span className="ml-2 text-xs opacity-75">{school.subdomain}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-85">{session.name}</span>
            <SignOutButton action={signOutAction} />
          </div>
        </div>
        <nav className="border-t border-white/15">
          <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 py-1 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6">
        {school.status === "past_due" && (
          <div className="mb-5">
            <Banner tone="warn">
              An invoice is past due. Everything still works — settle it from the
              billing page to avoid a hold.
            </Banner>
          </div>
        )}
        {school.status === "trial" && school.trialEndsAt && (
          <div className="mb-5">
            <Banner>
              Free trial until {school.trialEndsAt.toLocaleDateString("en-PH")}.
            </Banner>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
