// The user guide describes every screen (docs/user-guide/README.md): runs with `pnpm test`, so a new page without a
// chapter, or a chapter naming files that are gone, fails like any other test.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { badNotScreens, chaptersToUpdate, globToRegExp, readChapters, screensOf, staleScreens, uncoveredPages } from "./guide-screens.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("path patterns", () => {
  assert.ok(globToRegExp("apps/web/src/app/metrics/**").test("apps/web/src/app/metrics/[slug]/page.tsx"));
  assert.ok(globToRegExp("apps/web/src/components/dashboard-*.tsx").test("apps/web/src/components/dashboard-view.tsx"));
  assert.ok(!globToRegExp("apps/web/src/components/dashboard-*.tsx").test("apps/web/src/components/x/dashboard-view.tsx"));
  assert.ok(!globToRegExp("apps/web/src/app/metrics/**").test("apps/web/src/app/metrics-actions.ts"));
});

test("a chapter's screens line", () => {
  assert.deepEqual(screensOf("<!-- part: x -->\n<!-- screens: a/**, b.tsx,\n  c/*.tsx -->\n# T"), ["a/**", "b.tsx", "c/*.tsx"]);
  assert.deepEqual(screensOf("# No screens"), []);
});

test("a changed screen asks for its chapter, unless the chapter changed too", () => {
  const chapters = [{ file: "docs/user-guide/10-metrics.md", screens: ["apps/web/src/app/metrics/**"] }];
  assert.deepEqual(chaptersToUpdate(["apps/web/src/app/metrics/page.tsx"], chapters),
    [{ chapter: "docs/user-guide/10-metrics.md", files: ["apps/web/src/app/metrics/page.tsx"] }]);
  assert.deepEqual(chaptersToUpdate(["apps/web/src/app/metrics/page.tsx", "docs/user-guide/10-metrics.md"], chapters), []);
  assert.deepEqual(chaptersToUpdate(["apps/web/src/app/metrics/page.test.tsx"], chapters), []);
});

test("every page of the app is described in the user guide", () => {
  const missing = uncoveredPages(root);
  assert.deepEqual(missing, [], `No chapter of docs/user-guide names these pages in its "<!-- screens: … -->" line:\n${missing.join("\n")}\nDescribe them in a chapter, or list them with a kind and reason in scripts/guide-not-screens.json.`);
});

test("the list of pages that are no screen is in order", () => {
  const bad = badNotScreens(root);
  assert.deepEqual(bad, [], `scripts/guide-not-screens.json:\n${bad.join("\n")}`);
});

test("every path a chapter names still exists", () => {
  const stale = staleScreens(root);
  assert.deepEqual(stale, [], `These paths in the guide's "<!-- screens: … -->" lines match no file:\n${stale.join("\n")}`);
});

test("chapters exist", () => {
  assert.ok(readChapters(root).some((c) => c.screens.length), "No chapter names any screens.");
});
