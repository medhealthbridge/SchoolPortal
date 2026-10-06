import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { withTenant } from "@/db";
import { currentSchool, getSchoolSession } from "@/lib/session";
import { MATERIAL_TYPES, MAX_MATERIAL_BYTES, mayUpload } from "@/lib/materials";

/**
 * Hands the teacher's browser a short-lived permission to upload one file
 * straight to storage. The file never passes through here; this only decides
 * whether this person may share with this section and subject, and where the
 * file may go.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const school = await currentSchool();
        const session = await getSchoolSession();
        if (!school || !session || session.schoolId !== school.id) throw new Error("Sign in first.");
        if (school.status === "suspended") throw new Error("This school is on hold.");
        const { sectionId, subjectId } = JSON.parse(clientPayload ?? "{}") as Record<string, string>;
        const allowed = await withTenant(school.id, (tx) =>
          mayUpload(tx, school.id, session, String(sectionId), String(subjectId)),
        );
        if (!allowed) throw new Error("You can share only with your own classes.");
        if (!pathname.startsWith(`materials/${school.id}/`)) throw new Error("Wrong place for that file.");
        return {
          allowedContentTypes: Object.keys(MATERIAL_TYPES),
          maximumSizeInBytes: MAX_MATERIAL_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ schoolId: school.id, userId: session.userId }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload refused." },
      { status: 400 },
    );
  }
}
