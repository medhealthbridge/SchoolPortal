/**
 * Registers a school through the real wizard, with a logo, then checks that the
 * address followed the name, the logo is served, and the invite form suggests
 * the school's own role addresses.
 *
 *   STORAGE_DRIVER=database npm run dev   (so the logo goes to Postgres)
 *   node scripts/onboarding-e2e.mjs
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";

/** A new account meets the school's privacy notice first, as a real person would. */
async function agree(p) {
  if (!p.url().includes("/privacy")) return;
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "I agree, continue" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/privacy"), { timeout: 30_000 });
  await p.waitForLoadState("networkidle");
}
const CH = process.env.CHROME_PATH;
const b = await chromium.launch(CH ? { executablePath: CH } : {});
const root = "lvh.me:3000";
const stamp = Date.now().toString(36).slice(-5);
const name = `Santa Rosa's Academy ${stamp}`;
const slug = `santa-rosas-academy-${stamp}`;
const email = `owner-${stamp}@example.test`;
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};

const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
const p = await ctx.newPage();
await p.goto(`http://${root}/register`, { waitUntil: "networkidle", timeout: 90_000 });

await p.getByLabel("School name").fill(name);
await p.getByLabel("Owner name").fill("Rosa Reyes");
await p.getByLabel("Owner email").fill(email);
await p.getByLabel("Mobile number").fill("09171234567");
await p.getByLabel("Password").fill("a-long-password-1");
await p.getByRole("button", { name: "Send verification code" }).click();
await p.waitForSelector("text=your code is", { timeout: 20_000 });
const code = (await p.locator("text=your code is").innerText()).match(/is ([A-Z0-9]{6})/)[1];
await p.getByLabel("Verification code").fill(code);
await p.getByRole("button", { name: "Verify" }).click();
await p.waitForSelector("text=Email verified", { timeout: 20_000 });
await p.getByRole("button", { name: "Continue" }).click();

// The address follows the name.
const addr = p.getByLabel("Subdomain");
check((await addr.inputValue()) === slug, `address is made from the name (${await addr.inputValue()})`);
check((await p.locator("body").innerText()).includes(`teacher@${slug}.`), "the page shows the staff address it will produce");
await addr.fill(slug + "x");
await p.getByLabel("Subdomain").fill(slug);
await p.waitForSelector("text=Available.", { timeout: 20_000 });
await p.getByRole("button", { name: "Continue" }).click();

// Logo, then register.
await p.setInputFiles('input[type="file"]', "/tmp/claude-0/logo.png");
check(await p.locator('img[alt="Your logo"]').isVisible(), "the logo previews before it is saved");
await p.getByRole("button", { name: "Continue" }).click();
await p.getByRole("button", { name: "Create my school" }).click();
// The heading, exactly: the page's intro also says "your school is live", and
// waiting on loose text let this race ahead of the school being created.
const live = await p
  .getByRole("heading", { name: "Your school is live", exact: true })
  .waitFor({ timeout: 60_000 })
  .then(() => true, () => false);
check(live, "the school is created");
check(!/logo could not be saved|logo was not saved/i.test(await p.locator("body").innerText()), "the logo was accepted");

// The logo is in the database and is served.
const school = execSync(`npx tsx scripts/school-logo.ts ${slug}`).toString().trim().split("\n").pop();
check(school.startsWith("/uploads/schools/"), `the school's logo address is stored (${school})`);
const res = await ctx.request.get(`http://${slug}.${root}${school}`);
check(res.status() === 200 && (res.headers()["content-type"] ?? "") === "image/png", "the logo is served from the school's own address");

// Sign in as the owner and look at People.
const login = await ctx.newPage();
await login.goto(`http://${slug}.${root}/login`, { waitUntil: "networkidle", timeout: 60_000 });
check(await login.locator('img[src*="/uploads/schools/"]').first().isVisible().catch(() => false), "the sign-in page shows the logo");
await login.fill('input[name="identifier"]', email);
await login.fill('input[name="password"]', "a-long-password-1");
await login.getByRole("button", { name: /sign in/i }).click();
await login.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
await login.waitForLoadState("networkidle");
await agree(login);
await login.goto(`http://${slug}.${root}/people`, { waitUntil: "networkidle", timeout: 60_000 });
if (login.url().includes("/privacy")) {
  await agree(login);
  await login.goto(`http://${slug}.${root}/people`, { waitUntil: "networkidle", timeout: 60_000 });
}
const field = login.locator('input[name="email"]');
check((await field.inputValue()) === `teacher@${slug}.lvh.me`, `the invite suggests the school's address (${await field.inputValue()})`);
await login.selectOption('select[name="role"]', "registrar");
check((await field.inputValue()) === `registrar@${slug}.lvh.me`, "…and follows the role");
await field.fill("someone@their-own.example");
await login.selectOption('select[name="role"]', "chaplain");
check((await field.inputValue()) === "someone@their-own.example", "…until the person types their own");

await b.close();
console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
