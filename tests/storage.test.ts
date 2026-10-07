import "../src/db/load-env";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { checkImage, keyFromUrl, put, remove, storageDriver, MAX_UPLOAD_BYTES } from "@/lib/storage";

const png = (() => {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([header, Buffer.alloc(64, 7)]);
})();
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32, 1)]);
const webp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBP"),
  Buffer.alloc(16),
]);
const file = (bytes: Buffer, name = "logo.png", type = "image/png") =>
  new File([new Uint8Array(bytes)], name, { type });

describe("what may be uploaded", () => {
  it("accepts the three formats a logo can be", async () => {
    for (const [bytes, ext] of [[png, "png"], [jpeg, "jpg"], [webp, "webp"]] as const) {
      const checked = await checkImage(file(bytes));
      expect(checked.ok && checked.ext).toBe(ext);
    }
  });

  it("reads the bytes, not the name or the content-type the browser claimed", async () => {
    // A script renamed .png with an image content-type: exactly what an
    // attacker uploads, and exactly what a check on the name would admit.
    const script = file(Buffer.from('<svg onload="alert(1)">'), "logo.png", "image/png");
    const checked = await checkImage(script);
    expect(checked.ok).toBe(false);
    expect(checked.ok === false && checked.error).toMatch(/PNG, JPEG or WebP/);
  });

  it("refuses an SVG even when it is a real one, because it can carry script", async () => {
    const svg = file(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'));
    expect((await checkImage(svg)).ok).toBe(false);
  });

  it("refuses an empty file and one over the limit, and says the size in both", async () => {
    expect((await checkImage(file(Buffer.alloc(0)))).ok).toBe(false);
    const big = file(Buffer.concat([png, Buffer.alloc(MAX_UPLOAD_BYTES)]));
    const checked = await checkImage(big);
    expect(checked.ok).toBe(false);
    expect(checked.ok === false && checked.error).toMatch(/2\.0 MB/);
  });
});

describe("storing a file", () => {
  const written: string[] = [];
  afterEach(async () => {
    for (const key of written.splice(0)) await remove(key);
  });

  it("writes it, serves it back byte for byte, and deletes it", async () => {
    expect(storageDriver()).toBe("local"); // no S3 configured in the test env
    const stored = await put("schools/test", png, "image/png", "png");
    written.push(stored.key);

    expect(stored.url).toBe(`/uploads/${stored.key}`);
    const onDisk = await readFile(join(process.cwd(), ".uploads", stored.key));
    expect(onDisk.equals(png)).toBe(true);

    await remove(stored.key);
    written.pop();
    await expect(readFile(join(process.cwd(), ".uploads", stored.key))).rejects.toThrow();
  });

  it("gives every upload a new name, so a replaced logo is never served stale", async () => {
    const a = await put("schools/test", png, "image/png", "png");
    const b = await put("schools/test", png, "image/png", "png");
    written.push(a.key, b.key);
    expect(a.key).not.toBe(b.key);
  });

  it("keeps each school's files under its own id", async () => {
    const stored = await put("schools/abc", png, "image/png", "png");
    written.push(stored.key);
    expect(stored.key.startsWith("schools/abc/")).toBe(true);
  });
});

describe("reading a key back out of a url", () => {
  it("recognises one of ours", () => {
    expect(keyFromUrl("/uploads/schools/a1/3f2504e0-4f89-11d3-9a0c-0305e82c3301.png")).toBe(
      "schools/a1/3f2504e0-4f89-11d3-9a0c-0305e82c3301.png",
    );
  });

  it("refuses anything shaped to escape the uploads folder", () => {
    for (const url of [
      "/uploads/../../etc/passwd",
      "/uploads/schools/../../../package.json",
      "https://elsewhere.test/schools/a1/3f2504e0-4f89-11d3-9a0c-0305e82c3301.png",
      "/etc/passwd",
      null,
    ]) {
      expect(keyFromUrl(url)).toBe(null);
    }
  });
});

describe("the S3 driver", () => {
  afterEach(() => {
    for (const k of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_REGION", "S3_PUBLIC_URL"]) {
      delete process.env[k];
    }
    vi.unstubAllGlobals();
  });

  const configure = () => {
    process.env.S3_BUCKET = "school-files";
    process.env.S3_ACCESS_KEY_ID = "AKIAEXAMPLE";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_REGION = "ap-southeast-1";
  };

  it("takes over as soon as a bucket and a key are configured", () => {
    configure();
    expect(storageDriver()).toBe("s3");
  });

  it("signs the PUT the way S3 expects and returns the public url", async () => {
    configure();
    process.env.S3_PUBLIC_URL = "https://files.example/";
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response("", { status: 200 });
    });

    const stored = await put("schools/a1", png, "image/png", "png");
    expect(stored.url).toBe(`https://files.example/${stored.key}`);

    const [call] = calls;
    expect(call!.url).toBe(`https://s3.ap-southeast-1.amazonaws.com/school-files/${stored.key}`);
    const auth = String((call!.init.headers as Record<string, string>).authorization);
    expect(auth).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/\d{8}\/ap-southeast-1\/s3\/aws4_request/);
    expect(auth).toContain("SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date");
    expect(auth).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it("raises when the bucket refuses, rather than returning a url to nothing", async () => {
    configure();
    vi.stubGlobal("fetch", async () => new Response("AccessDenied", { status: 403 }));
    await expect(put("schools/a1", png, "image/png", "png")).rejects.toThrow(/403/);
  });
});

describe("the database driver", () => {
  const made: string[] = [];
  afterEach(async () => {
    delete process.env.STORAGE_DRIVER;
    vi.unstubAllEnvs();
    const { dropSchool } = await import("./helpers");
    for (const id of made.splice(0)) await dropSchool(id);
  });

  it("is what production uses when there is no bucket, and a bucket still wins", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(storageDriver()).toBe("database");
    vi.stubEnv("STORAGE_DRIVER", "local");
    expect(storageDriver()).toBe("local");
    vi.stubEnv("STORAGE_DRIVER", "");
    vi.stubEnv("S3_BUCKET", "b");
    vi.stubEnv("S3_ACCESS_KEY_ID", "k");
    expect(storageDriver()).toBe("s3");
  });

  it("keeps a logo in Postgres, serves it with its own type, and deletes it", async () => {
    const { makeSchool } = await import("./helpers");
    const { GET } = await import("../src/app/uploads/[...key]/route");
    const { withPlatform } = await import("@/db");
    const { storedFiles } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const t = await makeSchool();
    made.push(t.school.id);
    process.env.STORAGE_DRIVER = "database";

    const stored = await put(`schools/${t.school.id}`, png, "image/png", "png");
    expect(stored.url).toBe(`/uploads/${stored.key}`);
    expect(keyFromUrl(stored.url)).toBe(stored.key);

    const res = await GET(new Request(`http://x${stored.url}`), {
      params: Promise.resolve({ key: stored.key.split("/") }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);

    await remove(stored.key);
    const rows = await withPlatform((tx) =>
      tx.select().from(storedFiles).where(eq(storedFiles.key, stored.key)),
    );
    expect(rows).toEqual([]);
    const gone = await GET(new Request(`http://x${stored.url}`), {
      params: Promise.resolve({ key: stored.key.split("/") }),
    });
    expect(gone.status).toBe(404);
  });

  it("refuses a key that is not a school's, and a path that climbs out", async () => {
    process.env.STORAGE_DRIVER = "database";
    await expect(put("schools/test", png, "image/png", "png")).rejects.toThrow();
    const { GET } = await import("../src/app/uploads/[...key]/route");
    const res = await GET(new Request("http://x/uploads/../../etc/passwd"), {
      params: Promise.resolve({ key: ["..", "..", "etc", "passwd"] }),
    });
    expect(res.status).toBe(404);
  });

  it("goes with the school when the school is deleted", async () => {
    const { makeSchool, dropSchool } = await import("./helpers");
    const { withPlatform } = await import("@/db");
    const { storedFiles } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const t = await makeSchool();
    process.env.STORAGE_DRIVER = "database";
    const stored = await put(`schools/${t.school.id}`, png, "image/png", "png");
    await dropSchool(t.school.id);
    const rows = await withPlatform((tx) =>
      tx.select().from(storedFiles).where(eq(storedFiles.key, stored.key)),
    );
    expect(rows).toEqual([]);
  });
});
