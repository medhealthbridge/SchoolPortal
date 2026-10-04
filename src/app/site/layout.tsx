import Link from "next/link";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="brand-bg text-white">
        <div className="mx-auto flex max-w-[72rem] flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="w-wide text-[1.125rem] font-bold">
            SchoolPortal
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/#modules" className="hover:underline">
              Modules
            </Link>
            <Link href="/#pricing" className="hover:underline">
              Pricing
            </Link>
            <Link
              href="/register"
              className="rounded-[2px] bg-[var(--accent)] px-3 py-1.5 font-medium text-[#5c3800]"
            >
              Register your school
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mt-20 border-t border-[var(--rule)]">
        <div className="mx-auto max-w-[72rem] px-5 py-8 text-sm text-[var(--ink-faint)]">
          SchoolPortal, one class record kept for the whole school.
        </div>
      </footer>
    </div>
  );
}
