import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { activeStudentCount } from "@/lib/invoicing";
import { TIERS, peso } from "@/lib/pricing";
import { Section, Table } from "@/components/ui";
import { prettyDate } from "@/lib/format";

export const metadata = { title: "Schools" };

const STATUS_TONE: Record<string, string> = {
  trial: "border-[var(--brand)] text-[var(--brand)]",
  active: "border-[var(--color-present)] text-[var(--color-present)]",
  past_due: "border-[var(--color-late)] text-[var(--color-late)]",
  suspended: "border-[var(--color-absent)] text-[var(--color-absent)]",
};

export default async function SchoolsPage() {
  await requireAdmin();
  const root = process.env.ROOT_DOMAIN ?? "lvh.me:3000";
  const protocol = root.includes("lvh.me") || root.startsWith("localhost") ? "http" : "https";
  const rows = await db.select().from(schools).orderBy(desc(schools.createdAt));
  const counts = await Promise.all(rows.map((s) => activeStudentCount(s.id)));

  return (
    <div className="grid gap-5">
      <Section title="Schools" subtitle={`${rows.length} on the platform`}>
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">No schools have registered yet.</p>
        ) : (
          <Table head={["School", "Address", "Tier", "Students", "Status", "Since"]}>
            {rows.map((s, i) => (
              <tr key={s.id}>
                <td className="py-2 pr-5 font-medium">
                  <Link href={`/schools/${s.id}`} className="underline">
                    {s.name}
                  </Link>
                </td>
                <td className="py-2 pr-5">
                  <a
                    href={`${protocol}://${s.subdomain}.${root}`}
                    className="text-[var(--brand)] underline underline-offset-2"
                  >
                    {s.subdomain}
                  </a>
                </td>
                <td className="py-2 pr-5">
                  {TIERS[s.tier].name}
                  <span className="block text-xs text-[var(--ink-faint)]">
                    {peso(TIERS[s.tier].platformFeeCentavos)}/yr
                  </span>
                </td>
                <td className="py-2 pr-5 tabular-nums">{counts[i]}</td>
                <td className="py-2 pr-5">
                  <span className={`inline-block border-l-2 pl-2 text-sm font-medium ${STATUS_TONE[s.status]}`}>
                    {s.status.replace("_", " ")}
                  </span>
                </td>
                <td className="py-2 pr-5 text-xs">{prettyDate(s.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}
