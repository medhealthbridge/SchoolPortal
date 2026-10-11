/**
 * Makes a PowerPoint, Word or Excel file smaller before it is uploaded.
 *
 * Those files are already zip archives, so zipping them again gains nothing.
 * Their size is the pictures inside: a phone photo pasted onto a slide is
 * often 3–5 MB and 4000 pixels wide, shown at a fraction of that. This opens
 * the file, shrinks each large picture to at most 1600 pixels on its long side,
 * and puts the file back together. Names stay the same, so nothing inside the
 * presentation needs rewriting. Video and audio are left alone.
 *
 * The picture work is passed in, because it needs a browser canvas; the zip
 * handling here runs anywhere and is tested in Node.
 */
import { unzipSync, zipSync } from "fflate";

export type Recompress = (bytes: Uint8Array, kind: "jpeg" | "png") => Promise<Uint8Array | null>;

const MEDIA = /^(ppt|word|xl)\/media\/[^/]+\.(jpe?g|png)$/i;

export const isOfficeZip = (name: string) => /\.(pptx|docx|xlsx)$/i.test(name);

export async function shrinkOfficeFile(
  input: Uint8Array,
  recompress: Recompress,
  minBytes = 150_000,
): Promise<{ bytes: Uint8Array; pictures: number }> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(input);
  } catch {
    return { bytes: input, pictures: 0 };
  }
  let pictures = 0;
  for (const [name, data] of Object.entries(files)) {
    const m = MEDIA.exec(name);
    if (!m || data.length < minBytes) continue;
    const kind = m[2]!.toLowerCase() === "png" ? "png" : "jpeg";
    let out: Uint8Array | null = null;
    try {
      out = await recompress(data, kind);
    } catch {
      out = null;
    }
    // Keep the original unless the new one is clearly smaller.
    if (out && out.length < data.length * 0.9) {
      files[name] = out;
      pictures += 1;
    }
  }
  if (pictures === 0) return { bytes: input, pictures: 0 };
  // Pictures are stored as they are (level 0): deflating a JPEG wastes time
  // for nothing. Everything else is text and compresses well.
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const [name, data] of Object.entries(files))
    entries[name] = [data, { level: MEDIA.test(name) ? 0 : 6 }];
  const bytes = zipSync(entries);
  return bytes.length < input.length ? { bytes, pictures } : { bytes: input, pictures: 0 };
}

/** The browser half: shrink one picture on a canvas. */
export async function recompressInBrowser(
  bytes: Uint8Array,
  kind: "jpeg" | "png",
): Promise<Uint8Array | null> {
  const type = kind === "png" ? "image/png" : "image/jpeg";
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  // A PNG already within size gains nothing from being redrawn.
  if (scale === 1 && kind === "png") return null;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.78));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
