import Link from "next/link";
import { LinkButton } from "@/components/ui";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-[1080px] flex-wrap items-center justify-between gap-3 px-[var(--gutter)] py-2">
          <Link href="/" className="flex items-center gap-2.5 font-semibold no-underline">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-control bg-primary text-xs font-semibold text-[#FAFAFA]"
            >
              SP
            </span>
            SchoolPortal
          </Link>
          <nav className="flex items-center gap-1 sm:gap-3">
            <Link
              href="/#modules"
              className="hidden rounded-control px-3 py-2 text-ink no-underline hover:bg-subtle sm:block"
            >
              Modules
            </Link>
            <Link
              href="/#pricing"
              className="rounded-control px-3 py-2 text-ink no-underline hover:bg-subtle"
            >
              Pricing
            </Link>
            <LinkButton href="/register" size="sm">
              Register your school
            </LinkButton>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-ground">
        <div className="mx-auto max-w-[1080px] px-[var(--gutter)] py-8 text-muted">
          SchoolPortal. One class record, kept for the whole school.
        </div>
      </footer>
    </div>
  );
}
