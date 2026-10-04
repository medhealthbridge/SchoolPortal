import Link from "next/link";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="brand-bg text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            SchoolPortal
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/#features" className="hover:underline">
              Features
            </Link>
            <Link href="/#pricing" className="hover:underline">
              Pricing
            </Link>
            <Link
              href="/register"
              className="accent-bg accent-text rounded-lg px-3 py-1.5 font-medium"
            >
              Register your school
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mt-16 border-t border-black/10 py-8 text-center text-xs text-black/50 dark:border-white/10 dark:text-white/50">
        SchoolPortal · each school on its own address, one shared core
      </footer>
    </div>
  );
}
