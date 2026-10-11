/**
 * Next calls this once per server start, before the first request. The config
 * check belongs here rather than in a module anything imports: it must run
 * exactly once, and it must run even if no page is ever requested.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertConfig } = await import("@/lib/config");
  assertConfig();
}
