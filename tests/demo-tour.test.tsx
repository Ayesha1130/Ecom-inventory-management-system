// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DemoTour, tourSteps } from "@/components/app/DemoTour";

beforeAll(() => {
  // jsdom doesn't implement <dialog> modality; emulate just enough for the component
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("demo tour", () => {
  it("opens by itself on the first visit only", () => {
    render(<DemoTour slug="alder-finch-demo" storeSlug="alder-finch" />);
    expect(screen.getByText(/step 1 of 5/i)).toBeTruthy();
    cleanup();
    localStorage.setItem("nexora-tour-v1", "1");
    render(<DemoTour slug="alder-finch-demo" storeSlug="alder-finch" />);
    expect(screen.queryByText(/step 1 of 5/i)).toBeNull();
  });

  it("steps forwards and back, links to the right pages, and remembers completion", async () => {
    const user = userEvent.setup();
    render(<DemoTour slug="alder-finch-demo" storeSlug="alder-finch" />);
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/step 2 of 5/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /see the orders/i }).getAttribute("href")).toBe("/o/alder-finch-demo/orders");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText(/step 1 of 5/i)).toBeTruthy();
    for (let n = 0; n < 4; n++) await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/step 5 of 5/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(localStorage.getItem("nexora-tour-v1")).toBe("1");
  });

  it("can be reopened from the banner and starts again from step 1", async () => {
    localStorage.setItem("nexora-tour-v1", "1");
    const user = userEvent.setup();
    render(<DemoTour slug="d" storeSlug="s" />);
    await user.click(screen.getByRole("button", { name: /take the 2-minute tour/i }));
    expect(screen.getByText(/step 1 of 5/i)).toBeTruthy();
  });

  it("points the storefront step at the demo store, not the admin", () => {
    expect(tourSteps("org", "shop").find((s) => s.title.includes("storefront"))?.href).toBe("/s/shop");
    expect(tourSteps("org", "shop").every((s) => s.href.startsWith("/o/org") || s.href === "/s/shop")).toBe(true);
  });
});
