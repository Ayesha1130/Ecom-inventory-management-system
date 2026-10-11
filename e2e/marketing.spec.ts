import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

test.describe("public marketing site", () => {
  test("explains the product and labels everything as simulated", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("One Platform. Every Order.");
    await expect(page.getByText(/portfolio demonstration product/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore Live Demo" }).first()).toHaveAttribute("href", "/demo");
    await expect(page.locator("body")).not.toContainText(/testimonial|trusted by/i);
  });

  test("navigation anchors reach their sections", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "the desktop nav is hidden on small screens");
    await page.goto("/");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/#pricing$/);
    await expect(page.locator("#pricing")).toBeInViewport();
  });

  test("pricing toggles to annual and the FAQ opens with the keyboard", async ({ page }) => {
    await page.goto("/#pricing");
    await expect(page.getByLabel("29 dollars per month")).toBeVisible();
    await page.getByRole("button", { name: /annual/i }).click();
    await expect(page.getByLabel("23.2 dollars per month")).toBeVisible();

    const first = page.locator("#faq summary").first();
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#faq details").first()).toHaveAttribute("open", "");
  });

  test("the 3D hero is skipped for reduced motion and small screens, with a static fallback", async ({ page, isMobile }, info) => {
    await page.goto("/");
    await page.waitForTimeout(800); // the scene is requested after an idle delay
    if (info.project.name === "reduced-motion" || isMobile) {
      await expect(page.locator("canvas")).toHaveCount(0);
      await expect(page.getByText("Demo data").first()).toBeVisible(); // the static dashboard mock
    }
  });

  test("has no WCAG A/AA violations, including color contrast", async ({ page }) => {
    await page.goto("/");
    expect(await axeViolations(page)).toEqual([]);
  });

  test("loads with no console errors or Content-Security-Policy violations", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
    await page.goto("/");
    await page.waitForTimeout(1500); // let the lazy 3D scene and hydration run
    // headless Chromium may lack WebGL; that is an environment limit, not a CSP or app error
    expect(problems.filter((p) => !/webgl|WebGL|GPU/.test(p))).toEqual([]);
  });

  test("has no horizontal scroll at any width", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
