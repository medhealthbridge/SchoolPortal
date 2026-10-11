import { requireAdmin } from "@/lib/guard";
import { AppShell, type NavItem } from "@/components/shell";
import { SignOutButton } from "@/components/sign-out";
import { BuildingIcon, CardIcon, ReportIcon } from "@/components/icons";
import { adminSignOut } from "../login/actions";

export default async function AdminDash({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  const nav: NavItem[] = [
    { href: "/", label: "Schools", icon: <BuildingIcon />, primary: true, group: "Platform" },
    { href: "/invoices", label: "Invoices", icon: <CardIcon />, primary: true, group: "Platform" },
    { href: "/messages", label: "Outbox", icon: <ReportIcon />, primary: true, group: "Platform" },
  ];

  return (
    <AppShell
      brand="SchoolPortal"
      subBrand="Platform admin"
      nav={nav}
      user={{ name: admin.name, detail: admin.email }}
      signOut={<SignOutButton action={adminSignOut} />}
    >
      {children}
    </AppShell>
  );
}
