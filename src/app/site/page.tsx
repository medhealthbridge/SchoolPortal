import Link from "next/link";
import { MODULES, MODULE_KEYS } from "@/lib/modules";
import { PER_STUDENT_CENTAVOS, TIER_LIST, peso, yearTotalCentavos } from "@/lib/pricing";
import { Card, LinkButton, Table } from "@/components/ui";

const EXAMPLES = [
  { label: "Small", tier: "starter" as const, students: 300 },
  { label: "Medium", tier: "academic" as const, students: 800 },
  { label: "Large", tier: "all_in" as const, students: 1500 },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <section className="mb-16">
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight">
          One school platform. Your own address, the modules you need, attendance
          that works without signal.
        </h1>
        <p className="mt-4 max-w-2xl text-black/70 dark:text-white/70">
          Each school gets its own subdomain and a shared core — students, roles,
          billing — with modules it can switch on one at a time. Attendance ships
          first; every other module plugs into the same student record.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <LinkButton href="/register" variant="accent">
            Register your school
          </LinkButton>
          <LinkButton href="/#pricing" variant="ghost">
            See pricing
          </LinkButton>
        </div>
      </section>

      <section id="features" className="mb-16">
        <h2 className="mb-4 text-2xl font-semibold">Modules</h2>
        <p className="mb-5 max-w-2xl text-sm text-black/70 dark:text-white/70">
          Every module works on its own with the core, and gains links
          automatically when a related module is switched on.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_KEYS.map((key) => {
            const m = MODULES[key];
            return (
              <Card key={key} title={m.name} subtitle={m.alwaysOn ? "Always on" : undefined}>
                <p className="text-sm text-black/70 dark:text-white/70">
                  Owns {m.owns.slice(0, 3).join(", ")}
                  {m.owns.length > 3 ? ` and ${m.owns.length - 3} more` : ""}.
                </p>
                {m.listensTo.length > 0 && (
                  <p className="mt-2 text-xs text-black/55 dark:text-white/55">
                    Reacts to {m.listensTo.join(", ")}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section id="pricing" className="mb-16">
        <h2 className="mb-2 text-2xl font-semibold">Pricing</h2>
        <p className="mb-5 max-w-2xl text-sm text-black/70 dark:text-white/70">
          A school pays a yearly platform fee set by its tier, up to{" "}
          {peso(10_000_000)} for every module, plus {peso(PER_STUDENT_CENTAVOS)} per
          active student per month.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TIER_LIST.map((tier) => (
            <Card
              key={tier.key}
              title={tier.name}
              subtitle={`${peso(tier.platformFeeCentavos)} per year`}
            >
              <ul className="space-y-1 text-sm">
                {tier.modules.map((m) => (
                  <li key={m} className="flex gap-2">
                    <span aria-hidden className="brand-text">✓</span>
                    {MODULES[m].name}
                  </li>
                ))}
              </ul>
              <Link
                href={`/register?tier=${tier.key}`}
                className="brand-text mt-4 inline-block text-sm font-medium hover:underline"
              >
                Start a free trial →
              </Link>
            </Card>
          ))}
        </div>

        <div className="mt-6">
          <Card title="What a school pays in a year">
            <Table
              head={["Example school", "Tier", "Students", "Platform fee", "Student fee / month", "Year total"]}
            >
              {EXAMPLES.map((e) => {
                const tier = TIER_LIST.find((t) => t.key === e.tier)!;
                return (
                  <tr key={e.label}>
                    <td className="py-2 pr-4 font-medium">{e.label}</td>
                    <td className="py-2 pr-4">{tier.name}</td>
                    <td className="py-2 pr-4">{e.students.toLocaleString("en-PH")}</td>
                    <td className="py-2 pr-4">{peso(tier.platformFeeCentavos)}</td>
                    <td className="py-2 pr-4">{peso(e.students * PER_STUDENT_CENTAVOS)}</td>
                    <td className="py-2 pr-4 font-medium">
                      {peso(yearTotalCentavos(e.tier, e.students))}
                    </td>
                  </tr>
                );
              })}
            </Table>
            <p className="mt-3 text-xs text-black/55 dark:text-white/55">
              Year total = platform fee + student fee × 12 months. The student
              count is taken on the 1st of each month.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
