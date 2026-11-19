// The Analysis Recipe format (spec 0024, #150): good recipes pass, a table of invalid and hostile files is refused
// with the right message and line, the published schema is the one the checks run, and a recipe's output is the
// library's functions applied to its Slots' series and nothing else.
import { readFileSync, writeFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { ANALYSIS_RECIPE_SCHEMA, checkAnalysisRecipe, checkAnalysisRecipeValue, RECIPE_LIMITS, writeAnalysisRecipe, type AnalysisRecipe } from "./analysis-recipe";
import { runRecipe } from "./recipe-run";
import { BUILT_IN_RECIPES, RECIPES } from "./built-in-recipes";
import { correlation, difference, growth, linearTrend, mean, movingAverage, seasonalIndex, share, slope, standardDeviation, zScore } from "./recipe-functions";
import type { Point } from "./types";
import { repoFile } from "./test/repo-file";

/** A recipe using steps on steps and two Slots. */
const EXAMPLE: AnalysisRecipe = {
  format: "ziffr.analysis/1",
  name: "Smoothed growth",
  description: "The three-month average, its growth, and how it moves with a second Metric.",
  slots: [{ label: "Metric" }, { label: "Compared with" }],
  steps: [
    { id: "smooth", fn: "movingAverage", of: "slot1", window: 3 },
    { id: "grow", fn: "growth", of: "smooth" },
    { id: "r", fn: "correlation", of: "slot1", with: "slot2" },
  ],
  outputs: [
    { step: "smooth", label: "Three-month average", unit: "metric" },
    { step: "grow", label: "Growth of the average", unit: "percent" },
    { step: "r", label: "r", unit: "number" },
  ],
};
const text = (v: unknown) => JSON.stringify(v, null, 2);
const withSteps = (steps: unknown[], extra: Record<string, unknown> = {}) => text({ ...EXAMPLE, ...extra, steps });

// [what it is, the file's text, a part of the message expected, a text on the line it names (null: no line); a list's
// entries start on the line after the one that opens it (`{ after: … }`), and `{ last: … }` is the last line with a text]
type Where = string | { after: string } | { last: string } | null;
const HOSTILE: [string, string, string, Where][] = [
  ["not JSON", "{ steps: 1 }", "Expected a field name", "{"],
  ["oversized", text({ ...EXAMPLE, description: "x".repeat(RECIPE_LIMITS.bytes) }), "at most 32,768 are allowed", null],
  ["a later version", text({ ...EXAMPLE, format: "ziffr.analysis/2" }), "this Ziffr reads ziffr.analysis/1", '"format"'],
  ["an unknown field", text({ ...EXAMPLE, code: "return fetch('x')" }), "is not a field here", '"code"'],
  ["a function the library does not have", withSteps([{ id: "x", fn: "eval", of: "slot1" }]), "must be one of “movingAverage”", '"eval"'],
  ["code in a parameter", withSteps([{ id: "x", fn: "movingAverage", of: "slot1", window: "3; fetch()" }]), "must be a whole number", '"3; fetch()"'],
  ["a window out of range", withSteps([{ id: "x", fn: "movingAverage", of: "slot1", window: 1000 }]), "must be at most 60", "1000"],
  ["a missing parameter", withSteps([{ id: "x", fn: "seasonalIndex", of: "slot1" }]), "needs the field “season”", { after: '"steps": [' }],
  ["a parameter it does not take", withSteps([{ id: "x", fn: "growth", of: "slot1", window: 3 }]), "is not a field here", '"window"'],
  ["a second series where none belongs", withSteps([{ id: "x", fn: "mean", of: "slot1", with: "slot2" }]), "is not a field here", '"with"'],
  ["a correlation without its second series", withSteps([{ id: "x", fn: "correlation", of: "slot1" }]), "needs the field “with”", { after: '"steps": [' }],
  ["a Metric by its name", withSteps([{ id: "x", fn: "mean", of: "metric:revenue" }]), "a Slot (slot1 to slot4) or the id of an earlier step", '"metric:revenue"'],
  ["a Slot it does not have", withSteps([{ id: "x", fn: "mean", of: "slot3" }]), "“slot3” is neither a Slot of this recipe nor an earlier step", '"slot3"'],
  ["a later step", withSteps([{ id: "a", fn: "growth", of: "b" }, { id: "b", fn: "difference", of: "slot1" }]), "“b” is neither a Slot of this recipe nor an earlier step", '"b"'],
  ["a step named twice", withSteps([{ id: "a", fn: "growth", of: "slot1" }, { id: "a", fn: "difference", of: "slot1" }]), "“a” is used already", { last: '"id": "a"' }],
  ["a step named like a Slot", withSteps([{ id: "slot1", fn: "growth", of: "slot1" }]), "is used already", '"id": "slot1"'],
  ["a value where a series belongs", withSteps([{ id: "m", fn: "mean", of: "slot1" }, { id: "g", fn: "growth", of: "m" }]), "“m” gives one value; growth needs a series", '"of": "m"'],
  ["an output of no step", text({ ...EXAMPLE, outputs: [{ step: "nothing", label: "x", unit: "number" }] }), "“nothing” is not a step of this recipe", '"nothing"'],
  ["an id with markup", withSteps([{ id: "<b>", fn: "growth", of: "slot1" }]), "a name for the step", '"<b>"'],
  ["HTML in a label", text({ ...EXAMPLE, outputs: [{ step: "smooth", label: "<script>x</script>", unit: "metric" }] }), "without markup or web addresses", "<script>"],
  ["a web address in a name", text({ ...EXAMPLE, name: "see https://evil.example" }), "without markup or web addresses", '"name"'],
  ["too many steps", withSteps(Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, fn: "growth", of: "slot1" }))), "13 entries; at most 12", '"steps"'],
  ["too many Slots", text({ ...EXAMPLE, slots: Array(5).fill({ label: "M" }) }), "5 entries; at most 4", '"slots"'],
  ["a unit it does not know", text({ ...EXAMPLE, outputs: [{ step: "smooth", label: "x", unit: "px" }] }), "must be one of “metric”, “percent”, “number”", '"px"'],
  ["a prototype key", text(EXAMPLE).replace('"format"', '"__proto__": {},\n  "format"'), "is not a field here", "__proto__"],
];

describe("checkAnalysisRecipe", () => {
  it("accepts a recipe of steps on steps", () => {
    const res = checkAnalysisRecipe(text(EXAMPLE));
    expect(res.ok ? [] : res.problems).toEqual([]);
  });
  it.each(HOSTILE)("refuses %s", (_, file, message, marker) => {
    const res = checkAnalysisRecipe(file);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.problems.map((p) => p.message).join(" | ")).toContain(message);
    const lineAt = (i: number) => file.slice(0, i).split("\n").length;
    const line = marker === null ? null : typeof marker === "string" ? lineAt(file.indexOf(marker)) : "after" in marker ? lineAt(file.indexOf(marker.after)) + 1 : lineAt(file.lastIndexOf(marker.last));
    expect(res.problems.find((p) => p.message.includes(message))?.line ?? null).toBe(line);
  });
  it("reads a recipe already parsed, and nothing that is not one", () => {
    expect(checkAnalysisRecipeValue(EXAMPLE).ok).toBe(true);
    expect(checkAnalysisRecipeValue([]).ok).toBe(false);
  });
  it("round-trips: written, read and written again gives the same file", () => {
    const once = writeAnalysisRecipe(JSON.parse(JSON.stringify({ outputs: EXAMPLE.outputs, steps: EXAMPLE.steps, name: EXAMPLE.name, format: EXAMPLE.format, slots: EXAMPLE.slots, description: EXAMPLE.description })));
    expect(once.indexOf('"format"')).toBeLessThan(once.indexOf('"steps"'));
    const back = checkAnalysisRecipe(once);
    expect(back.ok && writeAnalysisRecipe(back.recipe)).toBe(once);
  });
});

describe("the published schema", () => {
  const path = repoFile("docs/reference/analysis-recipe.schema.json");
  const generated = `${JSON.stringify(ANALYSIS_RECIPE_SCHEMA, null, 2)}\n`;
  it("is the one the checks run", () => {
    if (process.env.UPDATE_REFERENCE) writeFileSync(path, generated);
    expect(readFileSync(path, "utf8")).toBe(generated);
  });
  it("is a JSON Schema another validator agrees with", () => {
    const validate = new Ajv2020({ strict: false }).compile(ANALYSIS_RECIPE_SCHEMA as object);
    expect(validate(EXAMPLE)).toBe(true);
    for (const [name, file] of HOSTILE) {
      let value: unknown;
      try { value = JSON.parse(file); } catch { continue; }
      if (validate(value) === false) expect(checkAnalysisRecipeValue(value).ok, name).toBe(false);
      if (checkAnalysisRecipeValue(value).ok) expect(validate(value), name).toBe(true);
    }
  });
});

describe("runRecipe", () => {
  const months = (vs: number[]): Point[] => vs.map((value, i) => ({ period: `2025-${String(i + 1).padStart(2, "0")}-01`, value }));
  const a = months([10, 12, 11, 15, 14, 18, 17, 21]);
  const b = months([1, 1.5, 1.2, 2, 1.9, 2.4, 2.2, 3]);

  it("gives each step's result as the library's function gives it, steps on steps included", () => {
    const out = runRecipe(EXAMPLE, [a, b]);
    expect(out.smooth).toEqual(movingAverage(a, 3));
    const smooth = movingAverage(a, 3);
    expect(out.grow).toEqual(growth(smooth.kind === "series" ? smooth.points : []));
    expect(out.r).toEqual(correlation(a, b));
  });

  it("reaches only the series it is given: an empty Slot gives empty results, never another Metric's", () => {
    const out = runRecipe(EXAMPLE, [a]);
    expect(out.r).toEqual({ kind: "value", value: null });
    expect(runRecipe(EXAMPLE, [])).toEqual({ smooth: { kind: "series", points: [] }, grow: { kind: "series", points: [] }, r: { kind: "value", value: null } });
  });

  it.each(RECIPES)("the built-in recipe %s passes the checks, round-trips and runs on Sample Data", (id) => {
    const r = BUILT_IN_RECIPES[id];
    const once = writeAnalysisRecipe(r);
    expect(checkAnalysisRecipe(once).ok).toBe(true);
    const out = runRecipe(r, r.slots.map(() => a));
    for (const o of r.outputs) expect(out[o.step]).toBeDefined();
  });

  it("applies every function of the library exactly as the library does, on Slots and on earlier steps", () => {
    const all: AnalysisRecipe = {
      format: "ziffr.analysis/1", name: "Every function", slots: [{ label: "A" }, { label: "B" }],
      steps: [
        { id: "ma", fn: "movingAverage", of: "slot1", window: 3 }, { id: "diff", fn: "difference", of: "ma" }, { id: "grow", fn: "growth", of: "slot1" },
        { id: "part", fn: "share", of: "slot2", with: "slot1" }, { id: "line", fn: "linearTrend", of: "slot1" }, { id: "rise", fn: "slope", of: "line" },
        { id: "avg", fn: "mean", of: "diff" }, { id: "sd", fn: "standardDeviation", of: "slot2" }, { id: "z", fn: "zScore", of: "grow" },
        { id: "season", fn: "seasonalIndex", of: "slot1", season: 2 }, { id: "r", fn: "correlation", of: "part", with: "slot2" },
      ],
      outputs: [{ step: "r", label: "r", unit: "number" }],
    };
    expect(checkAnalysisRecipeValue(all).ok).toBe(true);
    const out = runRecipe(all, [a, b]);
    const s = (r: ReturnType<typeof movingAverage>) => (r.kind === "series" ? r.points : []);
    const ma = movingAverage(a, 3), diff = difference(s(ma)), grow = growth(a), part = share(b, a), line = linearTrend(a);
    expect(out).toEqual({
      ma, diff, grow, part, line, rise: slope(s(line)), avg: mean(s(diff)), sd: standardDeviation(b), z: zScore(s(grow)),
      season: seasonalIndex(a, 2), r: correlation(s(part), b),
    });
  });

  it("the deviation and z-score recipe equals the functions it names", () => {
    const out = runRecipe(BUILT_IN_RECIPES["z-score"], [a]);
    expect(out.sd).toEqual(standardDeviation(a));
    expect(out.z).toEqual(zScore(a));
  });
});
