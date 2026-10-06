/**
 * Privacy consent (RA 10173) in a real browser, against the seeded St. Mary.
 *
 *   npm run db:seed && npm run dev
 *   node scripts/privacy-e2e.mjs
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CH = process.env.CHROME_PATH;
const b = await chromium.launch(CH ? { executablePath: CH } : {});
const host = "stmary.lvh.me";
const base = `http://${host}:3000`;
const dbUrl = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)[1];
const sql = (q) => execSync(`psql "${dbUrl}" -Atc "${q}"`).toString().trim();
const mint = (email) => execSync(`npx tsx scripts/make-session.ts stmary ${email}`).toString().trim();
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};
const text = (p) => p.locator("body").innerText();
async function as(email, width = 390) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  await ctx.addCookies([{ name: "sp_session", value: mint(email), domain: host, path: "/" }]);
  return ctx.newPage();
}
const go = (p, path) => p.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 90_000 });

sql("update users set privacy_consent_version = null, privacy_consent_at = null where email = 'teacher@stmary.databridgesol.space'");
const t = await as("teacher@stmary.databridgesol.space");
await go(t, "/grades");
check(t.url().includes("/privacy"), "a person who has not accepted is shown the notice first");
const notice = await text(t);
check(notice.includes("St. Mary") && notice.includes("National Privacy Commission"), "the notice names the school and the person's rights");
const r = await t.request.get(`${base}/attendance/sf2/download?section=x`);
check(r.url().includes("/privacy") || r.status() !== 200, "downloads wait for consent too");
const button = t.getByRole("button", { name: "I agree, continue" });
check(await button.isDisabled(), "the button waits for the box to be ticked");
await t.getByRole("checkbox").check();
await button.click();
await t.waitForURL((u) => !u.pathname.startsWith("/privacy"), { timeout: 30_000 }).catch(() => {});
check(!t.url().includes("/privacy"), "accepting opens the portal");
check(sql("select privacy_consent_version from users where email = 'teacher@stmary.databridgesol.space'") === "1", "the consent is recorded with its version");
const overflow = await t.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
check(!overflow, "no sideways scroll at 390px");

/* ---------- the school changes its notice and asks again ---------- */
const adm = await as("admin@stmary.databridgesol.space", 1280);
await go(adm, "/setup");
await adm.locator('input[name="privacyOfficer"]').fill("Ms. Reyes, dpo@stmary.example");
await adm.locator('input[name="askAgain"]').check();
await adm.getByRole("button", { name: "Save privacy notice" }).click();
await adm.waitForSelector("text=/asked to accept version 2/", { timeout: 30_000 }).catch(() => {});
check((await text(adm)).includes("asked to accept version 2"), "the admin saves a new version");

const par = await as("parent@stmary.databridgesol.space");
await go(par, "/");
check(par.url().includes("/privacy") && (await text(par)).includes("Ms. Reyes"), "everyone is asked again, with the new contact");

const anon = await (await b.newContext()).newPage();
await go(anon, "/login");
await anon.getByRole("link", { name: /personal information/ }).click();
await anon.waitForURL(/privacy/);
check((await text(anon)).includes("privacy notice") && !(await text(anon)).includes("I agree"), "anyone can read the notice from the sign-in page");

sql("update schools set privacy_notice_version = 1, privacy_officer = null where subdomain = 'stmary'");
await b.close();
console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
