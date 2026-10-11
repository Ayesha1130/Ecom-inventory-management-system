import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_BACKEND, "set E2E_BACKEND=1 against a seeded project");

test.describe("demo storefront", () => {
  test("browses, filters and opens a product", async ({ page }) => {
    await page.goto("/s/alder-finch");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Shop all" }).first().click();
    await page.getByLabel("Search").fill("tote");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("heading", { name: "Ridge Canvas Tote" })).toBeVisible();
    await page.getByRole("link", { name: /Ridge Canvas Tote/ }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Ridge Canvas Tote" })).toBeVisible();
  });

  test("selects options, adds to the cart and sees the right subtotal", async ({ page }) => {
    await page.goto("/s/alder-finch/p/ridge-canvas-tote");
    await page.getByRole("button", { name: "Ink" }).click();
    await page.getByRole("button", { name: "Increase quantity" }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByText("Added to your cart")).toBeVisible();
    await page.goto("/s/alder-finch/cart");
    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
    await expect(page.getByText("$128.00").first()).toBeVisible(); // 2 x $64.00
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
  });

  test("cannot add more than is available", async ({ page }) => {
    await page.goto("/s/alder-finch/p/ridge-canvas-tote");
    const plus = page.getByRole("button", { name: "Increase quantity" });
    for (let i = 0; i < 12; i++) if (await plus.isEnabled()) await plus.click();
    await expect(plus).toBeDisabled(); // the picker stops at the stock cap
  });

  test("order tracking never reveals whether an order exists", async ({ page }) => {
    await page.goto("/s/alder-finch/track?order=1&email=nobody%40example.com");
    await expect(page.getByRole("alert")).toContainText(/couldn't find an order/i);
  });

  test("storefront passes accessibility checks", async ({ page }) => {
    const { axeViolations } = await import("./axe");
    await page.goto("/s/alder-finch");
    expect(await axeViolations(page)).toEqual([]);
  });
});
