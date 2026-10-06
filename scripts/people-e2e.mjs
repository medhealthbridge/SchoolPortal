/**
 * The whole chain in a real browser, against the seeded St. Mary:
 *
 *   registrar adds a teacher → the teacher accepts → the registrar puts them
 *   on the schedule (with a clash refused) and makes them an adviser → the
 *   teacher sees their week and class list, invites a parent, posts a notice →
 *   the parent joins from the link and sees the child → a second child's
 *   invite lands on the same account only with the right password → the phone
 *   menu reaches every screen.
 *
 *   npm run db:seed && npm run dev
 *   node scripts/people-e2e.mjs
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const CH = process.env.CHROME_PATH;
const b = await chromium.launch(CH ? { executablePath: CH } : {});
const host = "stmary.lvh.me";
const base = `http://${host}:3000`;
const stamp = Date.now().toString(36).slice(-5);
const sh = (cmd) => execSync(cmd).toString().trim().split("\n").pop();
const mint = (email) => sh(`npx tsx scripts/make-session.ts stmary ${email}`);

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};
const text = (p) => p.locator("body").innerText();

async function as(email, width = 1280) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  if (email) await ctx.addCookies([{ name: "sp_session", value: mint(email), domain: host, path: "/" }]);
  return ctx.newPage();
}
const go = (p, path) => p.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 90_000 });

// A second section, so "other classes" exist.
const rizalId = sh(`npx tsx scripts/e2e-helper.ts section "Grade 8" Rizal`);

/* ---------------- registrar: add a teacher ---------------- */
const reg = await as("registrar@stmary.databridgesol.space");
await go(reg, "/teachers");
check((await text(reg)).includes("Add a teacher"), "registrar opens Teachers");
await reg.locator('input[name="name"]').first().fill(`Liza Ramos ${stamp}`);
const suggested = await reg.locator('input[name="email"]').inputValue();
check(suggested.startsWith("liza.ramos") && suggested.includes("@stmary."), `email is suggested from the name (${suggested})`);
const teacherEmail = `liza.${stamp}@stmary.lvh.me`;
await reg.locator('input[name="email"]').fill(teacherEmail);
await reg.getByRole("button", { name: "Add teacher" }).click();
await reg.waitForSelector("text=is added", { timeout: 20_000 }).catch(() => {});
check((await text(reg)).includes("is added"), "teacher is added");
await go(reg, "/teachers");
const link = await reg.locator("td.font-mono").filter({ hasText: "/invite/" }).last().innerText();
check(link.includes("/invite/"), "the invite link is on screen to copy");

/* ---------------- the teacher accepts ---------------- */
const newT = await as(null);
await newT.goto(link.trim(), { waitUntil: "networkidle", timeout: 60_000 });
await newT.locator("#invite-name").fill(`Liza Ramos ${stamp}`);
await newT.locator("#invite-password").fill("liza-password-1");
await newT.getByRole("button", { name: "Create my account" }).click();
await newT.waitForSelector("text=Account created", { timeout: 20_000 }).catch(() => {});
check((await text(newT)).includes("Account created"), "teacher sets a password from the link");

/* ---------------- registrar: schedule + adviser ---------------- */
await go(reg, `/schedule?section=${rizalId}`);
check((await text(reg)).includes("Grade 8 Rizal"), "registrar opens the Grade 8 Rizal schedule");
await reg.locator('select[name="adviserUserId"]').selectOption({ label: `Liza Ramos ${stamp}` });
await reg.getByRole("button", { name: "Save adviser" }).click();
await reg.waitForSelector("text=Adviser saved", { timeout: 20_000 }).catch(() => {});
check((await text(reg)).includes("Adviser saved"), "adviser saved");

const form = reg.locator("#class-form");
await form.locator('select[name="subjectId"]').selectOption({ index: 1 });
await form.locator('select[name="teacherUserId"]').selectOption({ label: `Liza Ramos ${stamp}` });
await form.locator('input[name="startsAt"]').fill("13:00");
await form.locator('input[name="endsAt"]').fill("14:00");
for (const d of ["1", "3", "5"]) await form.locator(`input[name="weekday"][value="${d}"]`).check();
await form.getByRole("button", { name: "Add class" }).click();
await reg.waitForSelector("text=added on 3 days", { timeout: 20_000 }).catch(() => {});
check((await text(reg)).includes("added on 3 days"), "one class added on Monday, Wednesday and Friday");

// The same teacher, another section, overlapping Wednesday: refused, with a reason.
await go(reg, "/schedule");
const seeded = await reg.locator('select[name="section"]').inputValue();
const form2 = reg.locator("#class-form");
await form2.locator('select[name="subjectId"]').selectOption({ index: 1 });
await form2.locator('select[name="teacherUserId"]').selectOption({ label: `Liza Ramos ${stamp}` });
await form2.locator('input[name="startsAt"]').fill("13:30");
await form2.locator('input[name="endsAt"]').fill("14:30");
await form2.locator('input[name="weekday"][value="3"]').check();
await form2.getByRole("button", { name: "Add class" }).click();
await reg.waitForSelector("text=Nothing was saved", { timeout: 20_000 }).catch(() => {});
const clashText = await text(reg);
check(
  clashText.includes("Nothing was saved") && clashText.includes(`Liza Ramos ${stamp} already teaches`),
  "a double-booked teacher is refused and the clash is named",
);
check(seeded !== rizalId, "the default section is the seeded one");

// Change a class: move Friday to 15:00.
await go(reg, `/schedule?section=${rizalId}`);
await reg.getByRole("link", { name: "Change" }).last().click();
await reg.waitForURL(/edit=/, { timeout: 20_000 });
await reg.locator('#class-form input[name="startsAt"]').fill("15:00");
await reg.locator('#class-form input[name="endsAt"]').fill("16:00");
await reg.getByRole("button", { name: "Save changes" }).click();
await reg.waitForSelector("text=changed", { timeout: 20_000 }).catch(() => {});
check((await text(reg)).includes("changed."), "a class can be moved");

/* ---------------- registrar: a student in Grade 8 Rizal ---------------- */
await go(reg, "/students");
await reg.locator('input[name="student_number"]').first().fill(`R-${stamp}`);
await reg.locator('input[name="first_name"]').first().fill("Miguel");
await reg.locator('input[name="last_name"]').first().fill(`Santos${stamp}`);
await reg.locator('select[name="sectionId"]').first().selectOption({ label: "Grade 8 Rizal" });
await reg.getByRole("button", { name: "Add student" }).click();
await reg.waitForSelector(`text=Miguel Santos${stamp} added`, { timeout: 20_000 }).catch(() => {});
check((await text(reg)).includes(`Miguel Santos${stamp} added`), "registrar places a student in Grade 8 Rizal");

/* ---------------- the teacher signs in ---------------- */
const t = await as(teacherEmail);
await go(t, "/schedule");
const week = await text(t);
check(week.includes("Your week") && week.includes("Monday") && week.includes("Grade 8 Rizal"), "teacher sees their week");
await go(t, "/classes");
check((await text(t)).includes("Grade 8 Rizal") && (await text(t)).includes("Your advisory"), "teacher sees their advisory class");
await t.getByRole("link", { name: /Grade 8 Rizal/ }).click();
await t.waitForURL(/\/classes\//, { timeout: 30_000 });
check((await text(t)).includes(`Santos${stamp}, Miguel`), "teacher sees the class list");

// Invite Miguel's mother.
const parentEmail = `ana.${stamp}@example.test`;
await t.locator("summary").first().click();
await t.locator('details[open] input[name="name"]').fill("Ana Santos");
await t.locator('details[open] input[name="email"]').fill(parentEmail);
await t.locator('details[open] input[name="phone"]').fill("09171234567");
await t.getByRole("button", { name: /Invite Miguel's parent/ }).click();
await t.waitForSelector("text=/join/", { timeout: 20_000 }).catch(() => {});
const joinLink = (await t.locator("span.font-mono").filter({ hasText: "/join/" }).first().innerText()).trim();
check(joinLink.includes("/join/"), "the invite link comes back to copy");
check(await t.getByRole("link", { name: "Text it" }).isVisible(), "a 'Text it' link is offered when a mobile number is given");

// Can the teacher reach a student who is not theirs? Seeded student in Sampaguita.
await go(t, "/schedule");

// Post to their own section.
await go(t, "/announcements");
await t.locator('input[name="title"]').fill(`Rizal field trip ${stamp}`);
await t.locator('select[name="sectionId"]').selectOption({ label: "Grade 8 Rizal" });
await t.locator('textarea[name="body"]').fill("Bring a packed lunch on Friday.");
await t.getByRole("button", { name: "Post it" }).click();
await t.waitForSelector("text=Posted", { timeout: 20_000 }).catch(() => {});
check((await text(t)).includes("Posted"), "teacher posts to their own section");
const options = await t.locator('select[name="sectionId"] option').allInnerTexts();
check(!options.some((o) => o.includes("whole school")), "a teacher is not offered the whole school");

/* ---------------- the parent joins ---------------- */
const par = await as(null, 390);
await par.goto(joinLink, { waitUntil: "networkidle", timeout: 60_000 });
check((await text(par)).includes("Follow Miguel"), "the parent's page names the child");
await par.locator('input[name="password"]').fill("ana-password-1");
await par.getByRole("button", { name: "Create my account" }).click();
await par.waitForURL(`${base}/`, { timeout: 30_000 }).catch(() => {});
await par.waitForLoadState("networkidle");
const home = await text(par);
if (process.env.DEBUG) console.log("PARENT URL", par.url(), "\n", home.slice(0, 1500));
check(home.includes(`Miguel Santos${stamp}`) && home.includes("Grade 8 Rizal"), "the parent lands on Today with Miguel's card");
check(home.includes(`Liza Ramos ${stamp}`), "…which names the adviser");

await par.getByRole("link", { name: /Open Miguel's record/ }).click();
await par.waitForURL(/\/child\//, { timeout: 30_000 });
const child = await text(par);
check(child.includes("Class schedule") && child.includes("Monday"), "the child page shows the week");
check(child.includes(`Rizal field trip ${stamp}`), "…and the class announcement");

// The announcement for another class is not there.
await go(reg, "/announcements");
// (registrar cannot post; the admin posts to the seeded section)
const adm = await as("admin@stmary.databridgesol.space");
await go(adm, "/announcements");
await adm.locator('input[name="title"]').fill(`Sampaguita only ${stamp}`);
await adm.locator('select[name="sectionId"]').selectOption({ label: "Grade 7 Sampaguita" });
await adm.locator('textarea[name="body"]').fill("For Grade 7 Sampaguita.");
await adm.getByRole("button", { name: "Post it" }).click();
await adm.waitForSelector("text=Posted", { timeout: 20_000 }).catch(() => {});
await go(par, "/announcements");
const news = await text(par);
check(news.includes(`Rizal field trip ${stamp}`) && !news.includes(`Sampaguita only ${stamp}`), "a parent sees their child's class news and not another class's");

/* ---------------- a second child, same account ---------------- */
// The seeded teacher invites Ana for a Sampaguita student.
const seededT = await as("teacher@stmary.databridgesol.space");
await go(seededT, "/classes");
await seededT.getByRole("link", { name: /Grade 7 Sampaguita/ }).click();
await seededT.waitForURL(/\/classes\//, { timeout: 30_000 });
await seededT.locator("summary").first().click();
await seededT.locator('details[open] input[name="name"]').fill("Ana Santos");
await seededT.locator('details[open] input[name="email"]').fill(parentEmail);
await seededT.locator("details[open]").getByRole("button", { name: /parent$/ }).click();
await seededT.waitForSelector("text=/join/", { timeout: 20_000 }).catch(() => {});
const join2 = (await seededT.locator("span.font-mono").filter({ hasText: "/join/" }).first().innerText()).trim();

const stranger = await as(null, 390);
await stranger.goto(join2, { waitUntil: "networkidle", timeout: 60_000 });
check((await text(stranger)).includes("You already have an account"), "the second invite knows the account exists");
await stranger.locator('input[name="password"]').fill("somebody-elses-guess");
await stranger.getByRole("button", { name: "Sign in and add my child" }).click();
await stranger.waitForSelector("text=does not match", { timeout: 20_000 }).catch(() => {});
check((await text(stranger)).includes("does not match"), "the link alone does not get into the account");
await stranger.locator('input[name="password"]').fill("ana-password-1");
await stranger.getByRole("button", { name: "Sign in and add my child" }).click();
await stranger.waitForURL(`${base}/`, { timeout: 30_000 }).catch(() => {});
await stranger.waitForLoadState("networkidle");
const both = await text(stranger);
check(both.includes(`Miguel Santos${stamp}`) && both.includes("Grade 7 Sampaguita"), "both children are on one Today page");
await go(stranger, "/me");
check((await text(stranger)).includes("2 linked to this account"), "My children lists both");

/* ---------------- sign-up by code cannot take over an account ---------------- */
const code = sh(`npx tsx scripts/e2e-helper.ts parent-code ST-2026-0002`);
const thief = await as(null, 390);
await go(thief, "/signup");
await thief.locator('input[name="studentNumber"]').last().fill("ST-2026-0002");
await thief.locator('input[name="code"]').last().fill(code);
await thief.locator('input[name="name"]').last().fill("Not Ana");
await thief.locator('input[name="email"]').last().fill(parentEmail);
await thief.locator('input[name="password"]').last().fill("not-anas-password");
await thief.locator("form").last().getByRole("button").click();
await thief.waitForSelector("text=already exists", { timeout: 20_000 }).catch(() => {});
check((await text(thief)).includes("already exists"), "parent sign-up with someone else's email is refused without their password");

/* ---------------- the phone menu reaches everything ---------------- */
const phone = await as("admin@stmary.databridgesol.space", 390);
await go(phone, "/");
await phone.getByRole("button", { name: "More" }).click();
const more = phone.locator("#more-menu");
check(await more.isVisible(), "More opens on a phone");
for (const label of ["People", "Setup", "Teachers", "Schedule", "Audit log"])
  check(await more.getByRole("link", { name: label }).isVisible(), `More lists ${label}`);
await more.getByRole("link", { name: "Teachers" }).click();
await phone.waitForURL(/\/teachers/, { timeout: 30_000 });
check(!(await phone.locator("#more-menu").isVisible().catch(() => false)), "the menu closes after choosing");
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
check(!overflow, "no sideways scroll on Teachers at 390px");

/* ---------------- a teacher who leaves ---------------- */
await go(reg, "/teachers");
const row = reg.locator("tr", { hasText: `Liza Ramos ${stamp}` });
await row.getByRole("button", { name: "Turn off" }).click();
await reg.waitForLoadState("networkidle");
await go(t, "/schedule");
check(t.url().includes("/login"), "a turned-off teacher is signed out at once");

await b.close();
console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
