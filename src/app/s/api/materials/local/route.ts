import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { withTenant } from "@/db";
import { currentSchool, getSchoolSession } from "@/lib/session";
import { MAX_MATERIAL_BYTES, materialsMode, mayUpload, safeName, typeOfFile } from "@/lib/materials";

/** Development only: keeps a material on this machine's disk. */
export async function POST(req: Request) {
  if (materialsMode() !== "local") return NextResponse.json({ error: "Not available." }, { status: 404 });
  const school = await currentSchool();
  const session = await getSchoolSession();
  if (!school || !session || session.schoolId !== school.id)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const sectionId = String(form.get("sectionId") ?? "");
  const subjectId = String(form.get("subjectId") ?? "");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > MAX_MATERIAL_BYTES) return NextResponse.json({ error: "That file is too large." }, { status: 400 });
  if (!typeOfFile(file.name)) return NextResponse.json({ error: "That kind of file is not accepted." }, { status: 400 });
  const ok = await withTenant(school.id, (tx) => mayUpload(tx, school.id, session, sectionId, subjectId));
  if (!ok) return NextResponse.json({ error: "You can share only with your own classes." }, { status: 403 });

  const key = `materials/${school.id}/${randomUUID()}-${safeName(file.name)}`;
  const path = join(process.cwd(), ".uploads", key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `local:${key}` });
}
