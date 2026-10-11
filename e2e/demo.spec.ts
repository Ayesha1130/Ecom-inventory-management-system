import { expect, test } from "@playwright/test";

// Needs a Supabase project with migrations + seed applied and anonymous sign-ins enabled (see docs/testing.md).
test.skip(!process.env.E2E_BACKEND, "set E2E_BACKEND=1 against a seeded project");

test.describe("read-only demo session", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: "Enter the demo" }).click();
    await expect(page).toHaveURL(/\/o\/alder-finch-demo/);
  });

  test("shows seeded data and says it is a read-only demo", async ({ page }) => {
    await expect(page.getByRole("status").filter({ hasText: /read-only demo/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("Revenue", { exact: true })).toBeVisible();
  });

  test("offers no way to change anything", async ({ page }) => {
    for (const [path, absent] of [["/products", "Add product"], ["/suppliers", "Add a supplier"], ["/inventory", "Add a warehouse"]] as const) {
      await page.goto(`/o/alder-finch-demo${path}`);
      await expect(page.getByText(absent)).toHaveCount(0);
    }
    await page.goto("/o/alder-finch-demo/settings/team");
    await expect(page.getByText(/read-only demo/i).first()).toBeVisible();
  });

  test("the guided tour walks through the product", async ({ page }) => {
    await page.getByRole("button", { name: /take the 2-minute tour/i }).click();
    await expect(page.getByText(/step 1 of 5/i)).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText(/step 2 of 5/i)).toBeVisible();
  });

  test("cannot reach other tenants' data by guessing a slug", async ({ page }) => {
    const res = await page.goto("/o/some-other-company");
    expect(res?.status()).toBe(404);
  });
});
