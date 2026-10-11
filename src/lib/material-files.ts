/** File rules for learning materials, shared by the browser and the server. */

export const MAX_MATERIAL_BYTES = 100 * 1024 * 1024;

export const MATERIAL_TYPES: Record<string, { label: string; office: boolean }> = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { label: "PowerPoint", office: true },
  "application/vnd.ms-powerpoint": { label: "PowerPoint", office: true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { label: "Word", office: true },
  "application/msword": { label: "Word", office: true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { label: "Excel", office: true },
  "application/vnd.ms-excel": { label: "Excel", office: true },
  "application/pdf": { label: "PDF", office: false },
  "image/jpeg": { label: "Image", office: false },
  "image/png": { label: "Image", office: false },
};

/** The file's type from its extension, because phones often send none. */
export function typeOfFile(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const byExt: Record<string, string> = {
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  return byExt[ext] ?? null;
}

/** A file name safe to put in a storage path. */
export function safeName(name: string) {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (cleaned || "file").slice(-80);
}

export const prettyBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
