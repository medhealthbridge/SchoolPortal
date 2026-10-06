/**
 * Walks the registrar's student screens in a real browser: add, edit,
 * withdraw, restore, delete, import, and the screens the admin and a teacher
 * see instead.
 *
 *   npm run dev && npm run db:seed
 *   node scripts/students-e2e.mjs
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const CH = process.env.CHROME_PATH;
const b = await chromium.launch(CH ? { executablePath: CH } : {});
const host = "stmary.lvh.me";
const base = `http://${host}:3000`;
const mint = (email) =>
  execSync(`npx tsx scripts/make-session.ts stmary ${email}`).toString().trim();

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};

async function page(email) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addCookies([{ name: "sp_session", value: mint(email), domain: host, path: "/" }]);
  return ctx.newPage();
}
const body = (p) => p.locator("body").innerText();
const stamp = Date.now().toString().slice(-6);
const lrn = `8${stamp}00000`; // 12 digits, new each run

// --- registrar ---------------------------------------------------------
const r = await page("registrar@stmary.example");
await r.goto(`${base}/students`, { waitUntil: "networkidle", timeout: 90_000 });
check((await body(r)).includes("Add a student"), "registrar sees the add form");
check((await body(r)).includes("Import from a spreadsheet"), "registrar sees the import form");

// Add one by hand.
await r.fill('input[name="student_number"]', `E2E-${stamp}`);
await r.fill('input[name="first_name"]', "Lia");
await r.fill('input[name="last_name"]', `Tester${stamp}`);
await r.fill('input[name="lrn"]', `${lrn.slice(0, 4)} ${lrn.slice(4, 8)} ${lrn.slice(8)}`);
await r.fill('input[name="birth_date"]', "2012-06-30");
await r.selectOption('select[name="sex"]', "female");
await r.fill('input[name="religion"]', "Islam");
await r.check('input[name="four_ps"]');
await r.selectOption('select[name="sectionId"]', { index: 1 });
await r.click('button:has-text("Add student")');
await r.waitForSelector("text=Lia Tester" + stamp + " added", { timeout: 20_000 }).catch(() => {});
check((await body(r)).includes(`Lia Tester${stamp} added`), "manual add confirms");

// A bad LRN is refused with a reason, and nothing is saved.
await r.fill('input[name="student_number"]', `E2E-BAD-${stamp}`);
await r.fill('input[name="first_name"]', "Bad");
await r.fill('input[name="last_name"]', "Lrn");
await r.fill('input[name="lrn"]', "123");
await r.click('button:has-text("Add student")');
await r.waitForSelector("text=An LRN is 12 digits", { timeout: 20_000 }).catch(() => {});
check((await body(r)).includes("An LRN is 12 digits"), "a short LRN is refused");

// The same student number again is refused.
await r.fill('input[name="student_number"]', `E2E-${stamp}`);
await r.fill('input[name="first_name"]', "Dup");
await r.fill('input[name="last_name"]', "Number");
await r.fill('input[name="lrn"]', "");
await r.click('button:has-text("Add student")');
await r.waitForSelector(`text=Student number E2E-${stamp} belongs to`, { timeout: 20_000 }).catch(() => {});
check((await body(r)).includes(`Student number E2E-${stamp} belongs to`), "a repeated student number is refused");

// Find it, open the record, edit.
await r.goto(`${base}/students?q=Tester${stamp}`, { waitUntil: "networkidle" });
await r.click(`a:has-text("Tester${stamp}")`);
await r.waitForURL(/\/students\/[0-9a-f-]{36}/, { timeout: 30_000 });
const recordUrl = r.url();
check(
  (await r.inputValue('input[name="lrn"]')) === lrn &&
    (await r.inputValue('input[name="religion"]')) === "Islam" &&
    (await r.isChecked('input[name="four_ps"]')),
  "the record shows what was typed, including the sensitive fields",
);
await r.fill('input[name="place_of_birth"]', "Marawi City");
await r.click('button:has-text("Save changes")');
await r.waitForSelector("text=Saved.", { timeout: 20_000 }).catch(() => {});
check((await body(r)).includes("Saved."), "edit saves");
await r.reload({ waitUntil: "networkidle" });
check((await r.inputValue('input[name="place_of_birth"]')) === "Marawi City", "the edit persisted");

// Withdraw, find them under withdrawn, restore.
await r.click('button:has-text("Withdraw student")');
await r.waitForSelector("text=This student has withdrawn", { timeout: 20_000 }).catch(() => {});
check((await body(r)).includes("This student has withdrawn"), "withdraw marks the record");
await r.goto(`${base}/students?q=Tester${stamp}`, { waitUntil: "networkidle" });
check(!(await body(r)).includes(`Tester${stamp}, Lia`), "withdrawn student leaves the class list");
await r.goto(`${base}/students?show=withdrawn&q=Tester${stamp}`, { waitUntil: "networkidle" });
check((await body(r)).includes(`Tester${stamp}, Lia`), "…and appears under withdrawn");
await r.goto(recordUrl, { waitUntil: "networkidle" });
await r.click('button:has-text("Restore student")');
await r.waitForSelector("text=Delete this record", { timeout: 20_000 }).catch(() => {});
check((await body(r)).includes("Delete this record"), "restore brings the record back");

// Delete a record with no history.
r.once("dialog", (d) => d.accept());
await r.click('button:has-text("Delete this record")');
await r.waitForURL(`${base}/students`, { timeout: 30_000 }).catch(() => {});
await r.goto(`${base}/students?q=Tester${stamp}`, { waitUntil: "networkidle" });
check(!(await body(r)).includes(`Tester${stamp}, Lia`), "a mistaken record can be deleted");

// A student with marks cannot be deleted.
await r.goto(`${base}/students?q=ST-2026-0001`, { waitUntil: "networkidle" });
await r.locator("tbody a").first().click();
await r.waitForURL(/\/students\/[0-9a-f-]{36}/, { timeout: 30_000 });
r.once("dialog", (d) => d.accept());
await r.click('button:has-text("Delete this record")');
await r.waitForSelector("text=cannot be deleted", { timeout: 20_000 }).catch(() => {});
check((await body(r)).includes("cannot be deleted"), "a student with history is refused and told to withdraw");

// Template download and import.
const tpl = await r.request.get(`${base}/students/template`);
const csv = await tpl.text();
check(tpl.ok() && csv.startsWith("student_number,first_name,middle_name"), "template downloads");
const file = `/tmp/claude-0/e2e-${stamp}.csv`;
writeFileSync(
  file,
  csv.replace("2025-0001", `IMP-${stamp}-1`).replace("123456789012", `7${stamp}00000`),
);
await r.goto(`${base}/students`, { waitUntil: "networkidle" });
await r.setInputFiles('input[type="file"]', file);
await r.click('button:has-text("Import students")');
await r.waitForSelector("text=students imported", { timeout: 30_000 }).catch(() => {});
const after = await body(r);
check(/1 students imported/.test(after) || after.includes("students imported"), "the template's own example row imports");
await r.goto(`${base}/students?q=IMP-${stamp}`, { waitUntil: "networkidle" });
check((await body(r)).includes("Dela Cruz"), "the imported student is listed");

// Re-importing the same file adds nobody and says so.
await r.goto(`${base}/students`, { waitUntil: "networkidle" });
await r.setInputFiles('input[type="file"]', file);
await r.click('button:has-text("Import students")');
await r.waitForSelector("text=already on file", { timeout: 30_000 }).catch(() => {});
check((await body(r)).includes("0 students imported"), "importing twice adds nobody");

// A bad file saves nothing.
const bad = `/tmp/claude-0/e2e-bad-${stamp}.csv`;
writeFileSync(bad, "student_number,first_name,last_name,lrn\nBAD-1,A,B,12\nBAD-2,,C,\n");
await r.goto(`${base}/students`, { waitUntil: "networkidle" });
await r.setInputFiles('input[type="file"]', bad);
await r.click('button:has-text("Import students")');
await r.waitForSelector("text=Nothing was saved", { timeout: 30_000 }).catch(() => {});
const t = await body(r);
check(t.includes("Nothing was saved") && t.includes("Line 2") && t.includes("Line 3"), "a bad file saves nothing and names the lines");

// The download card: columns to tick, formats, a blank template.
await r.goto(`${base}/students`, { waitUntil: "networkidle" });
const panel = r.locator("#download");
check((await panel.locator('input[name="cols"]').count()) >= 15, "registrar is offered every column, restricted ones included");
check((await panel.locator('input[name="format"]').count()) === 3, "Excel, PDF and CSV are offered");
check((await panel.locator('input[name="blank"]').count()) === 1, "a blank template is offered");
await panel.locator('input[name="cols"][value="religion"]').check();
await panel.locator('input[name="format"][value="pdf"]').check();
const [dl] = await Promise.all([
  r.waitForEvent("download"),
  panel.locator('button:has-text("Download")').click(),
]);
check(dl.suggestedFilename().endsWith(".pdf") && dl.suggestedFilename().startsWith("students-"), "ticked columns download as a PDF");

// No horizontal scroll on the screens a phone uses.
const overflow = await r.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
);
check(!overflow, "no sideways scroll at 390px");
await r.screenshot({ path: "/tmp/claude-0/students-390.png", fullPage: true });

// --- the school admin: reads, cannot change -----------------------------
const a = await page("admin@stmary.example");
await a.goto(`${base}/students`, { waitUntil: "networkidle" });
const at = await body(a);
check(!at.includes("Add a student") && !at.includes("Import from a spreadsheet"), "admin sees no add or import form");
check(at.includes("Class list"), "admin can still read the class list");
await a.goto(`${base}/students`, { waitUntil: "networkidle" });
const aPanel = a.locator("#download");
check((await aPanel.locator('input[name="cols"][value="religion"]').count()) === 0, "admin is not offered religion");
check((await aPanel.locator('input[name="cols"][value="lrn"]').count()) === 0, "admin is not offered the LRN");
check((await aPanel.locator('input[name="cols"][value="student_number"]').count()) === 1, "admin is offered the plain columns");
const denied = await a.request.get(`${base}/students/template`);
check(denied.status() === 404, "admin cannot download the template (404)");
await a.goto(`${base}/students/${recordUrl.split("/").pop()}`, { waitUntil: "networkidle" });
check(a.url().includes("/students/") && (await body(a)).match(/not found|404/i) !== null, "admin cannot open the record page");

// --- a teacher: reads only, no sensitive fields -------------------------
const tch = await page("tcruz@stmary.example");
await tch.goto(`${base}/students`, { waitUntil: "networkidle" });
const tt = await body(tch);
check(!tt.includes("Add a student") && !tt.includes("Islam") && !tt.includes("Activation code"), "teacher sees a plain list");

await b.close();
console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
