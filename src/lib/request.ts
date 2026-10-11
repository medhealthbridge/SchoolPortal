import { headers } from "next/headers";

/**
 * The caller's address, for throttling. Behind a proxy the left-most entry of
 * `x-forwarded-for` is the client; locally there is no header at all, so
 * everything falls into one bucket, which is right for a single machine.
 */
export async function clientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "local";
}
