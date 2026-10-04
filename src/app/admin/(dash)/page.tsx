import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { schools } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { activeStudentCount } from "@/lib/invoicing";
import { TIERS, peso } from "@/lib/pricing";
import { Card, Table } from "@/components/ui";
import { prettyDate } from "@/lib/format";

export const metadata = { title: "Schools" };

const STATUS_TONE: Record<string, string> = {
  trial: "bg-brand-50 text-[#1b3049]",
  active: "bg-[#e6f4ec] text-[#14532d]",
  past_due: "bg-[#fff3df] text-[#5a3a00]",
  suspended: "bg-[#fdeceb] text-[#7a1a14]",
};

export default async function SchoolsPage() {
  await requireAdmin();
  const rows = await db.select().from(schools).orderBy(desc(schools.createdAt));
  const counts = await Promise.all(rows.map((s) => activeStudentCount(s.id)));

  return (
    <div className="grid gap-5">
      <Card title="Schools" subtitle={`${rows.length} on the platform`}>
        {rows.length === 0 ? (
          <p className="text-sm text-black/60">No schools have registered yet.</p>
        ) : (
          <Table head={["School", "Address", "Tier", "Students", "Status", "Since"]}>
            {rows.map((s, i) => (
              <tr key={s.id}>
                <td className="py-2 pr-4 font-medium">
                  <Link href={`/schools/${s.id}`} className="underline">
                    {s.name}
                  </Link>
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{s.subdomain}</td>
                <td className="py-2 pr-4">
                  {TIERS[s.tier].name}
                  <span className="block text-xs text-black/55">
                    {peso(TIERS[s.tier].platformFeeCentavos)}/yr
                  </span>
                </td>
                <td className="py-2 pr-4 tabular-nums">{counts[i]}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[s.status]}`}>
                    {s.status.replace("_", " ")}
                  </span>
                </td>
                <td className="py-2 pr-4 text-xs">{prettyDate(s.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
