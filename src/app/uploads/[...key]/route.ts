import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withPlatform } from "@/db";
import { storedFiles } from "@/db/schema";
import { storageDriver } from "@/lib/storage";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const headers = (type: string) => ({
  "content-type": type,
  // The name carries a fresh UUID on every upload, so the file at a URL never
  // changes and can be cached hard.
  "cache-control": "public, max-age=31536000, immutable",
  // A logo is an image and nothing else, whatever the bytes turn out to be.
  "x-content-type-options": "nosniff",
});

/**
 * Serves what the database and local drivers stored. With S3 configured new
 * files are served by the bucket, but a logo uploaded before the bucket was
 * set up still has its /uploads address, so the database is read for every
 * driver except local.
 *
 * The key shape is checked against a pattern rather than resolved and
 * compared: `..` never matches it, so there is no path to traverse out of
 * .uploads in the first place.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const path = key.join("/");
  if (!/^(?:[\w-]+\/)+[0-9a-f-]{36}\.\w{3,4}$/.test(path)) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const ext = path.split(".").pop()!.toLowerCase();
  const type = TYPES[ext];
  if (!type) return new NextResponse("Not found.", { status: 404 });

  if (storageDriver() === "local") {
    try {
      const bytes = await readFile(join(process.cwd(), ".uploads", path));
      return new NextResponse(new Uint8Array(bytes), { headers: headers(type) });
    } catch {
      return new NextResponse("Not found.", { status: 404 });
    }
  }

  // A logo shows on the sign-in page, before anyone is signed in, so this read
  // is not scoped to a school. The key is an unguessable UUID, like a bucket URL.
  const [row] = await withPlatform((tx) =>
    tx.select().from(storedFiles).where(eq(storedFiles.key, path)).limit(1),
  );
  if (!row) return new NextResponse("Not found.", { status: 404 });
  return new NextResponse(new Uint8Array(row.data), { headers: headers(row.contentType) });
}
