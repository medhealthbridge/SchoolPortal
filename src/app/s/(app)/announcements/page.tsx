import { asc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { sections } from "@/db/schema";
import { announcementsFor } from "@/lib/announcements";
import { sectionOfStudent, sectionsOfTeacher } from "@/lib/schedule";
import { watchedStudents } from "@/lib/student-access";
import { requireModule, requireUser } from "@/lib/guard";
import { permissionsFor } from "@/lib/roles";
import { ActionForm } from "@/components/action-form";
import {
  EmptyState,
  Field,
  Input,
  Meta,
  PageHeader,
  Pill,
  Section,
  Select,
  Textarea,
} from "@/components/ui";
import { postAnnouncement } from "./actions";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const school = await requireModule("portal");
  const { session } = await requireUser();
  const perms = permissionsFor(session.roles);

  const wide = perms.has("staff.manage");
  const data = await withTenant(school.id, async (tx) => {
    const staff = perms.has("students.view") || perms.has("portal.post");
    const watched = staff ? [] : await watchedStudents(tx, school.id, session);
    const theirSections = staff
      ? []
      : (
          await Promise.all(watched.map((s) => sectionOfStudent(tx, school.id, s.id)))
        ).flatMap((s) => (s ? [s.id] : []));
    return {
      posts: await announcementsFor(
        tx,
        school.id,
        staff ? { everything: true } : { sectionIds: theirSections },
      ),
      sectionList: !perms.has("portal.post")
        ? []
        : wide
          ? await tx
              .select({ id: sections.id, level: sections.level, name: sections.name })
              .from(sections)
              .where(eq(sections.schoolId, school.id))
              .orderBy(asc(sections.level), asc(sections.name))
          : (await sectionsOfTeacher(tx, school.id, session.userId)).map((s) => ({
              id: s.id,
              level: s.level,
              name: s.name,
            })),
    };
  });

  return (
    <>
      <PageHeader
        title="Announcements"
        meta={`${data.posts.length} posted`}
      />

      {perms.has("portal.post") && (
        <Section
          title="Post an announcement"
          subtitle="Every guardian of the section you pick gets a notification."
        >
          <ActionForm action={postAnnouncement} submitLabel="Post it" className="grid gap-4">
            <Field label="Title" htmlFor="an-title">
              <Input id="an-title" name="title" required placeholder="Early dismissal on Friday" />
            </Field>
            <Field label="Who it is for" htmlFor="an-section">
              <Select id="an-section" name="sectionId" defaultValue="" required={!wide}>
                <option value="">{wide ? "The whole school" : "Choose one of your sections"}</option>
                {data.sectionList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.level} {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Message" htmlFor="an-body">
              <Textarea id="an-body" name="body" required rows={4} />
            </Field>
          </ActionForm>
        </Section>
      )}

      <Section title="Posted" flush={false}>
        {data.posts.length === 0 ? (
          <EmptyState title="Nothing posted yet">
            Announcements show here and reach parents as a notification.
          </EmptyState>
        ) : (
          <ul className="-mx-1">
            {data.posts.map((p, i) => (
              <li key={p.post.id} className={`px-1 py-4 ${i > 0 ? "border-t border-line" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{p.post.title}</h3>
                  {p.level ? (
                    <Pill>
                      {p.level} {p.section}
                    </Pill>
                  ) : (
                    <Pill>Whole school</Pill>
                  )}
                </div>
                <p className="mt-1.5 max-w-[72ch] whitespace-pre-line">{p.post.body}</p>
                <div className="mt-2">
                  <Meta
                    items={[
                      p.author ?? "A member of staff",
                      p.post.postedAt.toLocaleString("en-PH"),
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
