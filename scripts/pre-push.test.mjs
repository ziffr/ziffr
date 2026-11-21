// The pre-push hook's grouping of changed files by package (#578).
import assert from "node:assert/strict";
import { test } from "node:test";
import { groupByPackage, packageOf } from "./pre-push.mjs";

test("a file belongs to the app or package it lives in", () => {
  assert.equal(packageOf("packages/core/src/a.ts"), "packages/core");
  assert.equal(packageOf("apps/web/src/app/page.tsx"), "apps/web");
  assert.equal(packageOf("docs/guides/x.md"), null);
  assert.equal(packageOf("package.json"), null);
});

test("changed files are grouped by package with package-relative paths", () => {
  assert.deepEqual(groupByPackage(["packages/core/src/a.ts", "packages/core/b.ts", "apps/web/x.tsx", "README.md"]), {
    "packages/core": ["src/a.ts", "b.ts"],
    "apps/web": ["x.tsx"],
  });
  assert.deepEqual(groupByPackage([]), {});
});
