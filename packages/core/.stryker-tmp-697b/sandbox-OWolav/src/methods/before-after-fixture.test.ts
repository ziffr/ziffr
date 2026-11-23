// @ts-nocheck
// The outside fixture of before and after, the change point and Student's t curve (spec 0041, ticket 7) and the limits they
// declare: the fixture was made by the script as it is now, names its tools, and the minimums and checks of each Method are the
// ones written in the spec, one step either side.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APPLIES, minimumPeriods, SUITABILITY } from "../suitability";
import { afterDateTakeaway } from "./before-after";
import { changePointTakeaway } from "./change-point";
import { series } from "../test/reference/methods-fixture";

const here = (name: string) => new URL(`../test/reference/fixtures/${name}`, import.meta.url);
const fixture = JSON.parse(readFileSync(here("before-after.json"), "utf8"));
const script = readFileSync(here("before-after.py"));

describe("the SciPy and NumPy fixture of before and after, the change point and the t curve", () => {
  it("was made by the current script (before-after.py), and names the tools", () => {
    expect(fixture.script, "run python3 packages/core/src/test/reference/fixtures/before-after.py again").toBe(createHash("sha256").update(script).digest("hex"));
    expect(fixture.version).toBe(1);
    expect(Object.keys(fixture.tools).sort()).toEqual(["numpy", "scipy"]);
  });
});

describe("the limits of before and after and the change point", () => {
  it("are the minimums the spec gives: 6 periods before the date, and for a change point 4 either side of the date (8)", () => {
    expect(minimumPeriods("afterDate")).toBe(6);
    expect(minimumPeriods("changePoint")).toBe(8);
    expect(SUITABILITY.shift.segment).toBe(4);
  });
  it("run the checks the spec's table gives them: before and after the periods, variation and gaps; a change point those and far-off values", () => {
    expect(APPLIES.afterDate).toEqual(["periods", "vary", "gaps"]);
    expect(APPLIES.changePoint).toEqual(["periods", "vary", "gaps", "far-off"]);
  });
});

describe("which Takeaways carry the footer", () => {
  const ctx = { style: "1,234.5" } as const;
  const unit = { unit: "€", unit_position: "after", decimals: 0 } as const;
  const wavy = (n: number) => Array.from({ length: n }, (_, i) => 100 + 3 * i + ((i * 37) % 11) - 5 + (i >= 12 ? 40 : 0));
  it("belongs to before and after (it compares with where the earlier trend pointed) and to the change point (it says when, not what made the change), each with a line of its own", () => {
    expect(afterDateTakeaway("A", series(wavy(24)), "month", "2025-01-01", unit, ctx).footer).toBe("This compares what happened with where the earlier trend pointed; it does not show what made the difference.");
    expect(changePointTakeaway("A", series(wavy(24)), "month", unit, ctx).footer).toBe("This shows when the numbers changed, not what made them change.");
  });
});
