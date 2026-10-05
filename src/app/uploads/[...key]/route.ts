import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { storageDriver } from "@/lib/storage";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * Serves what the local driver wrote. With S3 configured the files are served
 * by the bucket and nothing reaches here.
 *
 * The key shape is checked against a pattern rather than resolved and
 * compared: `..` never matches it, so there is no path to traverse out of
 * .uploads in the first place.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  if (storageDriver() !== "local") return new NextResponse("Not found.", { status: 404 });

  const { key } = await ctx.params;
  const path = key.join("/");
  if (!/^(?:[\w-]+\/)+[0-9a-f-]{36}\.\w{3,4}$/.test(path)) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const ext = path.split(".").pop()!.toLowerCase();
  const type = TYPES[ext];
  if (!type) return new NextResponse("Not found.", { status: 404 });

  try {
    const bytes = await readFile(join(process.cwd(), ".uploads", path));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": type,
        // The name carries a fresh UUID on every upload, so the file at a URL
        // never changes and can be cached hard.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found.", { status: 404 });
  }
}
