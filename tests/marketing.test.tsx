// @vitest-environment jsdom
import axe from "axe-core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { Faq } from "@/components/marketing/Faq";
import { Pricing, priceFor } from "@/components/marketing/Pricing";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
afterEach(cleanup);

describe("pricing", () => {
  it("computes annual prices with the 20% discount", () => {
    expect(priceFor(29, "monthly")).toBe(29);
    expect(priceFor(29, "annual")).toBe(23.2);
    expect(priceFor(99, "annual")).toBe(79.2);
    expect(priceFor(0, "annual")).toBe(0);
  });

  it("switches billing period, exposes state to assistive tech, and says the prices are illustrative", async () => {
    const user = userEvent.setup();
    render(<Pricing />);
    expect(screen.getByRole("note").textContent).toMatch(/nothing to buy/i);
    const monthly = screen.getByRole("button", { name: /monthly/i });
    const annual = screen.getByRole("button", { name: /annual/i });
    expect(monthly.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("29 dollars per month")).toBeTruthy();

    await user.click(annual);
    expect(annual.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("23.2 dollars per month")).toBeTruthy();
    expect(screen.getByLabelText("79.2 dollars per month")).toBeTruthy();
    expect(screen.getAllByText(/billed annually/i)).toHaveLength(2); // the free plan has nothing to bill

    await user.keyboard("{Tab}");
    await user.click(monthly);
    expect(screen.getByLabelText("29 dollars per month")).toBeTruthy();
  });
});

describe("faq", () => {
  it("uses native disclosure widgets, so it works with the keyboard and without JavaScript", async () => {
    const user = userEvent.setup();
    const { container } = render(<Faq />);
    const items = container.querySelectorAll("details");
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect([...items].every((d) => !d.open)).toBe(true);
    const first = within(items[0] as HTMLElement).getByText(/real product/i);
    await user.click(first);
    expect((items[0] as HTMLDetailsElement).open).toBe(true);
  });

  it("answers honestly about what is simulated", () => {
    render(<Faq />);
    expect(screen.getByText(/portfolio project/i)).toBeTruthy();
    expect(screen.getByText(/test mode/i)).toBeTruthy();
  });
});

describe("accessibility harness", () => {
  it("really detects violations (canary: a test that can't fail proves nothing)", async () => {
    document.body.innerHTML = '<main><img src="x.png"><button></button><input type="text"></main>';
    document.documentElement.lang = "en";
    const res = await axe.run(document.body, { rules: { region: { enabled: false } } });
    expect(res.violations.map((v) => v.id)).toEqual(expect.arrayContaining(["image-alt", "button-name", "label"]));
  });
});

describe("homepage integrity and accessibility", () => {
  const html = renderToStaticMarkup(<HomePage />);

  it("makes no fabricated social proof", () => {
    const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
    for (const banned of ["testimonial", "trusted by", "customers love", "★", "10,000+", "as seen"]) expect(text).not.toContain(banned);
    expect(text).toContain("simulated");
  });

  it("has every section the nav and footer link to", () => {
    for (const id of ["catalog", "inventory", "orders", "storefront", "analytics", "alerts", "how-it-works", "pricing", "faq"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("has exactly one h1, ordered headings, and one banner/main/contentinfo landmark each", () => {
    document.body.innerHTML = html;
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelectorAll("main")).toHaveLength(1);
    expect(document.querySelectorAll("footer")).toHaveLength(1);
    const levels = [...document.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName[1]));
    levels.forEach((l, i) => { if (i > 0) expect(l - levels[i - 1]!).toBeLessThanOrEqual(1); });
  });

  it("passes automated accessibility checks (axe, excluding color contrast which jsdom can't compute)", async () => {
    document.body.innerHTML = html;
    document.documentElement.lang = "en";
    document.title = "Nexora";
    const res = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
  });
});
