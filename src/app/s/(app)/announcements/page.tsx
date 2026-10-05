import { asc, desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { announcements, sections, users } from "@/db/schema";
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

  const data = await withTenant(school.id, async (tx) => ({
    posts: await tx
      .select({
        post: announcements,
        author: users.name,
        level: sections.level,
        section: sections.name,
      })
      .from(announcements)
      .leftJoin(users, eq(users.id, announcements.postedByUserId))
      .leftJoin(sections, eq(sections.id, announcements.sectionId))
      .where(eq(announcements.schoolId, school.id))
      .orderBy(desc(announcements.postedAt))
      .limit(50),
    sectionList: perms.has("portal.post")
      ? await tx
          .select({ id: sections.id, level: sections.level, name: sections.name })
          .from(sections)
          .where(eq(sections.schoolId, school.id))
          .orderBy(asc(sections.level), asc(sections.name))
      : [],
  }));

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
              <Select id="an-section" name="sectionId" defaultValue="">
                <option value="">The whole school</option>
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
