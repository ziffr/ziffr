// A /2 Analysis Recipe in a View Design and in a Pack (spec 0041, ticket 8; GLOSSARY: Analysis Recipe, View Design, Pack):
// marks draw the series and values it gives, a table or a Takeaway is named as not drawn yet, the design's checks name a
// recipe's mistakes as they do for /1, and a Pack that holds a /2 recipe checks and installs as a design that draws it.
import { describe, expect, it } from "vitest";
import type { AnalysisRecipe2 } from "./analysis-recipe";
import { designRecipe, designRun, drawnPart, drawRecipe, newRecipeBudget } from "./design-analysis";
import { PAGE_BUDGET, WORK_BUDGET } from "./recipe-run";
import { BUILT_IN_RECIPES, RECIPES } from "./built-in-recipes";
import { readFileSync } from "node:fs";
import { repoFile } from "./test/repo-file";
import { designWithRecipe } from "./design-files";
import { shownSeries } from "./display-periods";
import { checkPack, type Pack } from "./pack";
import { PACK } from "./pack.test";
import { storedItems } from "./packs";
import { changes } from "./basis";
import { quantile } from "./methods/quantiles";
import { sampleCanvasData } from "./sample-data";
import { EXAMPLE, WITH_RECIPE } from "./view-design.test";
import { checkViewDesign, checkViewDesignValue, writeViewDesign, type ViewDesign } from "./view-design";

const RECIPE: AnalysisRecipe2 = {
  format: "ziffr.analysis/2",
  name: "Changes and the usual range",
  slots: [{ label: "Metric" }, { label: "Compared with" }],
  steps: [
    { id: "chg", fn: "changes", of: "slot1" },
    { id: "mid", fn: "quantile", of: "slot1", percent: 50 },
    { id: "usual", fn: "usualRange", of: "slot1" },
    { id: "lags", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 2 },
    { id: "rho", fn: "spearman", of: "slot1", with: "slot2" },
  ],
  outputs: [
    { step: "chg", label: "Change", shows: "series", unit: "metric" },
    { step: "mid", label: "Median", shows: "value", unit: "metric" },
    { step: "usual", label: "Usual", shows: "takeaway", title: "What is usual" },
    { step: "lags", label: "By delay", shows: "table" },
    { step: "rho", label: "Rank link", shows: "takeaway" },
  ],
};
const DESIGN: ViewDesign = {
  ...EXAMPLE,
  name: "Changes",
  slots: [{ label: "Metric", metrics: "one" }, { label: "Compared with", metrics: "one" }],
  analysis: RECIPE,
  parts: [
    { mark: "plot", axes: "regular", scale: "padded", marks: [{ mark: "line", show: "values", weight: "strong" }, { mark: "line", show: "recipe.chg", tone: "muted", dash: true }, { mark: "rule", show: "recipe.mid" }] },
    { mark: "text", style: "note", content: ["Median ", { show: "recipe.mid" }] },
  ],
};
const text = (v: unknown) => JSON.stringify(v, null, 2);
const data = { ...sampleCanvasData("v", "1,234.5"), today: "2026-06-20" };
const [revenue, orders] = data.metrics;
const points = (m: typeof revenue) => shownSeries(m, data, undefined, {}).points.map((p) => ({ period: p.period, value: p.value }));

describe("a design that carries a /2 recipe", () => {
  it("passes the checks and is written back as it was", () => {
    const res = checkViewDesign(text(DESIGN));
    expect(res.ok ? [] : res.problems).toEqual([]);
    const written = writeViewDesign(DESIGN);
    const again = checkViewDesign(written);
    expect(again.ok && writeViewDesign(again.design)).toBe(written);
    expect(again.ok && again.design.analysis).toEqual(RECIPE);
  });
  it("draws the series and values the recipe gives, as the Methods give them", () => {
    const got = designRecipe(DESIGN, [revenue, orders], data, {})!;
    expect(Object.keys(got).sort()).toEqual(["chg", "mid"]);
    expect(got.chg).toEqual({ kind: "series", points: changes(points(revenue), revenue.period) });
    expect(got.mid).toEqual({ kind: "value", value: quantile(points(revenue), 0.5) });
  });
  it("works out only what its marks draw: no Takeaway, no table, no step nothing drawn needs", () => {
    const part = drawnPart(RECIPE);
    expect(part.steps.map((s) => s.id)).toEqual(["chg", "mid"]);
    expect(part.outputs.map((o) => [o.step, o.shows])).toEqual([["chg", "series"], ["mid", "value"]]);
    // A drawn step keeps the steps it is worked out from; a recipe that draws nothing works out nothing.
    const chained: AnalysisRecipe2 = { ...RECIPE, steps: [{ id: "chg", fn: "changes", of: "slot1" }, { id: "avg", fn: "movingAverage", of: "chg", window: 3 }, { id: "rho", fn: "spearman", of: "slot1", with: "slot2" }], outputs: [{ step: "avg", label: "a", shows: "series", unit: "metric" }, { step: "rho", label: "r", shows: "takeaway" }] };
    expect(drawnPart(chained).steps.map((s) => s.id)).toEqual(["chg", "avg"]);
    expect(designRecipe({ ...DESIGN, analysis: { ...RECIPE, outputs: [RECIPE.outputs[2], RECIPE.outputs[3]] }, parts: [{ mark: "text", content: ["x"] }] }, [revenue, orders], data, {})).toEqual({});
  });
  it("gives the tables and Takeaways in full where asked", () => {
    const run = designRun(DESIGN, [revenue, orders], data, {})!;
    expect(run.outputs.map((o) => o.shows)).toEqual(["series", "value", "takeaway", "table", "takeaway"]);
    const usual = run.outputs[2];
    expect(usual.shows === "takeaway" && usual.title).toBe("What is usual");
    expect(designRun(WITH_RECIPE, [revenue], data, {})).toBeNull();
    expect(designRun({ ...DESIGN, analysis: undefined }, [revenue], data, {})).toBeNull();
  });
  it("keeps a missing Metric as a gap in its place, not the next Metric moved up", () => {
    const run = designRun(DESIGN, [revenue], data, {})!;
    const rho = run.outputs[4];
    expect(rho.shows === "takeaway" && rho.takeaway.kind).toBe("refusal");
    expect(designRecipe(DESIGN, [], data, {})!.mid).toEqual({ kind: "value", value: null });
  });
  it("names a table or a Takeaway as not drawn by a mark, and a step that is no output", () => {
    const draw = (show: string, mark: unknown = { mark: "text", content: [{ show }] }) => checkViewDesignValue({ ...DESIGN, parts: [mark] } as ViewDesign);
    for (const step of ["lags", "usual", "rho"]) {
      const res = draw(`recipe.${step}`);
      expect(res.ok).toBe(false);
      expect(!res.ok && res.problems.map((p) => p.message).join()).toContain(`“recipe.${step}” is a table, a fit or a Takeaway, or has no unit; marks draw a series or one value.`);
    }
    const none = draw("recipe.model");
    expect(!none.ok && none.problems.map((p) => p.message).join()).toContain("“model” is not an output of the design's analysis");
    expect(draw("recipe.chg", { mark: "plot", axes: "none", marks: [{ mark: "rule", show: "recipe.chg" }] }).ok).toBe(false);
    expect(draw("recipe.mid", { mark: "plot", axes: "none", marks: [{ mark: "line", show: "recipe.mid" }] }).ok).toBe(false);
    expect(draw("recipe.chg").ok).toBe(true);
  });
  it("names the mistakes of a /2 recipe inside a design, and of a format it does not know", () => {
    const bad = (analysis: unknown) => checkViewDesign(text({ ...DESIGN, analysis }));
    const messages = (r: ReturnType<typeof bad>) => (r.ok ? "" : r.problems.map((p) => `${p.path}: ${p.message}`).join(" | "));
    expect(messages(bad({ ...RECIPE, format: "ziffr.analysis/3" }))).toContain("analysis.format: must be one of “ziffr.analysis/1”, “ziffr.analysis/2”");
    expect(messages(bad({ ...RECIPE, steps: [{ id: "x", fn: "eval", of: "slot1" }] }))).toContain("must be one of “movingAverage”");
    expect(messages(bad({ ...RECIPE, code: "x" }))).toContain("analysis.code: is not a field here");
    expect(messages(bad({ ...RECIPE, steps: [...RECIPE.steps, { id: "w", fn: "importance", of: "slot1" }] }))).toContain("“slot1” gives a series; importance needs a fit");
    expect(messages(bad({ ...RECIPE, slots: [...RECIPE.slots, { label: "C" }, { label: "D" }] }))).toContain("The analysis has 4 Slots; the design fills at most 2.");
    // A /1 recipe may not use a function of /2.
    expect(messages(bad({ ...WITH_RECIPE.analysis, steps: [{ id: "avg", fn: "changes", of: "slot1" }] }))).toContain("must be one of “movingAverage”");
  });
  it("starts a design from a /2 recipe, drawing only what a mark can draw", () => {
    const d = designWithRecipe(RECIPE);
    expect(checkViewDesignValue(d).ok).toBe(true);
    expect(JSON.stringify(d.parts)).toContain("recipe.chg");
    expect(JSON.stringify(d.parts)).toContain("recipe.mid");
    expect(JSON.stringify(d.parts)).not.toMatch(/recipe\.(lags|usual|rho)/);
  });
});

describe("a Pack that holds a /2 recipe", () => {
  const pack = (recipe: unknown): string => JSON.stringify({ ...PACK, contents: { ...PACK.contents, analyses: [{ key: "changes", recipe }] } } satisfies unknown as Pack, null, 2);
  it("passes the checks and installs as a design that draws it", () => {
    const res = checkPack(pack(RECIPE));
    expect(res.ok ? [] : res.problems).toEqual([]);
    if (!res.ok) return;
    const stored = storedItems(res.pack);
    expect(JSON.stringify(stored)).toContain("recipe.chg");
  });
  it("refuses a /2 recipe's mistakes in the Pack's own words, with the line", () => {
    const res = checkPack(pack({ ...RECIPE, steps: [{ id: "x", fn: "eval", of: "slot1" }] }));
    expect(res.ok).toBe(false);
    expect(!res.ok && res.problems.map((p) => p.message).join()).toContain("must be one of “movingAverage”");
  });
});

describe("what a page of recipes may ask for", () => {
  // Three Metrics of 120 months each, so every step works on the longest series a recipe reads.
  const long = (k: number) => Array.from({ length: 120 }, (_, i) => ({ period: `${2016 + Math.floor((i + 5) / 12)}-${String(((i + 5) % 12) + 1).padStart(2, "0")}-01`, value: Math.round((100 + ((i * 37 + k * 11) % 23) * 3 + Math.sin(i * k) * 9 + i * 0.5) * 100) / 100 }));
  const big = { ...data, series: { ...data.series, [revenue.slug]: long(3), [orders.slug]: long(5), [data.metrics[2].slug]: long(7) } };
  const three = [revenue, orders, data.metrics[2]];
  // The dearest a recipe of drawn outputs can be: four changes and five partial correlations with 4 controls each (6 outputs at most).
  const worst: ViewDesign = {
    ...DESIGN,
    slots: [{ label: "A", metrics: "one" }, { label: "B", metrics: "one" }, { label: "C", metrics: "one" }],
    analysis: {
      format: "ziffr.analysis/2", name: "Worst", slots: [{ label: "A" }, { label: "B" }, { label: "C" }],
      steps: [
        ...[1, 2, 3].map((k) => ({ id: `c${k}`, fn: "changes" as const, of: `slot${k}` })),
        ...Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, fn: "partialCorrelation" as const, of: "slot1", with: "slot2", controls: ["slot3", "c1", "c2", "c3"] })),
      ],
      outputs: [...Array.from({ length: 5 }, (_, i) => ({ step: `p${i}`, label: `p${i}`, shows: "value" as const, unit: "number" as const })), { step: "c1", label: "c", shows: "series" as const, unit: "metric" as const }],
    },
    parts: [{ mark: "text", content: [{ show: "recipe.p0" }] }],
  };

  it("the worst recipe of drawn outputs the checks admit is within its budget and takes a fraction of a second", () => {
    expect(checkViewDesignValue(worst).ok).toBe(true);
    const started = Date.now();
    const budget = newRecipeBudget();
    const res = drawRecipe(worst, three, big, {}, budget);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(res.refusal).toBeNull();
    expect(Object.keys(res.results!).length).toBe(6);
    // 3 changes (360) and 5 partial correlations of 4 controls (5 × 1,080).
    expect(PAGE_BUDGET - budget.left).toBe(3 * 120 + 5 * 1080);
  });
  it("30 of them on one page: the page's share is spent after the first few, the rest say so, in the same order every time", () => {
    const page = () => {
      const budget = newRecipeBudget();
      const started = Date.now();
      const out = Array.from({ length: 30 }, () => drawRecipe(worst, three, big, {}, budget));
      return { out, ms: Date.now() - started, left: budget.left };
    };
    const a = page();
    expect(a.ms).toBeLessThan(3000);
    const drawn = a.out.map((r) => r.refusal === null);
    // 5,760 units each: 8 widgets fit in 50,000 (46,080); the 9th would take it over, so it and every later one is refused.
    expect(drawn).toEqual(Array.from({ length: 30 }, (_, i) => i < 8));
    expect(a.out[8].refusal).toBe("Too much analysis on this page to work out at once: open the widget on its own.");
    expect(a.out[8].results).toBeNull();
    expect(page().out.map((r) => r.refusal === null)).toEqual(drawn);
    expect(a.left).toBe(0);
    // Without a page, a widget has only its own budget.
    expect(drawRecipe(worst, three, big, {}).refusal).toBeNull();
    expect(drawRecipe(worst, three, big, {}, { left: 0 }).refusal).toContain("Too much analysis on this page");
  });
  it("a recipe in the first format is charged a pass of its longest series for each step", () => {
    const budget = newRecipeBudget();
    const d = designWithRecipe(BUILT_IN_RECIPES["moving-average"]);
    expect(drawRecipe(d, [revenue], big, {}, budget).refusal).toBeNull();
    expect(PAGE_BUDGET - budget.left).toBe(BUILT_IN_RECIPES["moving-average"].steps.length * 120);
    expect(drawRecipe(d, [revenue], big, {}, { left: 119 }).refusal).toContain("Too much analysis");
  });
  it("every built-in recipe and every recipe of a shipped Pack uses under a fifth of a recipe's budget", () => {
    const packs = (JSON.parse(readFileSync(repoFile("packs/saas-metrics.pack.json"), "utf8")).contents.analyses ?? []) as { recipe: { steps: unknown[] } }[];
    const steps = [...RECIPES.map((id) => BUILT_IN_RECIPES[id].steps.length), ...packs.map((p) => p.recipe.steps.length)];
    expect(steps.length).toBeGreaterThanOrEqual(7);
    // Each step of the first format is one pass of the longest series (120 values).
    for (const n of steps) expect(n * 120).toBeLessThan(WORK_BUDGET / 5);
  });
  it("a full run charges its Takeaways at their calibrated cost", () => {
    const run = designRun(DESIGN, [revenue, orders], big, {})!;
    // The usual range's Takeaway alone is 83 passes of the series.
    expect(run.spent).toBeGreaterThanOrEqual(83 * 120);
    expect(run.limited).toBe(false);
  });
});
