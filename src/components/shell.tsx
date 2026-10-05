"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar } from "./ui";
import { ChevronRightIcon } from "./icons";

/**
 * The school's logo where it has one, its initials where it has not. The
 * image is contained rather than cropped — a school's mark is not ours to
 * trim — and sits on the same square so the header never shifts.
 */
function BrandMark({ brand, logoUrl }: { brand: string; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the file is on
      // our own origin or the school's bucket; next/image would need both
      // configured per school.
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        className="h-8 w-8 shrink-0 rounded-control border border-line bg-surface object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-[13px] font-semibold"
      style={{
        background: "var(--school-badge, var(--primary))",
        color: "var(--school-badge-fg, #FAFAFA)",
      }}
    >
      {brand
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("")}
    </span>
  );
}

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Shown in the phone tab bar as well as the sidebar. */
  primary?: boolean;
  group?: string;
};

/**
 * One shell for the school app and the platform admin: a 240px sidebar from
 * lg up, a 56px header carrying the breadcrumb and the page's one action, and
 * a fixed tab bar on a phone. Teachers work on a phone and office staff work
 * on a desktop, so neither is the afterthought.
 */
export function AppShell({
  brand,
  subBrand,
  logoUrl,
  nav,
  user,
  signOut,
  children,
}: {
  brand: string;
  subBrand: string;
  /** The school's own logo, if it has uploaded one. Initials stand in. */
  logoUrl?: string | null;
  nav: NavItem[];
  user: { name: string; detail: string };
  signOut: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const current = nav.find((n) => isCurrent(n.href));
  const tabs = nav.filter((n) => n.primary).slice(0, 5);

  const groups: { name: string | undefined; items: NavItem[] }[] = [];
  for (const item of nav) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Sidebar, desktop only */}
      <nav
        aria-label="Sections"
        className="hidden shrink-0 flex-col gap-4 border-r border-line bg-ground p-3 lg:flex lg:w-60"
      >
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <BrandMark brand={brand} logoUrl={logoUrl} />
          <span className="min-w-0">
            <span className="block truncate font-semibold leading-tight">{brand}</span>
            <span className="block truncate text-xs leading-tight text-muted">{subBrand}</span>
          </span>
        </div>

        {groups.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-0.5">
            {group.name && (
              <div className="px-2 pb-1 text-xs font-medium text-muted">{group.name}</div>
            )}
            {group.items.map((item) => {
              const on = isCurrent(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-2 rounded-control px-2 no-underline ${
                    on ? "bg-hover font-medium text-primary" : "text-ink hover:bg-subtle"
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}

        <div className="mt-auto flex items-center gap-2.5 border-t border-line px-2 pt-3">
          <Avatar name={user.name} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium leading-tight">{user.name}</span>
            <span className="block truncate text-xs leading-tight text-muted">{user.detail}</span>
          </span>
        </div>
        <div className="px-2 pb-1">{signOut}</div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone header */}
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5 lg:hidden">
          <Avatar name={user.name} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold leading-tight">{user.name}</span>
            <span className="block truncate text-[13px] leading-tight text-muted">{brand}</span>
          </span>
          {signOut}
        </header>

        {/* Desktop header: where you are, and the page's one action */}
        <header className="hidden min-h-14 items-center gap-4 border-b border-line bg-surface px-[var(--gutter)] py-2 lg:flex">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
            <span className="text-muted">{subBrand}</span>
            <ChevronRightIcon size={14} className="shrink-0 text-muted" />
            <span className="truncate font-medium">{current?.label ?? "Home"}</span>
          </nav>
        </header>

        <main className="min-w-0 flex-1 bg-surface px-[var(--gutter)] pb-28 pt-6 lg:pb-12">
          <div className="mx-auto flex max-w-[1080px] flex-col gap-6">{children}</div>
        </main>
      </div>

      {/* Phone tab bar */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-line bg-surface px-2 pb-2.5 pt-1.5 lg:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((item) => {
          const on = isCurrent(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={`flex h-13 min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-control text-xs no-underline ${
                on ? "bg-subtle font-semibold text-ink" : "font-medium text-muted"
              }`}
            >
              {item.icon}
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
