// That a card of the Metric Catalog opens its form in the production app (#1335; GLOSSARY: Metric Catalog). The walk
// opens pages by their address; this one taps, as a person does, because only a tap goes through the app's own
// navigation. The fault it watches for (patches/next@15.5.29.patch) shows in a built app, not on the development
// server, and not on every tap, so it taps several cards.
import { expect, test } from "@playwright/test";

/** How many cards are tapped, one after another, in one visit. */
const CARDS = 4;

test("tapping a Metric Catalog card opens its form", async ({ page, context, baseURL }) => {
  await context.addCookies(Object.entries({ "ziffr-demo": "1", "ziffr-viewer": "sara" }).map(([name, value]) => ({ name, value, url: baseURL! })));
  await page.goto("/metrics/new");
  const cards = page.locator('#main a[href*="/metrics/new?catalog="]');
  for (let nth = 0; nth < CARDS; nth++) {
    const card = cards.nth(nth);
    const name = (await card.locator("div").first().innerText()).trim();
    // The page is quiet before the tap, as when someone has looked for a card.
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    await card.tap();
    await expect(page.getByRole("heading", { level: 1, name: `New metric from “${name}”` })).toBeVisible();
    await page.locator("#main").getByRole("link", { name: "Catalog" }).tap();
    await expect(page.getByRole("heading", { level: 1, name: "New metric", exact: true })).toBeVisible();
  }
});
