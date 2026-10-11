/**
 * DepEd class record, SF9 and SF2 in a real browser, against the seeded
 * St. Mary on a local dev server.
 *
 *   npm run db:seed && npm run dev
 *   node scripts/grades-e2e.mjs
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
async function as(email, width = 1280) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  await ctx.addCookies([{ name: "sp_session", value: mint(email), domain: host, path: "/" }]);
  return ctx.newPage();
}
const go = (p, path) => p.goto(path.startsWith("http") ? path : `${base}${path}`, { waitUntil: "networkidle", timeout: 90_000 });

const t = await as("teacher@stmary.databridgesol.space");
await go(t, "/grades");
const classHref = await t.locator('a[href^="/grades/"]').filter({ hasNotText: "card" }).first().getAttribute("href");
check(Boolean(classHref), `the teacher has a class to grade (${classHref})`);
await go(t, classHref);
const body = await text(t);
check(body.includes("How this subject is weighted"), "the class record opens with the subject's weighting");

async function add(component, title, hps) {
  await t.locator('select[name="component"]').selectOption(component);
  await t.locator('input[name="title"]').fill(title);
  await t.locator('input[name="highestScore"]').fill(String(hps));
  await t.getByRole("button", { name: "Add to the record" }).click();
  await t.waitForSelector(`text=${title} added`, { timeout: 30_000 }).catch(() => {});
}
await add("ww", `Quiz ${stamp}`, 20);
await add("pt", `Report ${stamp}`, 50);
await add("qa", `Exam ${stamp}`, 40);
await go(t, t.url());
check((await text(t)).includes(`Exam ${stamp}`), "three assessments are in the record");

async function enter(title, value) {
  await go(t, t.url().split("/assessment")[0].split("?")[0]);
  await t.locator("li", { hasText: title }).getByRole("link", { name: "Enter scores" }).click();
  await t.waitForURL(/assessment/, { timeout: 30_000 });
  await t.waitForLoadState("networkidle");
  const boxes = t.locator('input[name^="raw:"]');
  await boxes.first().fill(String(value));
  await t.getByRole("button", { name: "Save scores" }).click();
  await t.waitForSelector("text=/saved for/", { timeout: 30_000 }).catch(() => {});
  return (await text(t)).includes("saved for");
}
check(await enter(`Quiz ${stamp}`, 16), "raw Written Work scores save");
await enter(`Report ${stamp}`, 45);
const over = await (async () => {
  await go(t, t.url().split("?")[0]);
  const boxes = t.locator('input[name^="raw:"]');
  await boxes.first().fill("99");
  await t.getByRole("button", { name: "Save scores" }).click();
  await t.waitForSelector("text=Nothing was saved", { timeout: 20_000 }).catch(() => {});
  return (await text(t)).includes("Nothing was saved");
})();
check(over, "a score above the highest possible is refused");
await enter(`Exam ${stamp}`, 30);

await go(t, t.url().split("/assessment")[0]);
const rec = await text(t);
// 80% / 90% / 75%. Math and Science weigh 40/40/20: 83 → 89. Languages 30/50/20: 84 → 90.
const mathish = rec.includes("Written Work 40%");
const want = mathish ? ["83", "89"] : ["84", "90"];
const firstRow = await t.locator("tbody tr").first().innerText();
check(want.every((v) => firstRow.includes(v)), `the quarterly grade is computed (${mathish ? "40/40/20" : "30/50/20"}): ${firstRow.replace(/\s+/g, " ")}`);
await t.getByRole("button", { name: /Post \d+ grades? to report cards/ }).click();
await t.waitForSelector("text=/posted to report cards/", { timeout: 30_000 }).catch(() => {});
check((await text(t)).includes("posted to report cards"), "the teacher posts quarterly grades to report cards");
const overflow = await (async () => {
  const p = await as("teacher@stmary.databridgesol.space", 390);
  await go(p, t.url());
  return p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
})();
check(!overflow, "the class record has no sideways scroll at 390px");

/* ---------- the parent's report card and SF9 ---------- */
const par = await as("parent@stmary.databridgesol.space", 390);
await go(par, "/");
const childHref = await par.locator('a[href^="/child/"]').first().getAttribute("href").catch(() => null);
if (childHref) await go(par, childHref);
const cardHref = await par.locator('a[href^="/grades/card/"]').first().getAttribute("href").catch(() => null);
if (cardHref) {
  await go(par, cardHref);
  const card = await text(par);
  check(card.includes("Descriptors") && card.includes("Outstanding"), "the report card shows the DepEd descriptors");
  const [dl] = await Promise.all([par.waitForEvent("download"), par.getByRole("link", { name: "Download SF9 (PDF)" }).click()]);
  const path = `/tmp/claude-0/sf9-${stamp}.pdf`;
  await dl.saveAs(path);
  const head = execSync(`head -c 5 ${path}`).toString();
  check(head === "%PDF-", "the SF9 downloads as a PDF");
} else check(false, "the parent can reach a report card");

/* ---------- SF2 ---------- */
const adv = await as("teacher@stmary.databridgesol.space");
await go(adv, "/attendance/sf2");
const sf2 = await text(adv);
check(sf2.includes("school days"), "the SF2 sheet shows the month's school days");
const [x] = await Promise.all([adv.waitForEvent("download"), adv.getByRole("link", { name: "Excel" }).click()]);
const xpath = `/tmp/claude-0/sf2-${stamp}.xlsx`;
await x.saveAs(xpath);
check(execSync(`head -c 2 ${xpath}`).toString() === "PK", "the SF2 downloads as an Excel file");
const outsider = await as("parent@stmary.databridgesol.space");
const res = await outsider.request.get(`${base}/attendance/sf2/download?section=x&month=2026-10`);
check(res.status() === 404 || res.status() === 403, `a parent cannot download an SF2 (${res.status()})`);

await b.close();
console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
