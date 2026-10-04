import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * The kit is a record book, not a dashboard.
 *
 * A Section is a 2px rule with its name beneath it — the rule is the
 * container, so nothing floats and nothing casts a shadow. A Panel is the one
 * exception: a bound page, used where content genuinely needs an edge.
 * Documents keep square corners; controls get 2px, because they are touched.
 */

export function Section({
  title,
  subtitle,
  children,
  actions,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="ledger-rule min-w-0 pt-3">
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            {title && (
              <h2 className="w-wide text-[1.0625rem] font-semibold leading-tight text-[var(--ink)]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 max-w-[62ch] text-sm leading-snug text-[var(--ink-soft)]">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`ledger-page p-5 ${className}`}>{children}</div>;
}

/**
 * Meta items divided by a hairline, the way a form divides its columns. The
 * divider trails its item rather than leading the next, so a wrap leaves the
 * rule at the end of a line instead of dangling at the start of one.
 */
export function Meta({ items }: { items: ReactNode[] }) {
  const shown = items.filter(Boolean);
  return (
    <span className="flex flex-wrap items-center gap-y-0.5 text-sm text-[var(--ink-soft)]">
      {shown.map((item, i) => (
        <span key={i} className="inline-flex items-center">
          {item}
          {i < shown.length - 1 && (
            <span
              aria-hidden
              className="mx-3 inline-block h-3.5 w-px bg-[var(--rule)]"
            />
          )}
        </span>
      ))}
    </span>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[2px] px-4 py-2 text-sm font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "accent" | "ghost" | "danger";
}) {
  const styles = {
    primary: "bg-[var(--brand)] text-white hover:bg-[#25456a]",
    accent: "bg-[var(--accent)] text-[#5c3800] hover:bg-[#f09a1a]",
    ghost:
      "border border-[var(--ink-soft)] text-[var(--ink)] hover:bg-[var(--paper-sunken)]",
    danger: "bg-[#b3261e] text-white hover:bg-[#95201a]",
  }[variant];
  return <button {...props} className={`${buttonBase} ${styles} ${className}`} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: "primary" | "accent" | "ghost" }) {
  const styles = {
    primary: "bg-[var(--brand)] text-white hover:bg-[#25456a]",
    accent: "bg-[var(--accent)] text-[#5c3800] hover:bg-[#f09a1a]",
    ghost:
      "border border-[var(--ink-soft)] text-[var(--ink)] hover:bg-[var(--paper-sunken)]",
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
      <span className="w-narrow mb-1 block text-[0.8125rem] font-medium tracking-[0.01em] text-[var(--ink-soft)]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block max-w-[52ch] text-xs leading-snug text-[var(--ink-faint)]">
          {hint}
        </span>
      )}
    </label>
  );
}

/* An input is a ruled blank to write on, underlined rather than boxed. */
export const inputClass =
  "w-full rounded-[2px] border border-[var(--rule)] border-b-2 border-b-[var(--ink-soft)] bg-[var(--paper-raised)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-b-[var(--brand)]";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

/** Column heads are condensed, as they are on a form that must fit them. */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--ink-soft)] text-left align-bottom">
            {head.map((h, i) => (
              <th
                key={i}
                className="w-narrow pb-1.5 pr-5 text-[0.8125rem] font-medium text-[var(--ink-soft)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-[var(--rule-soft)]">{children}</tbody>
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
  const edge = {
    info: "var(--brand)",
    warn: "var(--color-late)",
    danger: "var(--color-absent)",
  }[tone];
  return (
    <div
      role="status"
      className="bg-[var(--paper-raised)] py-2.5 pl-4 pr-4 text-sm leading-snug text-[var(--ink)]"
      style={{ borderLeft: `3px solid ${edge}` }}
    >
      {children}
    </div>
  );
}

/**
 * Attendance is never colour alone: every status carries its letter, exactly
 * as it is written into a record book.
 */
export const STATUS_META = {
  present: { letter: "P", label: "Present", color: "var(--color-present)" },
  absent: { letter: "A", label: "Absent", color: "var(--color-absent)" },
  late: { letter: "L", label: "Late", color: "var(--color-late)" },
  excused: { letter: "E", label: "Excused", color: "var(--color-excused)" },
} as const;

export type AttendanceStatus = keyof typeof STATUS_META;

export const STATUS_ORDER: AttendanceStatus[] = ["present", "absent", "late", "excused"];

export function StatusBadge({ status }: { status: AttendanceStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        aria-hidden
        className="inline-flex h-[18px] w-[18px] items-center justify-center text-[11px] font-bold text-white"
        style={{ backgroundColor: m.color }}
      >
        {m.letter}
      </span>
      {m.label}
    </span>
  );
}

/**
 * The shape of a day in one strip: the four counts in proportion, read at a
 * glance, with the numbers underneath rather than four separate stat tiles.
 */
export function Tally({
  counts,
  size = "md",
}: {
  counts: Record<AttendanceStatus, number>;
  size?: "sm" | "md";
}) {
  const total = STATUS_ORDER.reduce((n, k) => n + counts[k], 0);
  return (
    <div>
      <div
        className={`flex w-full overflow-hidden ${size === "sm" ? "h-2" : "h-3"} bg-[var(--paper-sunken)]`}
        role="img"
        aria-label={STATUS_ORDER.map((k) => `${counts[k]} ${STATUS_META[k].label.toLowerCase()}`).join(
          ", ",
        )}
      >
        {total > 0 &&
          STATUS_ORDER.map((k) =>
            counts[k] > 0 ? (
              <span
                key={k}
                style={{
                  width: `${(counts[k] / total) * 100}%`,
                  backgroundColor: STATUS_META[k].color,
                }}
              />
            ) : null,
          )}
      </div>
      <dl className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5">
        {STATUS_ORDER.map((k) => (
          <div key={k} className="flex items-baseline gap-1.5">
            <dt className="flex items-baseline gap-1.5 text-sm text-[var(--ink-soft)]">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 translate-y-[1px]"
                style={{ backgroundColor: STATUS_META[k].color }}
              />
              {STATUS_META[k].label}
            </dt>
            <dd className="text-base font-semibold text-[var(--ink)]">{counts[k]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * "Nine of fifteen classes have submitted" is a question about which ones, so
 * show the fifteen.
 */
export function Progress({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-1" role="img" aria-label={`${done} of ${total} ${label}`}>
        {Array.from({ length: Math.max(total, done) }, (_, i) => (
          <span
            key={i}
            className="h-3.5 w-3.5 border"
            style={{
              borderColor: i < done ? "var(--brand)" : "var(--rule)",
              backgroundColor: i < done ? "var(--brand)" : "transparent",
            }}
          />
        ))}
      </div>
      <p className="mt-2.5 text-sm text-[var(--ink-soft)]">
        <span className="text-base font-semibold text-[var(--ink)]">
          {done} of {total}
        </span>{" "}
        {label}
      </p>
    </div>
  );
}

/** A seat, marked the way a cell on the form is marked. */
export function SeatChip({
  name,
  secondary,
  status,
  onTap,
  title,
}: {
  name: string;
  secondary?: string;
  status: AttendanceStatus;
  onTap?: () => void;
  title?: string;
}) {
  const m = STATUS_META[status];
  const marked = status !== "present";
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${name}: ${m.label}`}
      title={title ?? name}
      className="flex w-full items-stretch gap-2 rounded-[2px] bg-[var(--paper-raised)] p-0 text-left transition-transform active:scale-[0.97]"
      style={{
        border: `1px solid ${marked ? m.color : "var(--rule)"}`,
        borderLeftWidth: 4,
        borderLeftColor: m.color,
        backgroundColor: marked ? "color-mix(in srgb, " + m.color + " 8%, var(--paper-raised))" : undefined,
      }}
    >
      <span className="min-w-0 flex-1 py-1.5 pl-2 leading-tight">
        <span className="block truncate text-[0.8125rem] font-medium text-[var(--ink)]">
          {name}
        </span>
        {secondary && (
          <span className="w-narrow block truncate text-[0.6875rem] text-[var(--ink-faint)]">
            {secondary}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className="w-narrow self-stretch px-1.5 pt-1.5 text-[0.8125rem] font-bold"
        style={{ color: m.color }}
      >
        {m.letter}
      </span>
    </button>
  );
}
