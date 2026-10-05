import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Where a school's logo and any other uploaded file lives.
 *
 * Two drivers, chosen by whether S3 is configured:
 *
 *   local — writes under .uploads/ and serves from /uploads/<key>. No account
 *           needed, so `npm run dev` works the minute it is cloned. The files
 *           are on one machine's disk, which is wrong for more than one
 *           instance, so production says so on boot.
 *   s3    — any S3-compatible bucket: AWS, Cloudflare R2, DigitalOcean Spaces,
 *           MinIO, Wasabi. Signed here rather than through a dependency,
 *           because one PUT is a hundred lines and an SDK is twelve megabytes.
 *
 * Uploads are checked here and nowhere else: type by the file's own bytes,
 * not by what the browser claimed, and size before anything is written.
 */
export type StoredFile = { key: string; url: string };

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * The browser's content-type is a claim, and a file named .png can hold
 * anything. These are the magic bytes each format actually starts with.
 * SVG is deliberately absent: it is a document that can carry script, and a
 * logo is not worth an XSS hole on every page of a school's own subdomain.
 */
const SIGNATURES: { type: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { type: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];

export type ImageCheck =
  | { ok: true; type: string; ext: string; bytes: Buffer }
  | { ok: false; error: string };

export async function checkImage(file: File, maxBytes = MAX_UPLOAD_BYTES): Promise<ImageCheck> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > maxBytes) {
    return { ok: false, error: `That file is ${mb(file.size)}. The limit is ${mb(maxBytes)}.` };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const match = SIGNATURES.find((s) => s.test(bytes));
  if (!match) return { ok: false, error: "Use a PNG, JPEG or WebP image." };
  return { ok: true, type: match.type, ext: match.ext, bytes };
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function storageDriver(): "s3" | "local" {
  return process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID ? "s3" : "local";
}

/** `prefix` groups a school's files, so deleting a school can sweep them. */
export async function put(
  prefix: string,
  bytes: Buffer,
  contentType: string,
  ext: string,
): Promise<StoredFile> {
  // A fresh name every time: a logo replaced under its old name would stay
  // stale in every browser and CDN that had already cached it.
  const key = `${prefix}/${randomUUID()}.${ext}`;
  if (storageDriver() === "s3") return putToS3(key, bytes, contentType);

  const path = join(process.cwd(), ".uploads", key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return { key, url: `/uploads/${key}` };
}

export async function remove(key: string) {
  if (storageDriver() === "s3") {
    await s3Request("DELETE", key, Buffer.alloc(0), "application/octet-stream");
    return;
  }
  await unlink(join(process.cwd(), ".uploads", key)).catch(() => {});
}

/**
 * The key a URL came from, or null if it did not come from us. Used before a
 * delete, so a crafted value can never point the unlink at another path.
 */
export function keyFromUrl(url: string | null): string | null {
  if (!url) return null;
  const base = publicBase();
  const path = base && url.startsWith(base) ? url.slice(base.length) : url;
  const match = /^\/?(?:uploads\/)?((?:[\w-]+\/)+[0-9a-f-]{36}\.\w{3,4})$/.exec(path);
  return match ? match[1]! : null;
}

function publicBase() {
  return (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "");
}

/* ------------------------------------------------------------------ *
 * S3: Signature Version 4, by hand
 * ------------------------------------------------------------------ */

async function putToS3(key: string, bytes: Buffer, contentType: string): Promise<StoredFile> {
  const res = await s3Request("PUT", key, bytes, contentType);
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const base = publicBase() || `${endpoint()}/${process.env.S3_BUCKET}`;
  return { key, url: `${base}/${key}` };
}

const endpoint = () =>
  (process.env.S3_ENDPOINT ?? `https://s3.${region()}.amazonaws.com`).replace(/\/$/, "");
const region = () => process.env.S3_REGION ?? "us-east-1";

async function s3Request(method: "PUT" | "DELETE", key: string, body: Buffer, contentType: string) {
  const bucket = process.env.S3_BUCKET!;
  const accessKey = process.env.S3_ACCESS_KEY_ID!;
  const secret = process.env.S3_SECRET_ACCESS_KEY!;

  const url = new URL(`${endpoint()}/${bucket}/${key}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256(body);

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (method === "PUT") headers["content-type"] = contentType;

  const signedHeaders = Object.keys(headers).sort();
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    ...signedHeaders.map((h) => `${h}:${headers[h]}`),
    "",
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");

  const scope = `${date}/${region()}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(Buffer.from(canonicalRequest))].join("\n");

  let signingKey = hmac(Buffer.from(`AWS4${secret}`), date);
  for (const part of [region(), "s3", "aws4_request"]) signingKey = hmac(signingKey, part);
  const signature = hmac(signingKey, toSign).toString("hex");

  return fetch(url, {
    method,
    headers: {
      ...headers,
      authorization:
        `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
        `SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`,
    },
    body: method === "PUT" ? new Uint8Array(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const hmac = (key: Buffer, data: string) => createHmac("sha256", key).update(data).digest();
