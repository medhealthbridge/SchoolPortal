import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  actions,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {subtitle && (
              <p className="mt-0.5 text-sm text-black/60 dark:text-white/60">{subtitle}</p>
            )}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "accent" | "ghost" | "danger" }) {
  const styles = {
    primary: "brand-bg text-white hover:opacity-90",
    accent: "accent-bg accent-text hover:opacity-90",
    ghost: "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10",
    danger: "bg-[#b3261e] text-white hover:opacity-90",
  }[variant];
  return <button {...props} className={`${buttonBase} ${styles} ${className}`} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: "primary" | "accent" | "ghost" }) {
  const styles = {
    primary: "brand-bg text-white hover:opacity-90",
    accent: "accent-bg accent-text hover:opacity-90",
    ghost: "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10",
  }[variant];
  return <Link {...props} className={`${buttonBase} ${styles} ${className}`} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-black/55 dark:text-white/55">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 dark:border-white/20 dark:bg-white/5";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/55 dark:border-white/10 dark:text-white/55">
            {head.map((h, i) => (
              <th key={i} className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/10">{children}</tbody>
      </table>
    </div>
  );
}

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "danger";
  children: ReactNode;
}) {
  const styles = {
    info: "border-[var(--brand)]/30 bg-brand-50 text-[#1b3049]",
    warn: "border-[#a35c00]/30 bg-[#fff3df] text-[#5a3a00]",
    danger: "border-[#b3261e]/30 bg-[#fdeceb] text-[#7a1a14]",
  }[tone];
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`} role="status">
      {children}
    </div>
  );
}

/**
 * Attendance never relies on colour alone: every status carries its letter.
 */
export const STATUS_META = {
  present: { letter: "P", label: "Present", color: "var(--color-present)" },
  absent: { letter: "A", label: "Absent", color: "var(--color-absent)" },
  late: { letter: "L", label: "Late", color: "var(--color-late)" },
  excused: { letter: "E", label: "Excused", color: "var(--color-excused)" },
} as const;

export type AttendanceStatus = keyof typeof STATUS_META;

export function StatusBadge({ status }: { status: AttendanceStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: m.color }}
    >
      <span aria-hidden className="font-mono">{m.letter}</span>
      {m.label}
    </span>
  );
}
