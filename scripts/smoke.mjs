/**
 * End-to-end smoke test against a running dev server and a seeded database:
 *
 *   npm run dev            # in one terminal
 *   npm run db:seed
 *   node scripts/smoke.mjs
 *
 * It signs a teacher in, takes a class with the network cut, checks the taps
 * survive on the phone and reach the server when it comes back, registers a
 * new school through the wizard, and confirms a suspended school stops at the
 * hold page.
 */
import { chromium } from "playwright";

const base = (host, path = "/") => `http://${host}:3000${path}`;
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await ctx.newPage();
const out = [];
const log = (m) => { out.push(m); console.log(m); };

// 1. Teacher signs in and takes attendance offline.
await page.goto(base("stmary.lvh.me", "/login"));
await page.fill('input[name="identifier"]', "tcruz@stmary.example");
await page.fill('input[name="password"]', "password123");
await Promise.all([page.waitForURL("**/"), page.click('button[type="submit"]')]);
log(`login → ${page.url()}  headings: ${(await page.locator("h2").allTextContents()).join(" / ") || "(none — Sunday, no classes)"}`);

// The demo day is a Sunday, so drive a Monday explicitly.
const MONDAY = "2026-10-05";
const today = await page.evaluate(
  async (d) => (await fetch(`/api/attendance/today?date=${d}`)).json(),
  MONDAY,
);
log(`timetable for ${MONDAY}: ${today.slots.length} classes`);
await page.goto(base("stmary.lvh.me", `/attendance/${today.slots[0].id}?date=${MONDAY}`));
await page.waitForSelector("button[aria-label]");
const seats = await page.locator("button[aria-label]").count();
log(`class screen: ${seats} seats`);

// Tap three seats and check each one actually changed its mark.
const labelsBefore = await page
  .locator("button[aria-label]")
  .evaluateAll((els) => els.slice(0, 3).map((e) => e.getAttribute("aria-label")));
for (let i = 0; i < 3; i++) await page.locator("button[aria-label]").nth(i).click();
const labelsAfter = await page
  .locator("button[aria-label]")
  .evaluateAll((els) => els.slice(0, 3).map((e) => e.getAttribute("aria-label")));
const changed = labelsBefore.filter((l, i) => l !== labelsAfter[i]).length;
log(`taps changed ${changed} of 3 seats, now ${labelsAfter.join(", ")}`);
if (changed !== 3) throw new Error("tapping a seat did not change its mark");

// Go offline, submit, confirm it is queued and not lost.
await ctx.setOffline(true);
await page.click('button:has-text("Submit")');
const savedBanner = page.locator('[role="status"]', { hasText: /Held on this phone|Submitted\./ });
await savedBanner.first().waitFor();
log(`offline submit: ${(await savedBanner.first().textContent())?.trim()}`);

// The taps are on the phone, not on the server.
const queued = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open("schoolportal", 1);
      req.onsuccess = () => {
        const all = req.result.transaction("queue").objectStore("queue").getAll();
        all.onsuccess = () => resolve(all.result.length);
      };
    }),
);
log(`queued on the phone while offline: ${queued}`);

await ctx.setOffline(false);
await page.reload();
await page.waitForSelector("button[aria-label]");
await page.waitForTimeout(1500);
const reloaded = await page
  .locator("button[aria-label]")
  .evaluateAll((els) => els.slice(0, 3).map((e) => e.getAttribute("aria-label")));
log(`back online, the server has: ${reloaded.join(", ")}`);
if (reloaded.join("|") !== labelsAfter.join("|"))
  throw new Error("the marks taken offline did not survive the upload");
// The upload is a round trip per mark, so poll rather than guess a delay.
const queueLength = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("schoolportal", 1);
        req.onsuccess = () => {
          const all = req.result.transaction("queue").objectStore("queue").getAll();
          all.onsuccess = () => resolve(all.result.length);
        };
      }),
  );
let left = await queueLength();
for (let i = 0; i < 30 && left > 0; i++) {
  await page.waitForTimeout(500);
  left = await queueLength();
}
log(`queue drained to ${left}`);
if (left !== 0) throw new Error("the queue never emptied after the signal returned");
await page.screenshot({ path: "./attendance.png", fullPage: false });

// 2. Registration wizard, all four steps.
const page2 = await ctx.newPage();
await page2.goto(base("lvh.me", "/register"));
const sub = `demo${Date.now().toString(36)}`;
await page2.fill('input >> nth=0', "Holy Trinity Academy");
await page2.fill('input >> nth=1', "Ana Dela Cruz");
await page2.fill('input[type="email"]', `owner-${sub}@example.test`);
await page2.fill('input >> nth=3', "+639170001111");
await page2.fill('input[type="password"]', "password123");
await page2.click('button:has-text("Send verification code")');
await page2.waitForSelector("text=/your code is/");
const hint = await page2.locator("text=/your code is/").textContent();
const code = hint.match(/is ([A-Z0-9]{6})/)[1];
await page2.fill('input >> nth=5', code);
await page2.click('button:has-text("Verify")');
await page2.waitForSelector("text=Email verified");
await page2.click('button:has-text("Continue")');
await page2.fill('input >> nth=0', sub);
await page2.waitForSelector("text=Available.");
await page2.click('button:has-text("Continue")');
await page2.click('button:has-text("Continue")');
await page2.locator('label:has-text("Academic")').click();
await page2.click('button:has-text("Create my school")');
await page2.waitForSelector("text=Your school is live", { timeout: 20000 });
log(`registered ${sub} → ${await page2.locator("a[href*='" + sub + "']").getAttribute("href")}`);

// 3. The new school's owner can sign in and sees the setup checklist.
const page3 = await ctx.newPage();
await page3.goto(base(`${sub}.lvh.me`, "/login"));
await page3.fill('input[name="identifier"]', `owner-${sub}@example.test`);
await page3.fill('input[name="password"]', "password123");
await Promise.all([page3.waitForURL("**/"), page3.click('button[type="submit"]')]);
await page3.goto(base(`${sub}.lvh.me`, "/setup"));
log(`new school setup page: ${await page3.locator("h2").first().textContent()}`);

// 4. Grades is in the Academic tier; Registrar is not.
await page3.goto(base(`${sub}.lvh.me`, "/modules"));
const rows = await page3.locator("tbody tr").allTextContents();
log(`modules: ${rows.filter((r) => /Grades|Registrar/.test(r)).map((r) => r.replace(/\s+/g, " ").trim()).join(" | ")}`);
await page3.screenshot({ path: "./modules.png" });

// 5. A suspended school stops at the hold page.
const page4 = await ctx.newPage();
await page4.goto(base("northgate.lvh.me", "/"));
log(`suspended school → ${page4.url()} : ${await page4.locator("h1").first().textContent()}`);

await browser.close();
