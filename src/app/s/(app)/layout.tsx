import { requireUser } from "@/lib/guard";
import { enabledModules } from "@/lib/tenant";
import { permissionsFor, ROLE_LABELS, type Role, type Permission } from "@/lib/roles";
import type { ModuleKey } from "@/lib/modules";
import { AppShell, type NavItem } from "@/components/shell";
import { SignOutButton } from "@/components/sign-out";
import { Callout, LinkButton } from "@/components/ui";
import {
  CalendarIcon,
  CardIcon,
  ClipboardCheckIcon,
  ClockIcon,
  GridIcon,
  InfoIcon,
  LockIcon,
  PeopleIcon,
  ReportIcon,
  BuildingIcon,
  CheckIcon,
} from "@/components/icons";
import { signOutAction } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { school, session } = await requireUser();
  const on = await enabledModules(school.id);
  const perms = permissionsFor(session.roles);

  /** A screen appears when its module is on AND the role may reach it. */
  const entry = (
    item: Omit<NavItem, "primary"> & { primary?: boolean },
    needs: Permission[],
    module?: ModuleKey,
  ): NavItem[] => {
    if (module && !on.has(module)) return [];
    return needs.some((p) => perms.has(p)) ? [item as NavItem] : [];
  };

  const nav: NavItem[] = [
    { href: "/", label: "Today", icon: <CalendarIcon />, primary: true, group: "School" },
    ...entry(
      { href: "/attendance", label: "Attendance", short: "Classes", icon: <ClipboardCheckIcon />, primary: true, group: "School" },
      ["attendance.take"],
      "attendance",
    ),
    ...entry(
      { href: "/attendance/report", label: "Attendance report", short: "Report", icon: <ReportIcon />, group: "School" },
      ["attendance.view_all"],
      "attendance",
    ),
    ...entry(
      { href: "/grades", label: "Grades", icon: <CheckIcon />, primary: true, group: "School" },
      ["grades.enter", "grades.view_all"],
      "grades",
    ),
    ...entry(
      { href: "/announcements", label: "Announcements", short: "Notices", icon: <InfoIcon />, group: "School" },
      ["portal.post", "attendance.view_own_children", "attendance.view_own", "students.view"],
      "portal",
    ),
    ...entry(
      perms.has("attendance.view_own_children")
        ? { href: "/me", label: "My children", short: "Children", icon: <PeopleIcon />, primary: true, group: "School" }
        : { href: "/me", label: "My records", short: "Records", icon: <PeopleIcon />, primary: true, group: "School" },
      ["attendance.view_own_children", "attendance.view_own", "grades.view_own"],
    ),
    ...entry(
      { href: "/schedule", label: "Schedule", icon: <ClockIcon />, group: "School" },
      [
        "timetable.manage",
        "attendance.take",
        "attendance.view_own",
        "attendance.view_own_children",
      ],
    ),
    ...entry(
      { href: "/classes", label: "My classes", short: "Classes", icon: <PeopleIcon />, group: "School" },
      ["attendance.take"],
    ),
    ...entry(
      { href: "/students", label: "Students", icon: <PeopleIcon />, primary: true, group: "School" },
      ["students.view"],
    ),
    ...entry(
      { href: "/teachers", label: "Teachers", icon: <PeopleIcon />, group: "School" },
      ["staff.manage"],
    ),

    ...entry(
      { href: "/discipline", label: "Discipline", icon: <LockIcon />, group: "Student life" },
      ["discipline.report", "discipline.manage"],
      "discipline",
    ),
    ...entry(
      { href: "/guidance", label: "Guidance", icon: <PeopleIcon />, group: "Student life" },
      ["guidance.manage"],
      "guidance",
    ),
    ...entry(
      { href: "/sao", label: "Student affairs", short: "Affairs", icon: <GridIcon />, group: "Student life" },
      ["sao.manage"],
      "sao",
    ),
    ...entry(
      { href: "/chaplain", label: "Ministry", icon: <InfoIcon />, group: "Student life" },
      ["chaplain.manage"],
      "chaplain",
    ),

    ...entry(
      { href: "/registrar", label: "Registrar", icon: <BuildingIcon />, group: "Operations" },
      ["registrar.manage"],
      "registrar",
    ),
    ...entry(
      { href: "/fees", label: "School fees", short: "Fees", icon: <CardIcon />, group: "Operations" },
      ["fees.manage"],
      "billing",
    ),
    ...entry(
      { href: "/analytics", label: "Analytics", icon: <ReportIcon />, group: "Operations" },
      ["analytics.view"],
      "analytics",
    ),

    ...entry({ href: "/setup", label: "Setup", icon: <ClockIcon />, group: "Manage" }, [
      "sections.manage",
    ]),
    ...entry({ href: "/people", label: "People", icon: <PeopleIcon />, group: "Manage" }, [
      "users.manage",
    ]),
    ...entry({ href: "/modules", label: "Modules", icon: <GridIcon />, group: "Manage" }, [
      "school.manage",
    ]),
    ...entry({ href: "/billing", label: "Subscription", short: "Plan", icon: <CardIcon />, group: "Manage" }, [
      "school.billing.view",
    ]),
    ...entry({ href: "/audit", label: "Audit log", short: "Audit", icon: <LockIcon />, group: "Manage" }, [
      "audit.view",
    ]),
  ];

  // The phone tab bar takes five. Fill any spare slots from the top down.
  let tabbed = nav.filter((n) => n.primary).length;
  for (const item of nav) {
    if (tabbed >= 5) break;
    if (!item.primary) {
      item.primary = true;
      tabbed += 1;
    }
  }

  return (
    <AppShell
      brand={school.name}
      subBrand={school.subdomain}
      logoUrl={school.logoUrl}
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
