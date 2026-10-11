import { withTenant } from "@/db";
import { requireUser } from "@/lib/guard";
import {
  MATERIAL_TYPES,
  materialsFor,
  materialsMode,
  mayRemove,
  prettyBytes,
  readableSections,
  uploadTargets,
} from "@/lib/materials";
import { prettyDate } from "@/lib/format";
import { Button, Callout, EmptyState, LinkButton, Meta, PageHeader, Pill, Section } from "@/components/ui";
import { removeMaterial } from "./actions";
import { UploadMaterialForm } from "./upload-form";

export const metadata = { title: "Learning materials" };

/**
 * Teachers share slides and handouts with a class; students and parents open
 * them again whenever they need to.
 */
export default async function MaterialsPage() {
  const { school, session } = await requireUser();
  const mode = materialsMode();
  const data = await withTenant(school.id, async (tx) => {
    const targets = await uploadTargets(tx, school.id, session);
    const readable = await readableSections(tx, school.id, session);
    return { targets, items: await materialsFor(tx, school.id, readable) };
  });

  // One block per section, subjects in order inside it.
  const bySection = new Map<string, typeof data.items>();
  for (const it of data.items) {
    const key = `${it.level} ${it.section}`;
    bySection.set(key, [...(bySection.get(key) ?? []), it]);
  }

  return (
    <>
      <PageHeader
        title="Learning materials"
        meta={
          <Meta
            items={[
              `${data.items.length} ${data.items.length === 1 ? "module" : "modules"}`,
              bySection.size > 1 ? `${bySection.size} sections` : null,
            ]}
          />
        }
      />

      {data.targets.length > 0 && (
        <Section
          title="Share a module"
          subtitle="Students in the section, and their parents, can open it any time."
        >
          {mode === "none" ? (
            <Callout tone="warn" title="File storage is not connected yet">
              The school's files need a storage service before modules can be shared. Ask the
              person who runs SchoolPortal.
            </Callout>
          ) : (
            <UploadMaterialForm
              targets={data.targets.map((t) => ({
                id: t.id,
                label: t.label,
                subjects: t.subjects.map((s) => ({ id: s.id, name: s.name })),
              }))}
              mode={mode}
              schoolId={school.id}
            />
          )}
        </Section>
      )}

      {bySection.size === 0 ? (
        <Section title="Modules">
          <EmptyState title="Nothing shared yet">
            {data.targets.length > 0
              ? "Share the first module above."
              : "When your teachers share slides and handouts, they appear here."}
          </EmptyState>
        </Section>
      ) : (
        [...bySection.entries()].map(([label, items]) => (
          <Section key={label} title={label} subtitle={`${items.length} ${items.length === 1 ? "module" : "modules"}`}>
            <ul className="-mx-1">
              {items.map(({ m, subject, teacher }, i) => {
                const kind = MATERIAL_TYPES[m.contentType];
                const online = kind?.office && !m.fileUrl.startsWith("local:");
                return (
                  <li key={m.id} className={`px-1 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{m.title}</span>
                          <Pill>{subject}</Pill>
                        </span>
                        {m.description && (
                          <span className="mt-1 block max-w-[62ch] whitespace-pre-line text-muted">{m.description}</span>
                        )}
                        <Meta
                          items={[
                            kind?.label ?? "File",
                            prettyBytes(m.sizeBytes),
                            teacher,
                            prettyDate(m.createdAt),
                          ]}
                        />
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {online && (
                          <LinkButton
                            href={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(m.fileUrl)}`}
                            variant="secondary"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View
                          </LinkButton>
                        )}
                        <LinkButton href={`/materials/open/${m.id}`} variant="secondary" prefetch={false}>
                          Download
                        </LinkButton>
                        {mayRemove(session, m.uploadedByUserId) && (
                          <form action={removeMaterial}>
                            <input type="hidden" name="id" value={m.id} />
                            <Button type="submit" variant="ghost" aria-label={`Remove ${m.title}`}>
                              Remove
                            </Button>
                          </form>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))
      )}
    </>
  );
}
