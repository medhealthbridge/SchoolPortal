import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { activeStudentCount } from "@/lib/invoicing";
import { TIERS, peso } from "@/lib/pricing";
import { EmptyState, PageHeader, Pill, Section, StatGrid, StatTile, Table } from "@/components/ui";
import { prettyDate } from "@/lib/format";
import { CreateSchoolForm } from "./create-school-form";

export const metadata = { title: "Schools" };

const STATUS_TONE = {
  trial: "neutral",
  active: "ok",
  past_due: "warn",
  suspended: "danger",
} as const;

export default async function SchoolsPage() {
  await requireAdmin();
  const root = process.env.ROOT_DOMAIN ?? "lvh.me:3000";
  const protocol = root.includes("lvh.me") || root.startsWith("localhost") ? "http" : "https";

  const rows = await db.select().from(schools).orderBy(desc(schools.createdAt));
  const counts = await Promise.all(rows.map((s) => activeStudentCount(s.id)));
  const students = counts.reduce((n, c) => n + c, 0);
  const paying = rows.filter((s) => s.status === "active" || s.status === "past_due").length;

  return (
    <>
      <PageHeader title="Schools" meta={`${rows.length} on the platform`} />

      <Section
        title="Add a school"
        subtitle="For a school you signed up yourself. It starts on a 30-day trial, and the owner chooses their own password from the link this gives you."
      >
        <CreateSchoolForm root={root} />
      </Section>

      {rows.length > 0 && (
        <StatGrid>
          <StatTile label="Schools" value={rows.length} caption={`${paying} past the trial`} />
          <StatTile
            label="Active students"
            value={students.toLocaleString("en-PH")}
            caption="Counted on the 1st of the month"
          />
          <StatTile
            label="Suspended"
            value={rows.filter((s) => s.status === "suspended").length}
            caption="Data kept, logins blocked"
          />
        </StatGrid>
      )}

      <Section title="Every school" flush={rows.length > 0}>
        {rows.length === 0 ? (
          <EmptyState title="No school has registered yet">
            The first one arrives through the public site&apos;s registration wizard.
          </EmptyState>
        ) : (
          <Table head={["School", "Address", "Tier", "Students", "Status", "Since"]} minWidth={720}>
            {rows.map((s, i) => (
              <tr key={s.id}>
                <th scope="row" className="text-left font-medium">
                  <Link href={`/schools/${s.id}`} className="underline underline-offset-2">
                    {s.name}
                  </Link>
                </th>
                <td>
                  <a
                    href={`${protocol}://${s.subdomain}.${root}`}
                    className="text-muted underline underline-offset-2"
                  >
                    {s.subdomain}
                  </a>
                </td>
                <td>
                  {TIERS[s.tier].name}
                  <span className="block text-[13px] text-muted">
                    {peso(TIERS[s.tier].platformFeeCentavos)} a year
                  </span>
                </td>
                <td>{counts[i]}</td>
                <td>
                  <Pill tone={STATUS_TONE[s.status]}>{s.status.replace("_", " ")}</Pill>
                </td>
                <td className="whitespace-nowrap text-muted">{prettyDate(s.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
