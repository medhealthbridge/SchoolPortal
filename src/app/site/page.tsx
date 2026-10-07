import Link from "next/link";
import { MODULES, MODULE_KEYS } from "@/lib/modules";
import { PER_STUDENT_CENTAVOS, TIER_LIST, peso, yearTotalCentavos } from "@/lib/pricing";
import { LinkButton, Section, Table } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import SeatDemo from "./seat-demo";

const EXAMPLES = [
  { label: "A small school", tier: "starter" as const, students: 300 },
  { label: "A medium school", tier: "academic" as const, students: 800 },
  { label: "A large school", tier: "all_in" as const, students: 1500 },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-[1080px] px-[var(--gutter)]">
      <section className="grid min-w-0 grid-cols-1 gap-8 py-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-12 lg:py-16">
        <div className="min-w-0 self-center">
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">
            The class record, kept for the whole school.
          </h1>
          <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-muted">
            Your own address, the modules you need, and attendance a teacher can take walking
            the room with no signal at all. Try it here: tap a few seats, then cut the signal
            and keep going.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <LinkButton href="/register" size="lg">
              Register your school
            </LinkButton>
            <LinkButton href="/#pricing" variant="secondary" size="lg">
              See what it costs
            </LinkButton>
          </div>
        </div>
        <SeatDemo />
      </section>

      <div className="flex flex-col gap-6 pb-16">
        <Section
          id="modules"
          title="What a school switches on"
          subtitle="Every module stands on its own. Turn on a second one and the links between them appear by themselves; turn one off and its screens go, while its records stay."
        >
          <ul className="-mx-1">
            {MODULE_KEYS.map((key, i) => {
              const m = MODULES[key];
              return (
                <li
                  key={key}
                  className={`grid gap-x-8 gap-y-1 px-1 py-3.5 sm:grid-cols-[12rem_minmax(0,1fr)] ${
                    i > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <h3 className="font-medium">
                    {m.name}
                    {m.alwaysOn && (
                      <span className="ml-2 align-middle text-xs font-normal text-muted">
                        always on
                      </span>
                    )}
                  </h3>
                  <p className="max-w-[68ch] text-muted">{m.summary}</p>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section
          id="pricing"
          title="What it costs"
          subtitle={`A platform fee set by the tier, up to ${peso(10_000_000)} once every module is on, plus ${peso(PER_STUDENT_CENTAVOS)} for each active student each month. The student count is taken on the 1st.`}
          flush
        >
          <Table head={["", ...TIER_LIST.map((t) => t.name)]} minWidth={680}>
            {MODULE_KEYS.map((key) => (
              <tr key={key}>
                <th scope="row" className="text-left font-medium">
                  {MODULES[key].name}
                </th>
                {TIER_LIST.map((t) => (
                  <td key={t.key}>
                    {t.modules.includes(key) ? (
                      <CheckIcon aria-hidden={false} aria-label="included" role="img" />
                    ) : (
                      <span className="text-muted" aria-label="not included">
                        &ndash;
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="text-left font-semibold">
                Platform fee each year
              </th>
              {TIER_LIST.map((t) => (
                <td key={t.key} className="font-semibold">
                  {peso(t.platformFeeCentavos)}
                </td>
              ))}
            </tr>
            <tr>
              <td />
              {TIER_LIST.map((t) => (
                <td key={t.key}>
                  <Link
                    href={`/register?tier=${t.key}`}
                    className="font-medium underline underline-offset-2"
                  >
                    Start free
                  </Link>
                </td>
              ))}
            </tr>
          </Table>
        </Section>

        <Section
          title="A year, worked out"
          subtitle="The year is the platform fee plus twelve months of student fees. For most schools the student fee is the larger half of the bill."
          flush
        >
          <Table
            head={["School", "Tier", "Students", "Platform fee", "Students each month", "Year"]}
            minWidth={720}
          >
            {EXAMPLES.map((e) => {
              const tier = TIER_LIST.find((t) => t.key === e.tier)!;
              return (
                <tr key={e.label}>
                  <th scope="row" className="text-left font-medium">
                    {e.label}
                  </th>
                  <td>{tier.name}</td>
                  <td>{e.students.toLocaleString("en-PH")}</td>
                  <td>{peso(tier.platformFeeCentavos)}</td>
                  <td>{peso(e.students * PER_STUDENT_CENTAVOS)}</td>
                  <td className="font-semibold">{peso(yearTotalCentavos(e.tier, e.students))}</td>
                </tr>
              );
            })}
          </Table>
        </Section>
      </div>
    </div>
  );
}
