import { NextResponse, type NextRequest } from "next/server";

/**
 * Resolves the tenant from the subdomain and rewrites to the right tree:
 *
 *   yourapp.com         → /site/*    public marketing + registration
 *   admin.yourapp.com   → /admin/*   platform admin (you)
 *   stmary.yourapp.com  → /s/*       one school
 *
 * The school's status is NOT checked here: middleware runs on the edge with no
 * database. `requireSchool()` does it server-side on every page and API route,
 * which is also what makes a suspension take effect on the next request of an
 * already-open session.
 */
export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const rootDomain = (process.env.ROOT_DOMAIN ?? "lvh.me:3000").split(":")[0];

  let sub = "";
  if (host.endsWith(`.${rootDomain}`)) {
    sub = host.slice(0, -(rootDomain.length + 1));
  }
  // Treat a bare "www" like the root domain.
  if (sub === "www") sub = "";

  const path = url.pathname;
  const requestHeaders = new Headers(req.headers);
  if (sub) requestHeaders.set("x-school-subdomain", sub);

  const target = !sub ? "/site" : sub === "admin" ? "/admin" : "/s";
  const next = url.clone();
  next.pathname = `${target}${path === "/" ? "" : path}`;
  return NextResponse.rewrite(next, { request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|manifest.webmanifest|sw.js|icons/).*)"],
};
