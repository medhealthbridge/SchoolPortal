import { redirect } from "next/navigation";
import Link from "next/link";
import { withTenant } from "@/db";
import { requireUser } from "@/lib/guard";
import { watchedStudents } from "@/lib/student-access";
import { EmptyState, PageHeader, Section } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";

export const metadata = { title: "My records" };

/** A parent with one child goes straight to them; several, and they choose. */
export default async function MePage() {
  const { school, session } = await requireUser();
  const watched = await withTenant(school.id, (tx) =>
    watchedStudents(tx, school.id, session),
  );

  if (watched.length === 1) redirect(`/child/${watched[0].id}`);

  return (
    <>
      <PageHeader
        title={watched.length > 1 ? "Your children" : "Your records"}
        meta={watched.length > 1 ? `${watched.length} linked to this account` : undefined}
      />
      <Section title="Linked students">
        {watched.length === 0 ? (
          <EmptyState title="Nothing is linked to this account yet">
            A parent links a child with the student ID and the parent code the school printed.
            A student claims their own record the same way.
          </EmptyState>
        ) : (
          <ul className="-mx-1">
            {watched.map((s, i) => (
              <li key={s.id} className={i > 0 ? "border-t border-line" : ""}>
                <Link
                  href={`/child/${s.id}`}
                  className="flex min-h-[60px] items-center justify-between gap-4 px-1 py-2.5 no-underline hover:bg-subtle"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="block text-[13px] text-muted">{s.studentNumber}</span>
                  </span>
                  <ArrowRightIcon className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
