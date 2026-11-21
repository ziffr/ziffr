// Tests for the demo refill decision (#604). Run with `node --test docker/demo-seed.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentSeed, demoNeedsFilling, markerText } from "./demo-seed.mjs";

test("the current seed is the newest migration defining a seed function", () => {
  const dir = mkdtempSync(join(tmpdir(), "ziffr-seed-"));
  writeFileSync(join(dir, "1_a.sql"), "create function public.prototype_seed_themes() returns void as $$ $$;");
  writeFileSync(join(dir, "2_b.sql"), "create table x(id int);");
  writeFileSync(join(dir, "3_c.sql"), "create or replace function demo_reset(min_gap interval) returns void as $$ $$;");
  writeFileSync(join(dir, "4_d.sql"), "alter table x add column y int;");
  assert.equal(currentSeed(dir), "3_c.sql");
  rmSync(dir, { recursive: true });
  const empty = mkdtempSync(join(tmpdir(), "ziffr-seed-"));
  assert.equal(currentSeed(empty), "");
  rmSync(empty, { recursive: true });
});

test("fills when never filled, when the marker predates seeds, or when the seed changed", () => {
  assert.equal(demoNeedsFilling(null, "3_c.sql"), true);
  assert.equal(demoNeedsFilling("2026-11-01T00:00:00.000Z\n", "3_c.sql"), true);
  assert.equal(demoNeedsFilling(markerText("2_b.sql"), "3_c.sql"), true);
  assert.equal(demoNeedsFilling(markerText("3_c.sql"), "3_c.sql"), false);
});
