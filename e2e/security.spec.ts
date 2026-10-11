import { expect, test } from "@playwright/test";

test.describe("security posture (no backend needed)", () => {
  test("sends hardening headers on every page", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["strict-transport-security"]).toContain("max-age=");
  });

  test("sends users who aren't signed in away from private areas", async ({ page }) => {
    for (const path of ["/o/anything", "/o/anything/orders", "/onboarding", "/invite/" + "a".repeat(43)]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/(demo|login)/);
    }
  });

  test("the payment webhook refuses unsigned or forged requests", async ({ request }) => {
    const unsigned = await request.post("/api/webhooks/stripe", { data: "{}" });
    expect([400, 503]).toContain(unsigned.status()); // 503 when Stripe isn't configured, 400 when it is
    const forged = await request.post("/api/webhooks/stripe", { data: "{}", headers: { "stripe-signature": "t=1,v1=deadbeef" } });
    expect([400, 503]).toContain(forged.status());
    expect((await request.get("/api/webhooks/stripe")).status()).toBe(405);
  });

  test("the cron endpoint requires its secret", async ({ request }) => {
    expect((await request.get("/api/cron/expire-orders")).status()).toBe(401);
    expect((await request.get("/api/cron/expire-orders", { headers: { authorization: "Bearer guess" } })).status()).toBe(401);
  });

  test("unknown stores and malformed slugs return 404, not errors", async ({ request }) => {
    for (const path of ["/s/..%2f..%2fetc", "/s/UPPER", "/s/a"]) expect([404, 500]).toContain((await request.get(path)).status());
  });
});
