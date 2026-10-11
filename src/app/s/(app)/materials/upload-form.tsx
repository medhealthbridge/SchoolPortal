"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button, Callout, Field, Input, Select, Textarea } from "@/components/ui";
import { isOfficeZip, recompressInBrowser, shrinkOfficeFile } from "@/lib/compress-office";
import { MAX_MATERIAL_BYTES, prettyBytes, safeName, typeOfFile } from "@/lib/material-files";
import { saveMaterial } from "./actions";

type Target = { id: string; label: string; subjects: { id: string; name: string }[] };

/**
 * Pick the class, name the module, choose the file. A PowerPoint or Word file
 * is made smaller in the browser first (its pictures shrunk), then goes
 * straight to storage, then is recorded.
 */
export function UploadMaterialForm({
  targets,
  mode,
  schoolId,
}: {
  targets: Target[];
  mode: "blob" | "local";
  schoolId: string;
}) {
  const router = useRouter();
  const [sectionId, setSectionId] = useState(targets[0]?.id ?? "");
  const subjects = useMemo(
    () => targets.find((t) => t.id === sectionId)?.subjects ?? [],
    [targets, sectionId],
  );
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const chosenSubject = subjects.some((s) => s.id === subjectId) ? subjectId : (subjects[0]?.id ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (!file) return setError("Choose a file.");
    if (!typeOfFile(file.name)) return setError("Use PowerPoint, Word, Excel, PDF, or a JPEG or PNG picture.");
    if (!chosenSubject) return setError("Choose the subject.");

    try {
      let toSend: File = file;
      if (isOfficeZip(file.name)) {
        setBusy("Making it smaller…");
        const shrunk = await shrinkOfficeFile(new Uint8Array(await file.arrayBuffer()), recompressInBrowser);
        if (shrunk.pictures > 0)
          toSend = new File([shrunk.bytes as BlobPart], file.name, { type: typeOfFile(file.name)! });
      }
      if (toSend.size > MAX_MATERIAL_BYTES)
        return setError(`Even made smaller it is ${prettyBytes(toSend.size)}. The limit is ${prettyBytes(MAX_MATERIAL_BYTES)}; split it into parts.`);

      setBusy(
        toSend.size < file.size
          ? `Uploading ${prettyBytes(toSend.size)} (was ${prettyBytes(file.size)})…`
          : `Uploading ${prettyBytes(toSend.size)}…`,
      );

      let url: string;
      if (mode === "blob") {
        const result = await upload(`materials/${schoolId}/${safeName(file.name)}`, toSend, {
          access: "public",
          handleUploadUrl: "/api/materials/upload",
          clientPayload: JSON.stringify({ sectionId, subjectId: chosenSubject }),
          contentType: typeOfFile(file.name)!,
          multipart: toSend.size > 8 * 1024 * 1024,
          onUploadProgress: ({ percentage }) =>
            setBusy(`Uploading ${prettyBytes(toSend.size)}… ${Math.round(percentage)}%`),
        });
        url = result.url;
      } else {
        const body = new FormData();
        body.set("file", toSend);
        body.set("sectionId", sectionId);
        body.set("subjectId", chosenSubject);
        const res = await fetch("/api/materials/local", { method: "POST", body });
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !json.url) return setError(json.error ?? "The upload failed.");
        url = json.url;
      }

      setBusy("Saving…");
      const saved = await saveMaterial({
        sectionId,
        subjectId: chosenSubject,
        title,
        description,
        url,
        fileName: file.name,
        size: toSend.size,
        originalSize: file.size,
      });
      if (saved?.error) return setError(saved.error);
      setDone(
        `${saved?.ok ?? "Shared."}${toSend.size < file.size ? ` Made smaller: ${prettyBytes(file.size)} → ${prettyBytes(toSend.size)}.` : ""}`,
      );
      setTitle("");
      setDescription("");
      setFile(null);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {error && <Callout tone="danger">{error}</Callout>}
      {done && <Callout tone="ok">{done}</Callout>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Section">
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subject">
          <Select value={chosenSubject} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" hint="What students will look for: “Quarter 1, Module 3: Fractions”.">
          <Input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field
          label="File"
          hint="PowerPoint, Word, Excel, PDF or a picture. Pictures inside PowerPoint and Word files are made smaller before upload."
        >
          <input
            type="file"
            name="file"
            required
            accept=".pptx,.ppt,.docx,.doc,.xlsx,.xls,.pdf,.jpg,.jpeg,.png"
            className="block w-full max-w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Note for students" hint="Optional: what to read, by when.">
            <Textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={Boolean(busy)}>
          {busy ? "Working" : "Share with the class"}
        </Button>
        {busy && <span className="text-sm text-muted" role="status">{busy}</span>}
      </div>
    </form>
  );
}
