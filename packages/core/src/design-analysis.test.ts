// A View Design's Analysis Recipe at work (spec 0024, #151): the recipe gets the series the widget shows of its own
// Metrics, in Slot order and by the widget's Display Period, and nothing else; its numbers are written by the core.
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "./built-in-designs";
import { BUILT_IN_RECIPES } from "./built-in-recipes";
import { designRecipe, formatOutput, recipeInputs } from "./design-analysis";
import { designWithRecipe } from "./design-files";
import { shownSeries } from "./display-periods";
import { movingAverage, share } from "./recipe-functions";
import { sampleCanvasData } from "./sample-data";
import { checkViewDesignValue } from "./view-design";

const data = { ...sampleCanvasData("v", "1,234.5"), today: "2026-06-20" };
const [revenue, orders, customers] = data.metrics;
const points = (m: typeof revenue, display?: "quarter") => shownSeries(m, data, display, {}).points.map((p) => ({ period: p.period, value: p.value }));

describe("designRecipe", () => {
  const design = designWithRecipe(BUILT_IN_RECIPES["moving-average"]);

  it("works on the series the widget shows, by its Display Period where the design offers Show by", () => {
    expect(designRecipe(design, [revenue], data, {})?.avg).toEqual(movingAverage(points(revenue), 3));
    expect(designRecipe(design, [revenue], data, { display: "quarter" })?.avg).toEqual(movingAverage(points(revenue, "quarter"), 3));
    // A Snapshot's deck counts to date as of its own day, as the widget draws it.
    expect(recipeInputs(design, [revenue], data, { asOf: "2026-03-31" })[0]).toEqual(shownSeries(revenue, data, undefined, { today: "2026-04-01" }).points.map((p) => ({ period: p.period, value: p.value })));
  });

  it("reaches only the widget's own Metrics, in Slot order: never another Metric of the page", () => {
    const two = designWithRecipe(BUILT_IN_RECIPES.share);
    expect(designRecipe(two, [orders, customers], data, {})?.share).toEqual(share(points(orders), points(customers)));
    // With the second Slot empty, the recipe gets an empty series, though the page has other Metrics.
    expect(recipeInputs(two, [orders], data, {})).toEqual([points(orders), []]);
    expect(designRecipe(BUILT_IN_DESIGNS.line, [revenue], data, {})).toBeNull();
  });

  it("writes outputs in the Metric's unit, as a percentage, or as a plain number", () => {
    expect(formatOutput("metric", revenue, 1234.5, "1.234,5")).toBe("1.235 €");
    expect(formatOutput("percent", revenue, 12.345, "1,234.5")).toBe("12.3 %");
    expect(formatOutput("number", revenue, -0.5, "1,234.5")).toBe("-0.50");
  });
});

describe("designWithRecipe", () => {
  it.each(Object.keys(BUILT_IN_RECIPES) as (keyof typeof BUILT_IN_RECIPES)[])("draws the built-in recipe %s with a design that passes the checks", (id) => {
    const d = designWithRecipe(BUILT_IN_RECIPES[id]);
    const res = checkViewDesignValue(d);
    expect(res.ok ? [] : res.problems).toEqual([]);
  });
});
