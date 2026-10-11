"use server";

import { revalidatePath } from "next/cache";
import { access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { withTenant } from "@/db";
import { learningMaterials } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { MATERIAL_TYPES, MAX_MATERIAL_BYTES, mayRemove, mayUpload, typeOfFile } from "@/lib/materials";

type Result = { ok?: string; error?: string } | null;

export type NewMaterial = {
  sectionId: string;
  subjectId: string;
  title: string;
  description: string;
  url: string;
  fileName: string;
  size: number;
  originalSize: number;
};

/** Is this a file we stored for this school, and not a link from anywhere else? */
async function ours(url: string, schoolId: string) {
  if (url.startsWith("local:")) {
    const key = url.slice("local:".length);
    if (!key.startsWith(`materials/${schoolId}/`) || key.includes("..")) return false;
    return access(join(process.cwd(), ".uploads", key)).then(
      () => true,
      () => false,
    );
  }
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(".public.blob.vercel-storage.com") &&
      u.pathname.startsWith(`/materials/${schoolId}/`)
    );
  } catch {
    return false;
  }
}

/** Records a file the browser has just put in storage. */
export async function saveMaterial(input: NewMaterial): Promise<Result> {
  const { school, session } = await requireUser();
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 2) return { error: "Give it a title students will recognise." };
  const contentType = typeOfFile(input.fileName);
  if (!contentType || !MATERIAL_TYPES[contentType]) return { error: "That kind of file is not accepted." };
  if (!(input.size > 0 && input.size <= MAX_MATERIAL_BYTES)) return { error: "That file is too large." };
  if (!(await ours(input.url, school.id))) return { error: "That upload did not come from here." };

  return withTenant(school.id, async (tx) => {
    if (!(await mayUpload(tx, school.id, session, input.sectionId, input.subjectId)))
      return { error: "You can share only with your own classes." };
    const [row] = await tx
      .insert(learningMaterials)
      .values({
        schoolId: school.id,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        title,
        description: input.description.trim() || null,
        fileUrl: input.url,
        fileName: input.fileName.slice(-200),
        contentType,
        sizeBytes: Math.round(input.size),
        originalBytes: Math.round(input.originalSize) || null,
        uploadedByUserId: session.userId,
      })
      .returning();
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "material.shared",
      entity: "learning_materials",
      entityId: row!.id,
      after: { title, sectionId: input.sectionId },
    });
    revalidatePath("/materials");
    return { ok: `“${title}” is shared with the class.` };
  });
}

export async function removeMaterial(form: FormData) {
  const { school, session } = await requireUser();
  const id = String(form.get("id") ?? "");
  const url = await withTenant(school.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(learningMaterials)
      .where(and(eq(learningMaterials.schoolId, school.id), eq(learningMaterials.id, id)))
      .limit(1);
    if (!row || !mayRemove(session, row.uploadedByUserId)) return null;
    await tx.delete(learningMaterials).where(eq(learningMaterials.id, id));
    await audit(tx, {
      schoolId: school.id,
      actorUserId: session.userId,
      actorLabel: session.name,
      action: "material.removed",
      entity: "learning_materials",
      entityId: id,
      before: { title: row.title },
    });
    return row.fileUrl;
  });
  if (url?.startsWith("local:")) await unlink(join(process.cwd(), ".uploads", url.slice(6))).catch(() => {});
  else if (url) await del(url).catch(() => {});
  revalidatePath("/materials");
}
