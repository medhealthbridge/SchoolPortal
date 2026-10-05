/**
 * Responsive check: loads every screen at phone, tablet and desktop widths and
 * fails loudly on any horizontal page scroll.
 *
 *   npm run dev && npm run db:seed
 *   node resp-check.mjs
 */
import { chromium } from "playwright";
const CH = process.env.CHROME_PATH;
const WIDTHS = [320, 360, 390, 414, 768, 1024, 1440];

const b = await chromium.launch(CH ? { executablePath: CH } : {});

async function session(host, email) {
  const { execSync } = await import("node:child_process");
  if (!email) return null;
  return execSync(`npx tsx scripts/make-session.ts ${host} ${email}`).toString().trim();
}

/** The platform admin signs in with a TOTP code, so the sweep mints one instead. */
async function adminSession() {
  const { execSync } = await import("node:child_process");
  return execSync("npx tsx scripts/make-admin-session.ts").toString().trim();
}

const admin = await session("stmary", "admin@stmary.example");
const teacher = await session("stmary", "tcruz@stmary.example");
// Each office has its own account; the admin is deliberately locked out of them.
const officer = await session("stmary", "discipline@stmary.example");
const counselor = await session("stmary", "guidance@stmary.example");
const sao = await session("stmary", "sao@stmary.example");
const chaplain = await session("stmary", "chaplain@stmary.example");
const cashier = await session("stmary", "cashier@stmary.example");
const platform = await adminSession();

const PAGES = [
  ["lvh.me", "/", null],
  ["lvh.me", "/register", null],
  ["stmary.lvh.me", "/login", null],
  ["stmary.lvh.me", "/signup", null],
  ["northgate.lvh.me", "/on-hold", null],
  ["stmary.lvh.me", "/", admin],
  ["stmary.lvh.me", "/setup", admin],
  ["stmary.lvh.me", "/students", admin],
  ["stmary.lvh.me", "/people", admin],
  ["stmary.lvh.me", "/modules", admin],
  ["stmary.lvh.me", "/billing", admin],
  ["stmary.lvh.me", "/audit", admin],
  ["stmary.lvh.me", "/attendance/report", admin],
  ["stmary.lvh.me", "/attendance", teacher],
  ["stmary.lvh.me", "/grades", admin],
  ["stmary.lvh.me", "/announcements", admin],
  ["stmary.lvh.me", "/discipline", officer],
  ["stmary.lvh.me", "/guidance", counselor],
  ["stmary.lvh.me", "/sao", sao],
  ["stmary.lvh.me", "/chaplain", chaplain],
  ["stmary.lvh.me", "/registrar", admin],
  ["stmary.lvh.me", "/fees", cashier],
  ["stmary.lvh.me", "/analytics", admin],
  ["admin.lvh.me", "/login", null],
  // The platform admin's own screens, on its own cookie.
  ["admin.lvh.me", "/", platform, "sp_admin"],
  ["admin.lvh.me", "/invoices", platform, "sp_admin"],
  ["admin.lvh.me", "/messages", platform, "sp_admin"],
];

const problems = [];
for (const w of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  for (const [host, path, sid, cookie = "sp_session"] of PAGES) {
    if (sid) await ctx.addCookies([{ name: cookie, value: sid, domain: host, path: "/" }]);
    const p = await ctx.newPage();
    const res = await p.goto(`http://${host}:3000${path}`, { waitUntil: "networkidle" });
    const m = await p.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      wide: [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 3)
        .map((el) => el.tagName + "." + (el.className?.toString?.().slice(0, 50) ?? "")),
    }));
    if (m.scroll > m.client + 1) problems.push(`${w}px ${host}${path}: scrollWidth ${m.scroll} > ${m.client} :: ${m.wide.join(" | ")}`);
    if (res.status() >= 400) problems.push(`${w}px ${host}${path}: HTTP ${res.status()}`);
    await p.close();
  }
  await ctx.close();
}
console.log(problems.length ? problems.join("\n") : "no horizontal overflow at any width");
if (problems.length) process.exitCode = 1;
await b.close();
