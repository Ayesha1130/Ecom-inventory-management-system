/**
 * Captures README screenshots into docs/screenshots. Run against a built app (and, for the app shots, a seeded
 * backend):  npm run build && npx next start -p 3100 & npm run screenshots
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.SHOT_BASE ?? "http://localhost:3100";
const out = "docs/screenshots";

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(base);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/home-hero.png` });
  await page.locator("#pricing").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/home-pricing.png` });

  if (process.env.E2E_BACKEND) {
    await page.goto(`${base}/demo`);
    await page.getByRole("button", { name: "Enter the demo" }).click();
    await page.waitForURL(/\/o\/alder-finch-demo/);
    await page.keyboard.press("Escape"); // close the tour
    await page.screenshot({ path: `${out}/dashboard.png` });
    for (const [name, path] of [["orders", "/orders"], ["inventory", "/inventory"], ["analytics", "/analytics"]] as const) {
      await page.goto(`${base}/o/alder-finch-demo${path}`);
      await page.screenshot({ path: `${out}/${name}.png` });
    }
    await page.goto(`${base}/s/alder-finch`);
    await page.screenshot({ path: `${out}/storefront.png` });
  }
  await browser.close();
}
void main();
