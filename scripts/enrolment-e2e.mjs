/**
 * Online enrolment in a real browser: a family applies on the school's site,
 * checks on it, and the registrar approves it into a section.
 *
 *   npm run db:seed && npm run dev
 *   node scripts/enrolment-e2e.mjs
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const CH = process.env.CHROME_PATH;
const b = await chromium.launch(CH ? { executablePath: CH } : {});
const host = "stmary.lvh.me";
const base = `http://${host}:3000`;
const stamp = Date.now().toString(36).slice(-4);
const mint = (email) => execSync(`npx tsx scripts/make-session.ts stmary ${email}`).toString().trim();
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};
const text = (p) => p.locator("body").innerText();
const go = (p, path) => p.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 90_000 });
async function as(email, width = 390) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  if (email) await ctx.addCookies([{ name: "sp_session", value: mint(email), domain: host, path: "/" }]);
  return ctx.newPage();
}

/* ---------- the registrar opens the form ---------- */
const reg = await as("registrar@stmary.databridgesol.space", 1280);
await go(reg, "/enrolments");
if ((await text(reg)).includes("Open the form")) {
  await reg.getByRole("button", { name: "Open the form" }).click();
  await reg.waitForSelector("text=The online form is open", { timeout: 20_000 }).catch(() => {});
}
check((await text(reg)).includes("The online form is open"), "the registrar opens the online form");

/* ---------- a family applies ---------- */
const fam = await as(null);
await go(fam, "/enrol");
await fam.locator('select[name="grade_level"]').selectOption({ index: 1 });
const level = await fam.locator('select[name="grade_level"]').inputValue();
await fam.locator('input[name="first_name"]').fill("Lia");
await fam.locator('input[name="last_name"]').fill(`Ramos${stamp}`);
await fam.locator('input[name="birth_date"]').fill("2014-02-03");
await fam.locator('input[name="guardian_name"]').fill("Rosa Ramos");
await fam.locator('input[name="guardian_phone"]').fill("0917 555 0101");
await fam.getByRole("button", { name: "Send the application" }).click();
const blocked = await fam.locator('input[name="consent"]').evaluate((el) => !el.checkValidity());
check(blocked, "the form will not send without agreeing to the privacy notice");
await fam.locator('input[name="consent"]').check();
await fam.getByRole("button", { name: "Send the application" }).click();
await fam.waitForSelector("text=/Your reference is/", { timeout: 30_000 }).catch(() => {});
const sent = await text(fam);
const ref = (sent.match(/reference is ([A-Z0-9]{4}-[A-Z0-9]{4})/) ?? [])[1];
check(Boolean(ref), `the family gets a reference (${ref})`);
const overflow = await fam.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
check(!overflow, "the form has no sideways scroll at 390px");

await go(fam, "/enrol/status");
await fam.locator("#reference").fill(ref ?? "");
await fam.locator("#phone").fill("09175550101");
await fam.getByRole("button", { name: "Check" }).click();
await fam.waitForSelector("text=/not decided yet/", { timeout: 20_000 }).catch(() => {});
check((await text(fam)).includes("not decided yet"), "the family sees it is waiting");

/* ---------- the registrar approves ---------- */
await go(reg, "/enrolments");
const card = reg.locator("section", { hasText: `Ramos${stamp}` });
check(await card.isVisible(), "the application is in the registrar's list");
await card.getByRole("button", { name: "Approve and enrol" }).click();
await reg.waitForSelector("text=/is enrolled in/", { timeout: 30_000 }).catch(() => {});
const approved = await text(reg);
check(approved.includes(`Lia Ramos${stamp} is enrolled in ${level}`), `approved into a ${level} section`);

await go(reg, `/students?q=Ramos${stamp}`);
check((await text(reg)).includes(`Ramos${stamp}`), "the learner is now on the student list");

await go(fam, "/enrol/status");
await fam.locator("#reference").fill(ref ?? "");
await fam.locator("#phone").fill("0917 555 0101");
await fam.getByRole("button", { name: "Check" }).click();
await fam.waitForSelector("text=/Approved/", { timeout: 20_000 }).catch(() => {});
check((await text(fam)).includes("Approved"), "the family sees it approved");

const teacher = await as("teacher@stmary.databridgesol.space", 1280);
await go(teacher, "/enrolments");
check(!(await text(teacher)).includes("Enrolment applications"), "a teacher cannot open applications");

await b.close();
console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
