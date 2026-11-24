// The old first-run checklist ("Get your workspace ready") is gone, replaced by the Setup Guide (spec 0052, ticket 11):
// nothing may import it or bring its words back.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = join(__dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !n.endsWith("first-run-gone.test.ts") ? [p] : [];
  });
}

describe("the first-run checklist", () => {
  it("has no component left, and nothing imports it or says its words", () => {
    expect(existsSync(join(src, "components", "first-run.tsx"))).toBe(false);
    const bad = files(src).filter((f) => /first-run"|FirstRun\b|Get your workspace ready/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
