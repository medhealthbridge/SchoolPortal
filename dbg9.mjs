import { chromium } from "playwright";
import { execSync } from "node:child_process";
const admin = execSync("npx tsx scripts/make-session.ts stmary admin@stmary.example").toString().trim();
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [url, w] of [["http://stmary.lvh.me:3000/modules", 390], ["http://stmary.lvh.me:3000/setup", 320]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  await ctx.addCookies([{ name: "sp_session", value: admin, domain: "stmary.lvh.me", path: "/" }]);
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  console.log("\n==", url, w);
  console.log(await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const fits = () => document.documentElement.scrollWidth <= vw + 1;
    const path = [];
    let el = document.body;
    outer: while (true) {
      for (const child of [...el.children]) {
        const prev = child.style.display;
        child.style.display = "none";
        const ok = fits();
        child.style.display = prev;
        if (ok) { path.push(child.tagName + "." + (child.className?.toString?.() ?? "").slice(0, 70)); el = child; continue outer; }
      }
      break;
    }
    return path.slice(-4);
  }));
  await ctx.close();
}
await b.close();
