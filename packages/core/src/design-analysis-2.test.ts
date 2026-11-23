// A /2 Analysis Recipe in a View Design and in a Pack (spec 0041, ticket 8; GLOSSARY: Analysis Recipe, View Design, Pack):
// marks draw the series and values it gives, a table or a Takeaway is named as not drawn yet, the design's checks name a
// recipe's mistakes as they do for /1, and a Pack that holds a /2 recipe checks and installs as a design that draws it.
import { describe, expect, it } from "vitest";
import type { AnalysisRecipe2 } from "./analysis-recipe";
import { designRecipe, designRun } from "./design-analysis";
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
      expect(!res.ok && res.problems.map((p) => p.message).join()).toContain(`“recipe.${step}” is a table, a model or a Takeaway, or has no unit; marks draw a series or one value.`);
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
