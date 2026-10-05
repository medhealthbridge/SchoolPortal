import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertIcon, CheckIcon, InfoIcon, OfflineIcon } from "./icons";

/**
 * The SchoolPortal kit. The system it implements is documented in
 * .claude/skills/schoolportal-ui — read that before adding to this file.
 *
 * Neutral greys, white cards on a near-white ground, one near-black for every
 * primary action, and colour kept for the four attendance marks.
 */

/* ------------------------------------------------------------------ *
 * Page furniture
 * ------------------------------------------------------------------ */

export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {meta && <p className="mt-1 text-muted">{meta}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/**
 * The workhorse surface. `flush` drops the body padding so a table can meet
 * the card's edges.
 */
export function Section({
  title,
  subtitle,
  children,
  actions,
  flush = false,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="min-w-0 rounded-card border border-line bg-surface shadow-card"
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold leading-none">{title}</h2>}
            {subtitle && (
              <p className="mt-1.5 max-w-[70ch] text-muted">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : `px-5 pb-5 sm:px-6 ${title || actions ? "" : "pt-5"}`}>
        {children}
      </div>
    </section>
  );
}

/** A card with no header, for a sign-in form or a standalone message. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-line bg-surface p-5 shadow-card sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

/** Secondary facts on one line, in the product's own separator. */
export function Meta({ items }: { items: ReactNode[] }) {
  const shown = items.filter(Boolean);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted">
      {shown.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 && <span aria-hidden>·</span>}
          {item}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const buttonSizes = { md: "h-11", lg: "h-12 text-[15px]", sm: "h-9 px-3" };

const buttonVariants = {
  primary: "bg-primary text-[#FAFAFA] hover:bg-black",
  secondary: "border border-line bg-surface text-ink shadow-control hover:bg-subtle",
  danger: "bg-[var(--absent-solid)] text-white hover:brightness-95",
  ghost: "text-ink hover:bg-subtle",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
}) {
  return (
    <button
      {...props}
      className={`${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`}
    />
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
}) {
  return (
    <Link
      {...props}
      className={`${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} no-underline ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block max-w-[54ch] text-[13px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-ink shadow-control outline-none placeholder:text-muted";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={`${inputClass} h-auto min-h-[88px] py-2 ${props.className ?? ""}`}
    />
  );
}

/** A two or three way view switch. */
export function Segmented({
  options,
  current,
}: {
  options: { href: string; label: string; key: string }[];
  current: string;
}) {
  return (
    <div
      className="grid gap-0 rounded-panel bg-subtle p-[3px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.key === current;
        return (
          <Link
            key={o.key}
            href={o.href}
            aria-current={on ? "page" : undefined}
            className={`flex h-10 items-center justify-center rounded-control text-sm font-medium no-underline ${
              on ? "bg-surface text-ink shadow-card" : "text-muted-strong"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

/**
 * Wrap in `<Section flush>`; the scroll box keeps a wide table inside the
 * card instead of stretching the page.
 */
export function Table({
  head,
  children,
  minWidth = 560,
}: {
  head: ReactNode[];
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto border-t border-line">
      <table
        className="w-full border-collapse text-sm"
        style={{ minWidth: `${minWidth}px` }}
      >
        <thead>
          <tr className="text-left text-muted">
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="h-10 border-b border-line px-3 font-medium first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr>*]:border-b [&>tr>*]:border-line [&>tr>*]:px-3 [&>tr>*]:py-3 [&>tr>*:first-child]:pl-5 [&>tr>*:last-child]:pr-5 sm:[&>tr>*:first-child]:pl-6 sm:[&>tr>*:last-child]:pr-6 [&>tr:last-child>*]:border-b-0">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "danger" | "solid";
  children: ReactNode;
}) {
  const styles = {
    neutral: "border border-line bg-surface text-ink",
    ok: "border border-ok-line bg-ok-bg text-ok",
    warn: "border border-warn-line bg-warn-bg text-warn",
    danger: "border border-danger-line bg-danger-bg text-danger",
    solid: "bg-primary text-[#FAFAFA]",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--r-pill)] px-2 py-0.5 text-xs font-medium ${styles}`}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[var(--r-pill)] bg-subtle font-semibold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.39) }}
    >
      {initials}
    </span>
  );
}

/** A label, a number, and a caption that states a fact. */
export function StatTile({
  label,
  value,
  caption,
  pill,
}: {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  pill?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted">{label}</span>
        {pill}
      </div>
      <div className="text-[30px] font-semibold leading-none tracking-[-0.02em]">{value}</div>
      {caption && <div className="text-[13px] text-muted">{caption}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Attendance
 * ------------------------------------------------------------------ */

export const STATUS_META = {
  present: { letter: "P", label: "Present" },
  absent: { letter: "A", label: "Absent" },
  late: { letter: "L", label: "Late" },
  excused: { letter: "E", label: "Excused" },
} as const;

export type AttendanceStatus = keyof typeof STATUS_META;

export const STATUS_ORDER: AttendanceStatus[] = ["present", "absent", "late", "excused"];

export const STATUS_STYLE: Record<
  AttendanceStatus,
  { bg: string; line: string; fg: string; solid: string; solidFg: string; bar: string }
> = {
  present: {
    bg: "var(--present-bg)",
    line: "var(--present-line)",
    fg: "var(--present-fg)",
    solid: "var(--present-solid)",
    solidFg: "var(--present-solid-fg)",
    bar: "var(--bar-present)",
  },
  absent: {
    bg: "var(--absent-bg)",
    line: "var(--absent-line)",
    fg: "var(--absent-fg)",
    solid: "var(--absent-solid)",
    solidFg: "var(--absent-solid-fg)",
    bar: "var(--bar-absent)",
  },
  late: {
    bg: "var(--late-bg)",
    line: "var(--late-line)",
    fg: "var(--late-fg)",
    solid: "var(--late-solid)",
    solidFg: "var(--late-solid-fg)",
    bar: "var(--bar-late)",
  },
  excused: {
    bg: "var(--excused-bg)",
    line: "var(--excused-line)",
    fg: "var(--excused-fg)",
    solid: "var(--excused-solid)",
    solidFg: "var(--excused-solid-fg)",
    bar: "var(--bar-excused)",
  },
};

/** A mark, for reading. Never colour alone: the letter rides along. */
export function StatusBadge({ status }: { status: AttendanceStatus }) {
  const m = STATUS_META[status];
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border px-2 py-0.5 text-xs font-medium"
      style={{ background: s.bg, borderColor: s.line, color: s.fg }}
    >
      <span aria-hidden className="font-semibold">
        {m.letter}
      </span>
      {m.label}
    </span>
  );
}

export type Counts = Record<AttendanceStatus, number>;

/** The four marks in proportion, as one bar. */
export function SplitBar({ counts }: { counts: Counts }) {
  const total = STATUS_ORDER.reduce((n, k) => n + counts[k], 0);
  return (
    <div
      role="img"
      aria-label={STATUS_ORDER.map((k) => `${counts[k]} ${STATUS_META[k].label.toLowerCase()}`).join(
        ", ",
      )}
      className="flex h-2 gap-0.5 overflow-hidden rounded-[var(--r-pill)] bg-subtle"
    >
      {total > 0 &&
        STATUS_ORDER.map((k) =>
          counts[k] > 0 ? (
            <span
              key={k}
              style={{ flex: `${counts[k]} 1 0`, background: STATUS_STYLE[k].bar }}
            />
          ) : null,
        )}
    </div>
  );
}

export function CountLegend({ counts }: { counts: Counts }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
      {STATUS_ORDER.map((k) => (
        <div key={k} className="flex items-baseline gap-1.5">
          <dt className="flex items-baseline gap-1.5 text-muted">
            <span
              aria-hidden
              className="inline-block h-2 w-2 translate-y-[-1px] rounded-[2px]"
              style={{ background: STATUS_STYLE[k].bar }}
            />
            {STATUS_META[k].label}
          </dt>
          <dd className="font-semibold">{counts[k]}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One square per class, filled when it has submitted. The reader's next
 * question after "how many" is "which ones", so show them.
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
      <div
        role="img"
        aria-label={`${done} of ${total} ${label}`}
        className="flex flex-wrap gap-1"
      >
        {Array.from({ length: Math.max(total, done) }, (_, i) => (
          <span
            key={i}
            className="h-3.5 w-3.5 rounded-[3px] border"
            style={{
              borderColor: i < done ? "var(--primary)" : "var(--line-strong)",
              background: i < done ? "var(--primary)" : "transparent",
            }}
          />
        ))}
      </div>
      <p className="mt-2.5 text-muted">
        <span className="font-semibold text-ink">
          {done} of {total}
        </span>{" "}
        {label}
      </p>
    </div>
  );
}

/** One seat. Tapping walks present → absent → late → excused. */
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
  const s = STATUS_STYLE[status];
  const m = STATUS_META[status];
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${name}: ${m.label}. Tap to change.`}
      title={title ?? name}
      className="flex h-[46px] min-w-0 flex-col justify-center rounded-control border px-2 py-0.5 text-left shadow-control transition-transform active:scale-[0.97]"
      style={{ background: s.bg, borderColor: s.line, color: s.fg }}
    >
      <span className="truncate text-xs font-semibold leading-[1.3]">{name}</span>
      <span className="truncate text-xs leading-[1.3] opacity-85">
        {secondary ?? m.label}
      </span>
    </button>
  );
}

/** The P/A/L/E group on a roster row: four joined 44px buttons. */
export function SegmentedStatus({
  value,
  onChange,
  label,
}: {
  value: AttendanceStatus;
  onChange: (next: AttendanceStatus) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 rounded-control shadow-control"
    >
      {STATUS_ORDER.map((k, i) => {
        const on = k === value;
        const s = STATUS_STYLE[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            aria-label={STATUS_META[k].label}
            aria-pressed={on}
            className="h-11 w-11 border text-sm font-medium"
            style={{
              marginLeft: i === 0 ? 0 : -1,
              borderRadius:
                i === 0
                  ? "var(--r-control) 0 0 var(--r-control)"
                  : i === STATUS_ORDER.length - 1
                    ? "0 var(--r-control) var(--r-control) 0"
                    : "0",
              background: on ? s.solid : "var(--surface)",
              borderColor: on ? s.solid : "var(--line)",
              color: on ? s.solidFg : "var(--muted)",
              zIndex: on ? 1 : 0,
              position: "relative",
            }}
          >
            {STATUS_META[k].letter}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Feedback
 * ------------------------------------------------------------------ */

export function Callout({
  tone = "info",
  title,
  children,
  action,
  icon,
}: {
  tone?: "info" | "ok" | "warn" | "danger" | "offline";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  const color = {
    info: "var(--muted)",
    ok: "var(--ok)",
    warn: "var(--warn)",
    danger: "var(--danger-icon)",
    offline: "var(--muted)",
  }[tone];
  const glyph =
    icon ??
    {
      info: <InfoIcon />,
      ok: <CheckIcon />,
      warn: <AlertIcon />,
      danger: <AlertIcon />,
      offline: <OfflineIcon />,
    }[tone];

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-panel border border-line bg-surface px-4 py-3"
    >
      <span className="mt-0.5 shrink-0" style={{ color }}>
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium tracking-[-0.01em]">{title}</div>}
        {children && <div className="text-muted">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/** Kept for the pages that still call it; Callout is the fuller shape. */
export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "danger" | "ok";
  children: ReactNode;
}) {
  return <Callout tone={tone}>{children}</Callout>;
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="py-6">
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-[62ch] text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
