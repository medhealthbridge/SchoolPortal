import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { SignOutButton } from "@/components/sign-out";
import { adminSignOut } from "../login/actions";

export default async function AdminDash({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const nav = [
    { href: "/", label: "Schools" },
    { href: "/invoices", label: "Invoices" },
    { href: "/messages", label: "Outbox" },
  ];
  return (
    <div className="min-h-full">
      <header className="bg-[#1b3049] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <span className="w-wide text-[1.0625rem] font-bold">SchoolPortal</span>
            <span className="w-narrow ml-2 text-[0.8125rem] text-white/65">platform admin</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-85">{admin.name}</span>
            <SignOutButton action={adminSignOut} />
          </div>
        </div>
        <nav className="border-t border-white/15">
          <div className="mx-auto flex max-w-6xl gap-1 px-3 py-1 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap border-b-[3px] border-transparent px-3 py-2.5 text-white/85 first:pl-0 hover:border-white/30 hover:text-white">
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-6">{children}</div>
    </div>
  );
}
