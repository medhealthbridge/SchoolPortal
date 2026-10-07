import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { learningMaterials } from "@/db/schema";
import { currentSchool, getSchoolSession } from "@/lib/session";
import { readableSections } from "@/lib/materials";

/**
 * Every material link goes through here: the person must be signed in and
 * belong to the section. Stored files are then served from storage directly.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const school = await currentSchool();
  const session = await getSchoolSession();
  if (!school || !session || session.schoolId !== school.id)
    return new Response("Sign in first.", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found.", { status: 404 });

  const row = await withTenant(school.id, async (tx) => {
    const [m] = await tx
      .select()
      .from(learningMaterials)
      .where(and(eq(learningMaterials.schoolId, school.id), eq(learningMaterials.id, id)))
      .limit(1);
    if (!m) return null;
    const readable = await readableSections(tx, school.id, session);
    return readable === null || readable.includes(m.sectionId) ? m : null;
  });
  if (!row) return new Response("Not found.", { status: 404 });

  if (row.fileUrl.startsWith("local:")) {
    const bytes = await readFile(join(process.cwd(), ".uploads", row.fileUrl.slice(6))).catch(() => null);
    if (!bytes) return new Response("The file is missing.", { status: 404 });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": row.contentType,
        "content-disposition": `attachment; filename="${row.fileName.replace(/"/g, "")}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  }
  return Response.redirect(row.fileUrl, 302);
}
