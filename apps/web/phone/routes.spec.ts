// The walk over the Phone-first pages as Sara, a person of the demo (spec 0055; GLOSSARY: Route Tier, Demo Mode): each page
// in walk.ts opens, shows what it should and keeps the phone rules. It only reads: nothing is sent or saved.
import { expect, test, type Page } from "@playwright/test";
import { allowancesFor } from "./allowed";
import { phoneProblems } from "./measure";
import { WALK, type Press, type Walk } from "./walk";

/** Waits for a quiet network where it comes; a page that keeps talking is measured once it stops changing. */
const settle = (page: Page) => page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

async function open(page: Page, address: string) {
  const response = await page.goto(address);
  expect(response?.status(), address).toBeLessThan(400);
  // A page that sends the walk elsewhere (sign-in, home) would otherwise pass for the one asked for.
  expect(new URL(page.url()).pathname, address).toBe(address.split("?")[0]);
  await settle(page);
}

async function press(page: Page, { role, name, to, missing }: Press) {
  const target = page.getByRole(role, { name }).filter({ visible: true }).first();
  if (missing && !process.env.CI) test.skip(!(await target.waitFor({ timeout: 5000 }).then(() => true, () => false)), missing);
  await target.click();
  if (to) await expect.poll(() => new URL(page.url()).pathname).toMatch(to);
  await settle(page);
}

/** The address of one of the page's links: the first by address, so every run takes the same one. */
async function linkOn(page: Page, link: RegExp) {
  const matches = async () => (await page.locator("a[href]").evaluateAll((all) => all.map((a) => (a as HTMLAnchorElement).pathname))).filter((p) => link.test(p)).sort();
  await expect.poll(async () => (await matches()).length, { message: `${page.url()} has a link like ${link}` }).toBeGreaterThan(0);
  return (await matches())[0];
}

/** Goes where the walk says and answers the path it got to. */
async function go(page: Page, walk: Exclude<Walk, { skip: string }>) {
  await open(page, walk.open);
  for (const step of walk.press ?? []) await press(page, step);
  if (walk.follow) await open(page, await linkOn(page, walk.follow));
  if (walk.then) await open(page, new URL(page.url()).pathname + walk.then);
  return new URL(page.url()).pathname;
}

for (const [route, walk] of Object.entries(WALK)) {
  // Listed as skipped, with the reason, so what is not walked stays in sight.
  if ("skip" in walk) {
    test.skip(route, { annotation: { type: "skip", description: walk.skip } }, () => undefined);
    continue;
  }
  test(route, async ({ page, context, baseURL }) => {
    if (!walk.signedOut) await context.addCookies(Object.entries({ "ziffr-demo": "1", "ziffr-viewer": "sara" }).map(([name, value]) => ({ name, value, url: baseURL! })));
    const path = await go(page, walk);
    // In the page's own part where the app frames it, so a word in the menu cannot stand in for the screen.
    const main = page.locator("#main");
    await expect((await main.count()) ? main : page.locator("body")).toContainText(walk.sees);
    expect(await phoneProblems(page, allowancesFor(route)), `${path} on a phone (rules: apps/web/phone/measure.ts)`).toEqual([]);
  });
}
