import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { enabledModules } from "@/lib/tenant";
import { permissionsFor, ROLE_LABELS, type Role } from "@/lib/roles";
import { Banner } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out";
import { signOutAction } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { school, session } = await requireUser();
  const on = await enabledModules(school.id);
  const perms = permissionsFor(session.roles);

  const nav: { href: string; label: string }[] = [{ href: "/", label: "Today" }];
  if (perms.has("attendance.take")) nav.push({ href: "/attendance", label: "Take attendance" });
  if (perms.has("attendance.view_all") && on.has("attendance"))
    nav.push({ href: "/attendance/report", label: "Report" });
  if (perms.has("students.view")) nav.push({ href: "/students", label: "Students" });
  if (perms.has("sections.manage")) nav.push({ href: "/setup", label: "Setup" });
  if (perms.has("users.manage")) nav.push({ href: "/people", label: "People" });
  if (perms.has("school.manage")) nav.push({ href: "/modules", label: "Modules" });
  if (perms.has("school.billing.view")) nav.push({ href: "/billing", label: "Billing" });
  if (perms.has("audit.view")) nav.push({ href: "/audit", label: "Audit log" });

  return (
    <div className="min-h-full">
      <header className="brand-bg text-white">
        <div className="mx-auto flex max-w-[72rem] items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0">
            <Link href="/" className="w-wide block truncate text-[1.0625rem] font-bold">
              {school.name}
            </Link>
            <p className="w-narrow truncate text-[0.75rem] text-white/60">
              {school.subdomain}
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <span className="hidden min-w-0 text-right leading-tight sm:block">
              <span className="block truncate">{session.name}</span>
              <span className="w-narrow block truncate text-[0.75rem] text-white/60">
                {session.roles.map((r) => ROLE_LABELS[r as Role] ?? r).join(", ")}
              </span>
            </span>
            <SignOutButton action={signOutAction} />
          </div>
        </div>

        {/* Tabbed dividers, the way a binder is indexed. */}
        <nav className="bg-[#25456a]">
          <div className="mx-auto flex max-w-[72rem] overflow-x-auto px-5 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap border-b-[3px] border-transparent px-3 py-2.5 text-white/85 first:pl-0 hover:border-white/30 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-[72rem] space-y-9 px-5 py-8">
        {school.status === "past_due" && (
          <Banner tone="warn">
            An invoice is past due. Everything still works. Settle it from
            Billing and nothing changes.
          </Banner>
        )}
        {school.status === "trial" && school.trialEndsAt && (
          <Banner>
            Free trial until{" "}
            {school.trialEndsAt.toLocaleDateString("en-PH", {
              day: "numeric",
              month: "long",
            })}
            .
          </Banner>
        )}
        {children}
      </div>
    </div>
  );
}
