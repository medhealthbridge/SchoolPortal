import { requireUser } from "@/lib/guard";
import { enabledModules } from "@/lib/tenant";
import { permissionsFor, ROLE_LABELS, type Role } from "@/lib/roles";
import { AppShell, type NavItem } from "@/components/shell";
import { SignOutButton } from "@/components/sign-out";
import { Callout, LinkButton } from "@/components/ui";
import {
  CalendarIcon,
  CardIcon,
  ClipboardCheckIcon,
  GridIcon,
  PeopleIcon,
  ReportIcon,
  ClockIcon,
  LockIcon,
} from "@/components/icons";
import { signOutAction } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { school, session } = await requireUser();
  const on = await enabledModules(school.id);
  const perms = permissionsFor(session.roles);

  const nav: NavItem[] = [
    { href: "/", label: "Today", icon: <CalendarIcon />, primary: true, group: "School" },
  ];
  if (perms.has("attendance.take") && on.has("attendance"))
    nav.push({
      href: "/attendance",
      label: "Attendance",
      icon: <ClipboardCheckIcon />,
      primary: true,
      group: "School",
    });
  if (perms.has("attendance.view_all") && on.has("attendance"))
    nav.push({
      href: "/attendance/report",
      label: "Reports",
      icon: <ReportIcon />,
      primary: true,
      group: "School",
    });
  if (perms.has("students.view"))
    nav.push({
      href: "/students",
      label: "Students",
      icon: <PeopleIcon />,
      primary: true,
      group: "School",
    });
  if (perms.has("sections.manage"))
    nav.push({ href: "/setup", label: "Setup", icon: <ClockIcon />, group: "Manage" });
  if (perms.has("users.manage"))
    nav.push({ href: "/people", label: "People", icon: <PeopleIcon />, group: "Manage" });
  if (perms.has("school.manage"))
    nav.push({ href: "/modules", label: "Modules", icon: <GridIcon />, group: "Manage" });
  if (perms.has("school.billing.view"))
    nav.push({ href: "/billing", label: "Billing", icon: <CardIcon />, group: "Manage" });
  if (perms.has("audit.view"))
    nav.push({ href: "/audit", label: "Audit log", icon: <LockIcon />, group: "Manage" });

  // The phone tab bar takes five; whatever is left lives behind "More".
  const tabbed = nav.filter((n) => n.primary).length;
  if (tabbed < 5 && nav.length > tabbed) {
    const firstManage = nav.find((n) => !n.primary);
    if (firstManage) firstManage.primary = true;
  }

  return (
    <AppShell
      brand={school.name}
      subBrand={school.subdomain}
      nav={nav}
      user={{
        name: session.name,
        detail: session.roles.map((r) => ROLE_LABELS[r as Role] ?? r).join(", "),
      }}
      signOut={<SignOutButton action={signOutAction} />}
    >
      {school.status === "past_due" && (
        <Callout
          tone="warn"
          title="An invoice is past due"
          action={
            <LinkButton href="/billing" variant="secondary" size="sm">
              Open Billing
            </LinkButton>
          }
        >
          Everything still works. Settle it and nothing changes.
        </Callout>
      )}
      {school.status === "trial" && school.trialEndsAt && (
        <Callout tone="info" title="Free trial">
          Full access until{" "}
          {school.trialEndsAt.toLocaleDateString("en-PH", { day: "numeric", month: "long" })}.
        </Callout>
      )}
      {children}
    </AppShell>
  );
}
