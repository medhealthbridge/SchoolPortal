import Link from "next/link";
import { MODULES, MODULE_KEYS } from "@/lib/modules";
import { PER_STUDENT_CENTAVOS, TIER_LIST, peso, yearTotalCentavos } from "@/lib/pricing";
import { LinkButton, Section, Table } from "@/components/ui";
import SeatDemo from "./seat-demo";

const EXAMPLES = [
  { label: "A small school", tier: "starter" as const, students: 300 },
  { label: "A medium school", tier: "academic" as const, students: 800 },
  { label: "A large school", tier: "all_in" as const, students: 1500 },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-[72rem] px-5">
      <section className="grid min-w-0 grid-cols-1 gap-10 py-12 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:gap-14 lg:py-20">
        <div className="min-w-0 self-center">
          <h1 className="w-wide text-[2rem] font-bold leading-[1.05] sm:text-[2.5rem] lg:text-[3rem]">
            {/* The desktop composition is set by hand; narrow screens wrap
                where they need to. */}
            The class record,
            <br className="hidden lg:inline" /> kept for the
            <br className="hidden lg:inline" /> whole school.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[1.0625rem] leading-relaxed text-[var(--ink-soft)]">
            Your own address, the modules you need, and attendance a teacher can
            take walking the room with no signal at all. Try it here: tap a few
            seats, then cut the signal and keep going.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <LinkButton href="/register" variant="accent">
              Register your school
            </LinkButton>
            <LinkButton href="/#pricing" variant="ghost">
              See what it costs
            </LinkButton>
          </div>
        </div>
        <SeatDemo />
      </section>

      <Section
        id="modules"
        title="What a school switches on"
        subtitle="Every module stands on its own. Turn on a second one and the links between them appear by themselves; turn one off and its screens go, while its records stay."
      >
        <ul className="ledger-rows">
          {MODULE_KEYS.map((key) => {
            const m = MODULES[key];
            return (
              <li key={key} className="grid gap-x-8 gap-y-1 py-3.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <h3 className="font-semibold">
                  {m.name}
                  {m.alwaysOn && (
                    <span className="w-narrow ml-2 align-middle text-[0.75rem] font-normal text-[var(--ink-faint)]">
                      always on
                    </span>
                  )}
                </h3>
                <p className="max-w-[68ch] text-sm leading-relaxed text-[var(--ink-soft)]">
                  {m.summary}
                </p>
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="h-14" />

      <Section
        id="pricing"
        title="What it costs"
        subtitle={`A platform fee set by the tier, up to ${peso(10_000_000)} once every module is on, plus ${peso(PER_STUDENT_CENTAVOS)} for each active student each month. The student count is taken on the 1st.`}
      >
        <Table head={["", ...TIER_LIST.map((t) => t.name)]}>
          {MODULE_KEYS.map((key) => (
            <tr key={key}>
              <th scope="row" className="py-2 pr-5 text-left font-medium">
                {MODULES[key].name}
              </th>
              {TIER_LIST.map((t) => {
                const included = t.modules.includes(key);
                return (
                  <td key={t.key} className="py-2 pr-5">
                    {included ? (
                      <span
                        aria-label="included"
                        className="inline-block h-2.5 w-2.5 bg-[var(--brand)]"
                      />
                    ) : (
                      <span className="text-[var(--ink-faint)]" aria-label="not included">
                        &ndash;
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t-2 border-[var(--ink-soft)]">
            <th scope="row" className="py-3 pr-5 text-left font-semibold">
              Platform fee each year
            </th>
            {TIER_LIST.map((t) => (
              <td key={t.key} className="py-3 pr-5 text-base font-semibold">
                {peso(t.platformFeeCentavos)}
              </td>
            ))}
          </tr>
          <tr>
            <td />
            {TIER_LIST.map((t) => (
              <td key={t.key} className="py-2 pr-5">
                <Link
                  href={`/register?tier=${t.key}`}
                  className="text-sm font-medium text-[var(--brand)] underline underline-offset-2"
                >
                  Start free
                </Link>
              </td>
            ))}
          </tr>
        </Table>

        <div className="ledger-hair mt-8 pt-4">
          <h3 className="w-wide mb-3 font-semibold">A year, worked out</h3>
          <Table head={["School", "Tier", "Students", "Platform fee", "Students each month", "Year"]}>
            {EXAMPLES.map((e) => {
              const tier = TIER_LIST.find((t) => t.key === e.tier)!;
              return (
                <tr key={e.label}>
                  <th scope="row" className="py-2 pr-5 text-left font-medium">
                    {e.label}
                  </th>
                  <td className="py-2 pr-5">{tier.name}</td>
                  <td className="py-2 pr-5">{e.students.toLocaleString("en-PH")}</td>
                  <td className="py-2 pr-5">{peso(tier.platformFeeCentavos)}</td>
                  <td className="py-2 pr-5">{peso(e.students * PER_STUDENT_CENTAVOS)}</td>
                  <td className="py-2 pr-5 font-semibold">
                    {peso(yearTotalCentavos(e.tier, e.students))}
                  </td>
                </tr>
              );
            })}
          </Table>
          <p className="mt-3 max-w-[70ch] text-sm text-[var(--ink-soft)]">
            The year is the platform fee plus twelve months of student fees. For
            most schools the student fee is the larger half of the bill.
          </p>
        </div>
      </Section>
    </div>
  );
}
