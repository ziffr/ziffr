// That the phone check can fail (spec 0055; GLOSSARY: Route Tier): made-up pages that break each rule, and one that
// breaks none. No app is needed. The pages clip sideways overflow as the app does, so a too-wide one cannot scroll.
import { expect, test, type Page } from "@playwright/test";
import { phoneProblems } from "./measure";

async function show(page: Page, body: string) {
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>html, body { overflow-x: clip; margin: 0 } body { font: 16px sans-serif } .big { display: inline-block; min-width: 44px; min-height: 44px }</style>
    </head><body>${body}</body></html>`);
}

test("a page that is too wide fails", async ({ page }) => {
  await show(page, `<main><table style="width: 600px"><tr><td>A table without a frame</td></tr></table></main>`);
  expect(await phoneProblems(page)).toEqual([expect.stringMatching(/^sideways: <table> .* ends at 600 px/)]);
});

test("words too long for the screen fail, though their box fits", async ({ page }) => {
  await show(page, `<p style="white-space: nowrap">${"unbroken".repeat(30)}</p>`);
  expect(await phoneProblems(page)).toEqual([expect.stringMatching(/^sideways: the page is \d+ px wide/)]);
});

test("a small thing to tap fails", async ({ page }) => {
  await show(page, `<button style="width: 20px; height: 20px; padding: 0">x</button> <div><a href="#a" style="display: block">A link on its own line</a></div>`);
  expect(await phoneProblems(page)).toEqual([expect.stringMatching(/^tap-target: <button> .* is 20 by 20 px/), expect.stringMatching(/^tap-target: <a> /)]);
});

test("a field with small text fails", async ({ page }) => {
  await show(page, `<input aria-label="Value" style="font-size: 14px; height: 44px">`);
  expect(await phoneProblems(page)).toEqual([expect.stringMatching(/^field-text: <input> "Value" .* has 14 px text/)]);
});

test("a named allowance lets one element off one rule only", async ({ page }) => {
  await show(page, `<input class="odd" aria-label="Odd" style="font-size: 14px; height: 20px">`);
  expect(await phoneProblems(page, [{ rule: "tap-target", selector: ".odd", reason: "A fixture." }])).toEqual([expect.stringMatching(/^field-text: /)]);
});

test("a page that keeps the rules passes", async ({ page }) => {
  await show(page, `
    <div style="overflow-x: auto"><table style="width: 600px"><tr><td>A wide table in its own frame</td></tr></table></div>
    <p>Words with <a href="#a">a link</a> inside them.</p>
    <button class="big">Save</button> <button disabled style="height: 20px">Off</button>
    <label class="big"><input type="checkbox"> Tell me</label>
    <input aria-label="Value" style="font-size: 16px; height: 44px">
    <a href="#skip" style="position: absolute; width: 1px; height: 1px; overflow: hidden">Skip</a>`);
  expect(await phoneProblems(page)).toEqual([]);
});
