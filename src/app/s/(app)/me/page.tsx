import { redirect } from "next/navigation";
import Link from "next/link";
import { withTenant } from "@/db";
import { requireUser } from "@/lib/guard";
import { watchedStudents } from "@/lib/student-access";
import { ActionForm } from "@/components/action-form";
import { EmptyState, Field, Input, PageHeader, Section } from "@/components/ui";
import { addChildByCode } from "./actions";
import { ArrowRightIcon } from "@/components/icons";

export const metadata = { title: "My records" };

/** A parent with one child goes straight to them; several, and they choose. */
export default async function MePage() {
  const { school, session } = await requireUser();
  const watched = await withTenant(school.id, (tx) =>
    watchedStudents(tx, school.id, session),
  );

  const isParent = session.roles.includes("parent");
  // One child and nothing else to do here: go straight to them. A parent
  // stays, because this is also where they add a second child.
  if (watched.length === 1 && !isParent) redirect(`/child/${watched[0].id}`);

  return (
    <>
      <PageHeader
        title={watched.length > 1 ? "Your children" : "Your records"}
        meta={watched.length > 1 ? `${watched.length} linked to this account` : undefined}
      />
      <Section title="Linked students">
        {watched.length === 0 ? (
          <EmptyState title="Nothing is linked to this account yet">
            Open the invite link your child's teacher sent, or add a child below with the student
            ID and parent code the school printed.
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

      {isParent && (
        <Section
          title="Add another child"
          subtitle="Have the student ID and parent code from the school? Or open the invite link your child's teacher sent, and sign in with this account."
        >
          <ActionForm action={addChildByCode} submitLabel="Add child">
            <Field label="Student ID">
              <Input name="studentNumber" required autoComplete="off" />
            </Field>
            <Field label="Parent code">
              <Input name="code" required autoComplete="off" className="uppercase" />
            </Field>
          </ActionForm>
        </Section>
      )}
    </>
  );
}
