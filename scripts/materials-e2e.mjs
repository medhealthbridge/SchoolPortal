/**
 * Learning materials, password reset and school creation in a real browser,
 * against the seeded St. Mary on a local dev server (files go to disk).
 *
 *   npm run db:seed && npm run dev
 *   node scripts/materials-e2e.mjs
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { strToU8, zipSync, unzipSync } from "fflate";

const CH = process.env.CHROME_PATH;
const b = await chromium.launch(CH ? { executablePath: CH } : {});
const host = "stmary.lvh.me";
const base = `http://${host}:3000`;
const stamp = Date.now().toString(36).slice(-5);
const mint = (email) => execSync(`npx tsx scripts/make-session.ts stmary ${email}`).toString().trim();
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};
const text = (p) => p.locator("body").innerText();
async function as(email, width = 1280) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  if (email) await ctx.addCookies([{ name: "sp_session", value: mint(email), domain: host, path: "/" }]);
  return ctx.newPage();
}
const go = (p, path) => p.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 90_000 });

/* ---------- a real, heavy slide deck: one 4000×3000 photo-like JPEG ---------- */
const maker = await as(null);
await maker.goto("about:blank");
const jpegB64 = await maker.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = 4000;
  c.height = 3000;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(4000, 3000);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = v;
    img.data[i + 1] = (v * 7) & 255;
    img.data[i + 2] = (v * 13) & 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.95).split(",")[1];
});
const photo = Buffer.from(jpegB64, "base64");
const deck = zipSync(
  {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="jpeg" ContentType="image/jpeg"/></Types>',
    ),
    "ppt/presentation.xml": strToU8("<p:presentation/>"),
    "ppt/media/image1.jpeg": new Uint8Array(photo),
  },
  { level: 0 },
);
const deckPath = `/tmp/claude-0/fractions-${stamp}.pptx`;
writeFileSync(deckPath, deck);
console.log(`(test deck: ${(deck.length / 1024 / 1024).toFixed(1)} MB)`);

/* ---------- the teacher shares it ---------- */
const t = await as("teacher@stmary.databridgesol.space");
await go(t, "/materials");
check((await text(t)).includes("Share a module"), "teacher sees Share a module");
await t.locator('input[name="title"]').fill(`Q1 Module 3: Fractions ${stamp}`);
await t.locator('textarea[name="description"]').fill("Read slides 1 to 10 before Friday.");
await t.setInputFiles('input[type="file"]', deckPath);
await t.getByRole("button", { name: "Share with the class" }).click();
await t.waitForSelector("text=is shared with the class", { timeout: 90_000 }).catch(() => {});
const shared = await text(t);
check(shared.includes("is shared with the class"), "the module is shared");
check(/Made smaller: [\d.]+ MB → [\d.]+ (MB|KB)/.test(shared), "the deck was made smaller before upload");
check(shared.includes(`Q1 Module 3: Fractions ${stamp}`), "it is listed");

/* ---------- a parent opens it ---------- */
const par = await as("parent@stmary.databridgesol.space", 390);
await go(par, "/materials");
check((await text(par)).includes(`Q1 Module 3: Fractions ${stamp}`), "the parent sees the module");
const [dl] = await Promise.all([
  par.waitForEvent("download"),
  par.locator("li", { hasText: `Fractions ${stamp}` }).getByRole("link", { name: "Download" }).click(),
]);
const saved = `/tmp/claude-0/got-${stamp}.pptx`;
await dl.saveAs(saved);
const files = unzipSync(new Uint8Array(execSync(`cat ${saved}`)));
check(Boolean(files["ppt/presentation.xml"]) && Boolean(files["ppt/media/image1.jpeg"]), "the downloaded deck is a whole presentation");
check(files["ppt/media/image1.jpeg"].length < photo.length / 2, "its photo is less than half its old size");
check(!(await par.getByRole("button", { name: "Share with the class" }).isVisible().catch(() => false)), "a parent cannot share");
const overflow = await par.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
check(!overflow, "no sideways scroll at 390px");

/* ---------- someone outside the class cannot open it ---------- */
const id = (await par.locator("li", { hasText: `Fractions ${stamp}` }).getByRole("link", { name: "Download" }).getAttribute("href")).split("/").pop();
const outsider = await (await b.newContext()).newPage();
const anon = await outsider.request.get(`${base}/materials/open/${id}`);
check(anon.status() === 401, "signed out: refused");

/* ---------- the teacher takes it down ---------- */
await t.locator("li", { hasText: `Fractions ${stamp}` }).getByRole("button", { name: /Remove/ }).click();
await t.waitForTimeout(1500);
await go(t, "/materials");
check(!(await text(t)).includes(`Fractions ${stamp}`), "the teacher can remove it");

/* ---------- password reset: the office makes a link ---------- */
const reg = await as("registrar@stmary.databridgesol.space");
await go(reg, "/students?q=ST-2026-0001");
await reg.locator("tbody a").first().click();
await reg.waitForURL(/\/students\//, { timeout: 30_000 });
const parentRow = reg.locator("li", { hasText: "parent@stmary.databridgesol.space" });
await parentRow.getByRole("button", { name: /Reset/ }).click();
await reg.waitForSelector("text=/reset/", { timeout: 20_000 }).catch(() => {});
const link = (await reg.locator("span.font-mono").filter({ hasText: "/reset/" }).first().innerText()).trim();
check(link.includes("/reset/"), "the registrar gets a reset link for a parent");

const who = await as(null, 390);
await who.goto(link, { waitUntil: "networkidle", timeout: 60_000 });
await who.locator("#password").fill(`newpass-${stamp}`);
await who.locator("#confirm").fill(`newpass-${stamp}`);
await who.getByRole("button", { name: "Set new password" }).click();
await who.waitForURL(/\/login\?reset=1/, { timeout: 30_000 }).catch(() => {});
check((await text(who)).includes("Password changed"), "the parent sets a new password and is told so");
await who.locator("#identifier").fill("parent@stmary.databridgesol.space");
await who.locator("#password").fill(`newpass-${stamp}`);
await who.getByRole("button", { name: "Sign in" }).click();
await who.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }).catch(() => {});
check(!who.url().includes("/login"), "…and signs in with it");
await who.goto(link, { waitUntil: "networkidle" });
check((await text(who)).includes("cannot be used"), "the link works only once");

// The parent's old session (from before the reset) is gone.
await go(par, "/materials");
check(par.url().includes("/login"), "devices signed in with the old password are signed out");

/* ---------- forgot password never says who has an account ---------- */
const anonP = await as(null, 390);
await go(anonP, "/forgot");
await anonP.locator("#identifier").fill("nobody@nowhere.test");
await anonP.getByRole("button", { name: "Send me a link" }).click();
await anonP.waitForSelector("text=If an account here uses that", { timeout: 20_000 }).catch(() => {});
const a1 = await text(anonP);
await go(anonP, "/forgot");
await anonP.locator("#identifier").fill("teacher@stmary.databridgesol.space");
await anonP.getByRole("button", { name: "Send me a link" }).click();
await anonP.waitForSelector("text=If an account here uses that", { timeout: 20_000 }).catch(() => {});
const a2 = await text(anonP);
check(a1.includes("If an account here uses that") && a2.includes("If an account here uses that"), "the same answer for a real and a made-up account");
await go(anonP, "/login");
check(await anonP.getByRole("link", { name: "Forgot your password?" }).isVisible(), "sign-in page links to Forgot");

/* ---------- the platform adds a school ---------- */
const adminSid = execSync("npx tsx scripts/make-admin-session.ts").toString().trim();
const actx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await actx.addCookies([{ name: "sp_admin", value: adminSid, domain: "admin.lvh.me", path: "/" }]);
const adm = await actx.newPage();
await adm.goto("http://admin.lvh.me:3000/", { waitUntil: "networkidle", timeout: 90_000 });
await adm.locator('input[name="name"]').fill(`San Isidro Academy ${stamp}`);
const addr = await adm.locator('input[name="subdomain"]').inputValue();
check(addr === `san-isidro-academy-${stamp}`, `the address follows the name (${addr})`);
await adm.locator('input[name="ownerName"]').fill("Rosa Cruz");
await adm.locator('input[name="ownerEmail"]').fill(`rosa.${stamp}@example.test`);
await adm.getByRole("button", { name: "Create school" }).click();
await adm.waitForSelector("text=is ready on a 30-day trial", { timeout: 30_000 }).catch(() => {});
check((await text(adm)).includes("is ready on a 30-day trial"), "the platform creates a school");
const setLink = (await adm.locator("span.font-mono").filter({ hasText: "/reset/" }).first().innerText()).trim();
const owner = await as(null, 390);
await owner.goto(setLink, { waitUntil: "networkidle", timeout: 60_000 });
await owner.locator("#password").fill(`owner-${stamp}-pw`);
await owner.locator("#confirm").fill(`owner-${stamp}-pw`);
await owner.getByRole("button", { name: "Set new password" }).click();
await owner.waitForURL(/\/login\?reset=1/, { timeout: 30_000 }).catch(() => {});
await owner.locator("#identifier").fill(`rosa.${stamp}@example.test`);
await owner.locator("#password").fill(`owner-${stamp}-pw`);
await owner.getByRole("button", { name: "Sign in" }).click();
await owner.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }).catch(() => {});
check(owner.url().includes(`san-isidro-academy-${stamp}`) && !owner.url().includes("/login"), "the new owner sets a password and signs in to their school");

await b.close();
console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
