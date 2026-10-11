import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/** Runs axe-core inside the real browser, including color contrast, which jsdom cannot evaluate. */
export async function axeViolations(page: Page, include?: string) {
  await page.addScriptTag({ content: readFileSync(require.resolve("axe-core/axe.min.js"), "utf8") });
  return page.evaluate(async (selector) => {
    // @ts-expect-error axe is injected above
    const res = await window.axe.run(selector ?? document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
    return res.violations.map((v: { id: string; impact: string; nodes: { target: string[] }[] }) => ({ id: v.id, impact: v.impact, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
  }, include);
}
