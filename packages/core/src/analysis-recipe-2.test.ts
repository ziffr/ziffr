// The Analysis Recipe format /2 (spec 0041, ticket 8; GLOSSARY: Analysis Recipe): good recipes pass, a table of hostile
// files is refused by the checks with the right message and line, the published schema is the one the checks run, a second
// validator (Ajv) refuses every hostile case the schema can state (the cases only the checks can state are marked and
// listed apart), every limit is held one step either side, files in /1 still load and mean what they meant, and a /2 recipe's
// steps give what the Methods give, with nothing but the Slots' series and the checks' words.
import { readFileSync, writeFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { ANALYSIS_FORMATS, ANALYSIS_RECIPE_SCHEMA, ANALYSIS_RECIPE_SCHEMA_2, checkAnalysisRecipe, checkAnalysisRecipeValue, drawnOutputs, FUNCTIONS, FUNCTIONS_2, RECIPE_LIMITS_2, writeAnalysisRecipe, type AnalysisRecipe2 } from "./analysis-recipe";
import { BUILT_IN_RECIPES, RECIPES } from "./built-in-recipes";
import { repoFile } from "./test/repo-file";

/** A /2 recipe that uses every kind of step and output. */
const GOOD: AnalysisRecipe2 = {
  format: "ziffr.analysis/2",
  name: "What goes with revenue",
  description: "Rank, lag, partial link, the usual range and a fit of revenue on two others.",
  slots: [{ label: "Metric" }, { label: "Compared with" }, { label: "Held the same" }],
  steps: [
    { id: "chg", fn: "changes", of: "slot1" },
    { id: "flat", fn: "detrended", of: "slot2" },
    { id: "rho", fn: "spearman", of: "slot1", with: "slot2" },
    { id: "part", fn: "partialCorrelation", of: "slot1", with: "slot2", controls: ["slot3"] },
    { id: "lags", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 3 },
    { id: "usual", fn: "usualRange", of: "slot1" },
    { id: "mid", fn: "quantile", of: "slot1", percent: 50 },
    { id: "model", fn: "fit", of: "slot1", drivers: ["slot2", "slot3"] },
    { id: "weights", fn: "importance", of: "model" },
    { id: "smooth", fn: "movingAverage", of: "chg", window: 3 },
  ],
  outputs: [
    { step: "smooth", label: "Smoothed change", shows: "series", unit: "metric" },
    { step: "rho", label: "Rank link", shows: "value", unit: "number" },
    { step: "lags", label: "By delay", shows: "table" },
    { step: "weights", label: "Shares", shows: "table" },
    { step: "usual", label: "Usual", shows: "takeaway", title: "What is usual", note: "Worked out from the history." },
    { step: "model", label: "What moves it", shows: "takeaway" },
  ],
};
const text = (v: unknown) => JSON.stringify(v, null, 2);
const withSteps = (steps: unknown[], extra: Record<string, unknown> = {}) => text({ ...GOOD, ...extra, steps });
const withOutputs = (outputs: unknown[]) => text({ ...GOOD, outputs });
const step = (i: number, patch: Record<string, unknown>) => withSteps(GOOD.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
const without = (i: number, key: string) => withSteps(GOOD.steps.map((s, k) => (k === i ? Object.fromEntries(Object.entries(s).filter(([n]) => n !== key)) : s)));

// [what it is, the file, a part of the message expected, where the line is, who can refuse it: "schema" (the JSON Schema says it, so
// Ajv refuses it too) or "meaning" (how steps fit together, which a schema cannot say; Ajv accepts it and the checks refuse it)]
type Where = string | { after: string; plus?: number } | { above: string } | { last: string } | null;
type Case = [string, string, string, Where, "schema" | "meaning"];
const HOSTILE: Case[] = [
  ["not JSON", "{ steps: 1 }", "Expected a field name", "{", "schema"],
  ["oversized", text({ ...GOOD, description: "x".repeat(RECIPE_LIMITS_2.bytes) }), "at most 32,768 are allowed", null, "schema"],
  ["a later version", text({ ...GOOD, format: "ziffr.analysis/3" }), "this Ziffr reads ziffr.analysis/1, ziffr.analysis/2", '"format"', "schema"],
  ["no format", text({ ...GOOD, format: undefined }), "needs the field “format”", "{", "schema"],
  ["an unknown field", text({ ...GOOD, code: "return fetch('x')" }), "is not a field here", '"code"', "schema"],
  ["a function the library does not have", step(0, { fn: "eval" }), "must be one of “movingAverage”", '"eval"', "schema"],
  ["code in a parameter", step(6, { percent: "50; fetch()" }), "must be a whole number", '"50; fetch()"', "schema"],
  ["a percent of 0", step(6, { percent: 0 }), "must be at least 1", "0", "schema"],
  ["a percent of 100", step(6, { percent: 100 }), "must be at most 99", "100", "schema"],
  ["a delay of 7", step(4, { maxLag: 7 }), "must be at most 6", "7", "schema"],
  ["a negative delay", step(4, { maxLag: -1 }), "must be at least 0", "-1", "schema"],
  ["a window out of range", step(9, { window: 61 }), "must be at most 60", "61", "schema"],
  ["a missing parameter", without(6, "percent"), "needs the field “percent”", { above: '"id": "mid"' }, "schema"],
  ["a missing delay", without(4, "maxLag"), "needs the field “maxLag”", { above: '"id": "lags"' }, "schema"],
  ["a parameter it does not take", step(0, { percent: 5 }), "is not a field here", '"percent"', "schema"],
  ["a second series where none belongs", step(0, { with: "slot2" }), "is not a field here", '"with"', "schema"],
  ["a spearman without its second series", without(2, "with"), "needs the field “with”", { above: '"id": "rho"' }, "schema"],
  ["a partial correlation without controls", without(3, "controls"), "needs the field “controls”", { above: '"id": "part"' }, "schema"],
  ["a fit without drivers", without(7, "drivers"), "needs the field “drivers”", { above: '"id": "model"' }, "schema"],
  ["controls that are no list", step(3, { controls: "slot3" }), "must be a list, not a text", '"slot3"', "schema"],
  ["no controls", step(3, { controls: [] }), "must not be empty", "[]", "schema"],
  ["five controls", step(3, { controls: ["slot1", "slot2", "slot3", "chg", "flat"] }), "has 5 entries; at most 4 are allowed", '"controls"', "schema"],
  ["a control named twice", step(3, { controls: ["slot3", "slot3"] }), "“slot3” is listed twice", { after: '"controls": [', plus: 2 }, "schema"],
  ["seven drivers", step(7, { drivers: ["slot1", "slot2", "slot3", "chg", "flat", "smooth", "mid"] }), "has 7 entries; at most 6 are allowed", '"drivers"', "schema"],
  ["a driver named twice", step(7, { drivers: ["slot2", "slot2"] }), "“slot2” is listed twice", { after: '"drivers": [', plus: 2 }, "schema"],
  ["a Metric by its name", step(7, { drivers: ["metric:revenue"] }), "a Slot (slot1 to slot4) or the id of an earlier step", '"metric:revenue"', "schema"],
  ["a Metric by its name as the target", step(7, { of: "metric:revenue" }), "a Slot (slot1 to slot4) or the id of an earlier step", '"metric:revenue"', "schema"],
  ["an output that shows a model", withOutputs([{ step: "model", label: "x", shows: "model" }]), "must be one of “series”, “value”, “table”, “takeaway”", '"shows": "model"', "schema"],
  ["an output without what it shows", withOutputs([{ step: "rho", label: "x", unit: "number" }]), "needs the field “shows”", { after: '"outputs": [' }, "schema"],
  ["a unit it does not know", withOutputs([{ step: "rho", label: "x", shows: "value", unit: "px" }]), "must be one of “metric”, “percent”, “number”", '"px"', "schema"],
  ["HTML in a title", withOutputs([{ step: "usual", label: "x", shows: "takeaway", title: "<script>x</script>" }]), "without markup or web addresses", "<script>", "schema"],
  ["a web address in a note", withOutputs([{ step: "usual", label: "x", shows: "takeaway", note: "see https://evil.example" }]), "without markup or web addresses", '"note"', "schema"],
  ["HTML in a label", withOutputs([{ step: "rho", label: "<b>", shows: "value", unit: "number" }]), "without markup or web addresses", '"<b>"', "schema"],
  ["a web address in a name", text({ ...GOOD, name: "see https://evil.example" }), "without markup or web addresses", '"name"', "schema"],
  ["an id with markup", step(0, { id: "<b>" }), "a name for the step", '"<b>"', "schema"],
  ["a prototype key", text(GOOD).replace('"format"', '"__proto__": {},\n  "format"'), "is not a field here", "__proto__", "schema"],
  ["too many steps", withSteps(Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, fn: "growth", of: "slot1" }))), "13 entries; at most 12", '"steps"', "schema"],
  ["too many outputs", withOutputs(Array.from({ length: 7 }, (_, i) => ({ step: "rho", label: `o${i}`, shows: "value", unit: "number" }))), "7 entries; at most 6", '"outputs"', "schema"],
  ["too many Slots", text({ ...GOOD, slots: Array(5).fill({ label: "M" }) }), "5 entries; at most 4", '"slots"', "schema"],
  ["a Slot it does not have", step(2, { with: "slot4" }), "“slot4” is neither a Slot of this recipe nor an earlier step", '"slot4"', "meaning"],
  ["a later step", step(0, { of: "weights" }), "“weights” is neither a Slot of this recipe nor an earlier step", '"weights"', "meaning"],
  ["a step named twice", withSteps([{ id: "a", fn: "growth", of: "slot1" }, { id: "a", fn: "difference", of: "slot1" }], { outputs: [{ step: "a", label: "x", shows: "series", unit: "number" }] }), "“a” is used already", { last: '"id": "a"' }, "meaning"],
  ["a step named like a Slot", step(0, { id: "slot1" }), "is used already", '"id": "slot1"', "meaning"],
  ["a value where a series belongs", step(9, { of: "rho" }), "“rho” gives one value; movingAverage needs a series", '"of": "rho"', "meaning"],
  ["a table where a series belongs", step(9, { of: "lags" }), "“lags” gives a table; movingAverage needs a series", '"of": "lags"', "meaning"],
  ["a model where a series belongs", step(9, { of: "model" }), "“model” gives a model; movingAverage needs a series", { last: '"of": "model"' }, "meaning"],
  ["a series where a model belongs", step(8, { of: "slot1" }), "“slot1” gives a series; importance needs a model", { last: '"of": "slot1"' }, "meaning"],
  ["a value as a driver", step(7, { drivers: ["slot2", "rho"] }), "“rho” gives one value; fit needs a series", { after: '"drivers": [', plus: 2 }, "meaning"],
  ["a table as a driver", step(7, { drivers: ["slot2", "lags"] }), "“lags” gives a table; fit needs a series", { after: '"drivers": [', plus: 2 }, "meaning"],
  ["an output of no step", withOutputs([{ step: "nothing", label: "x", shows: "value", unit: "number" }]), "“nothing” is not a step of this recipe", '"nothing"', "meaning"],
  ["a value shown as a series", withOutputs([{ step: "rho", label: "x", shows: "series", unit: "number" }]), "“rho” gives one value, not a series", '"series"', "meaning"],
  ["a model shown as a series", withOutputs([{ step: "model", label: "x", shows: "series", unit: "number" }]), "gives a model, which is shown only through its Takeaway", '"series"', "meaning"],
  ["a Takeaway of a step that has none", withOutputs([{ step: "chg", label: "x", shows: "takeaway" }]), "changes has no Takeaway; show its a series instead", '"takeaway"', "meaning"],
  ["a Takeaway of a step on another step", withOutputs([{ step: "smooth", label: "x", shows: "takeaway" }]), "movingAverage has no Takeaway", '"takeaway"', "meaning"],
  ["a Takeaway worked out from another step", withSteps([...GOOD.steps, { id: "r2", fn: "spearman", of: "chg", with: "slot2" }], { outputs: [{ step: "r2", label: "x", shows: "takeaway" }] }), "A Takeaway is worked out from Slots only; r2 works on another step", '"takeaway"', "meaning"],
  ["a series without its unit", withOutputs([{ step: "smooth", label: "x", shows: "series" }]), "needs the field “unit”", { after: '"outputs": [' }, "meaning"],
  ["a unit on a table", withOutputs([{ step: "lags", label: "x", shows: "table", unit: "number" }]), "is for a series or one value, not a table", '"unit"', "meaning"],
  ["a unit on a Takeaway", withOutputs([{ step: "usual", label: "x", shows: "takeaway", unit: "number" }]), "is for a series or one value, not a table", '"unit"', "meaning"],
  ["a unit on the Takeaway of a fit", withOutputs([{ step: "model", label: "x", shows: "takeaway", unit: "number" }]), "is for a series or one value, not a model", '"unit"', "meaning"],
  ["a title on a table", withOutputs([{ step: "lags", label: "x", shows: "table", title: "t" }]), "is for a Takeaway", '"title"', "meaning"],
  ["a note on a value", withOutputs([{ step: "rho", label: "x", shows: "value", unit: "number", note: "n" }]), "is for a Takeaway", '"note"', "meaning"],
  ["three fits", withSteps(Array.from({ length: 3 }, (_, i) => ({ id: `m${i}`, fn: "fit", of: "slot1", drivers: ["slot2"] })), { outputs: [{ step: "m0", label: "x", shows: "takeaway" }] }), "have 3 fits; at most 2 are allowed", '"steps"', "meaning"],
];

const ajv = new Ajv2020({ strict: false }).compile(ANALYSIS_RECIPE_SCHEMA_2 as object);
const ajvOne = new Ajv2020({ strict: false }).compile(ANALYSIS_RECIPE_SCHEMA as object);
const refusedWith = (file: string) => {
  const res = checkAnalysisRecipe(file);
  return res.ok ? null : res.problems;
};
const lineAt = (file: string, i: number) => file.slice(0, i).split("\n").length;

describe("checkAnalysisRecipe, format /2", () => {
  it("accepts a recipe with every kind of step and output", () => {
    const res = checkAnalysisRecipe(text(GOOD));
    expect(res.ok ? [] : res.problems).toEqual([]);
  });
  it("knows every function of /1 and the newer ones, and each new one has its kinds", () => {
    expect(Object.keys(FUNCTIONS).every((f) => f in FUNCTIONS_2)).toBe(true);
    for (const f of Object.keys(FUNCTIONS) as (keyof typeof FUNCTIONS)[]) expect(FUNCTIONS_2[f].gives).toBe(FUNCTIONS[f].gives);
    expect(ANALYSIS_FORMATS).toEqual(["ziffr.analysis/1", "ziffr.analysis/2"]);
  });
  it.each(HOSTILE)("refuses %s", (_, file, message, marker) => {
    const problems = refusedWith(file);
    expect(problems, "the file must be refused").not.toBeNull();
    expect(problems!.map((p) => p.message).join(" | ")).toContain(message);
    const line = marker === null ? null : typeof marker === "string" ? lineAt(file, file.indexOf(marker)) : "after" in marker ? lineAt(file, file.indexOf(marker.after)) + (marker.plus ?? 1) : "above" in marker ? lineAt(file, file.indexOf(marker.above)) - 1 : lineAt(file, file.lastIndexOf(marker.last));
    expect(problems!.find((p) => p.message.includes(message))?.line ?? null).toBe(line);
  });
  it("refuses more inputs than allowed, and exactly at the limit one step either side", () => {
    const partial = (i: number) => ({ id: `p${i}`, fn: "partialCorrelation", of: "slot1", with: "slot2", controls: ["slot3", "slot2", "slot1"].slice(0, 3) });
    // Each partial correlation names 1 + 1 + 3 = 5 inputs; a growth names 1. 8 partials are 40, and one more step is 41.
    const steps = (n: number, extra = 0) => [...Array.from({ length: n }, (_, i) => partial(i)), ...Array.from({ length: extra }, (_, i) => ({ id: `g${i}`, fn: "growth", of: "slot1" }))];
    const out = [{ step: "p0", label: "x", shows: "value", unit: "number" }];
    const at = (n: number, extra: number) => checkAnalysisRecipe(text({ ...GOOD, steps: steps(n, extra), outputs: out }));
    expect(at(7, 5).ok, "7 × 5 + 5 = 40 inputs").toBe(true);
    expect(at(8, 0).ok, "8 × 5 = 40 inputs").toBe(true);
    const over = at(8, 1);
    expect(over.ok, "41 inputs").toBe(false);
    expect(!over.ok && over.problems.map((p) => p.message).join()).toContain("name 41 inputs in all; at most 40 are allowed");
  });
  it("holds a fit to two, and three to none", () => {
    const fits = (n: number) => checkAnalysisRecipe(text({ ...GOOD, steps: Array.from({ length: n }, (_, i) => ({ id: `m${i}`, fn: "fit", of: "slot1", drivers: ["slot2"] })), outputs: [{ step: "m0", label: "x", shows: "takeaway" }] }));
    expect(fits(2).ok).toBe(true);
    expect(fits(3).ok).toBe(false);
  });
  it("round-trips: written, read and written again gives the same file", () => {
    const once = writeAnalysisRecipe(GOOD);
    expect(once.indexOf('"format"')).toBeLessThan(once.indexOf('"steps"'));
    const back = checkAnalysisRecipe(once);
    expect(back.ok && writeAnalysisRecipe(back.recipe)).toBe(once);
    expect(back.ok && back.recipe).toEqual(GOOD);
  });
  it("writes the fields of a step and an output in the format's order", () => {
    const once = writeAnalysisRecipe(GOOD);
    expect(once).toMatch(/"id": "part",\s+"fn": "partialCorrelation",\s+"of": "slot1",\s+"with": "slot2",\s+"controls": \[/);
    expect(once).toMatch(/"step": "usual",\s+"label": "Usual",\s+"shows": "takeaway",\s+"title": "What is usual",\s+"note":/);
  });
});

describe("what is no file at all, and where a problem is named", () => {
  it.each([["null", null], ["a number", 3], ["a text", "ziffr.analysis/2"], ["a list", []], ["a list of recipes", [GOOD]], ["nothing", undefined], ["an empty object", {}], ["true", true]])("refuses %s without failing", (_, value) => {
    const res = checkAnalysisRecipeValue(value);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.problems.length).toBeGreaterThan(0);
  });
  it("names no line where it was not given the file's lines", () => {
    const lines = (v: unknown) => {
      const res = checkAnalysisRecipeValue(v);
      return res.ok ? null : res.problems.map((p) => p.line);
    };
    // A format it does not know, a mistake of meaning in /2, one in /1, and one of the schema: none has a line to name.
    expect(lines({ ...GOOD, format: "ziffr.analysis/9" })).toEqual([null]);
    expect(lines({ ...GOOD, steps: [{ id: "a", fn: "growth", of: "nothing" }], outputs: [{ step: "a", label: "x", shows: "series", unit: "number" }] })).toEqual([null]);
    expect(lines({ format: "ziffr.analysis/1", name: "x", slots: [{ label: "A" }], steps: [{ id: "a", fn: "growth", of: "nothing" }], outputs: [{ step: "a", label: "x", unit: "number" }] })).toEqual([null]);
    expect(lines({ ...GOOD, code: 1 })).toEqual([null]);
  });
  it("names at most 50 problems, and exactly 50 of a file with more", () => {
    const steps = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, fn: "fit", of: `x${i}`, drivers: ["a", "b", "c", "d", "e", "f"] }));
    const res = checkAnalysisRecipeValue({ ...GOOD, steps, outputs: [{ step: "m0", label: "x", shows: "takeaway" }] });
    expect(!res.ok && res.problems.length).toBe(50);
  });
  it("keeps what a recipe's outputs draw to series and values that have a unit, whatever the file says", () => {
    const base = { ...GOOD, steps: GOOD.steps, outputs: [] as AnalysisRecipe2["outputs"] };
    const drawn = (...outputs: unknown[]) => drawnOutputs({ ...base, outputs: outputs as AnalysisRecipe2["outputs"] }).map((o) => o.step);
    expect(drawn({ step: "rho", label: "a", shows: "value", unit: "number" })).toEqual(["rho"]);
    expect(drawn({ step: "rho", label: "a", shows: "table", unit: "number" }), "a table has no mark").toEqual([]);
    expect(drawn({ step: "rho", label: "a", shows: "takeaway", unit: "number" }), "a Takeaway has no mark").toEqual([]);
    expect(drawn({ step: "rho", label: "a", shows: "value" }), "no unit, no way to write it").toEqual([]);
    expect(drawn({ step: "lags", label: "a", shows: "series", unit: "number" }), "a table is not a series").toEqual([]);
    expect(drawn({ step: "nothing", label: "a", shows: "value", unit: "number" }), "no such step").toEqual([]);
  });
});

describe("every limit, one step either side", () => {
  const ok = (v: unknown) => {
    const ours = checkAnalysisRecipeValue(v).ok;
    // Both validators say the same of everything that is only a matter of the schema.
    return { ours, theirs: ajv(v) === true };
  };
  const tag = (n: number, c = "x") => c.repeat(n);
  const cases: [string, (n: number) => unknown, number][] = [
    ["name", (n) => ({ ...GOOD, name: tag(n) }), RECIPE_LIMITS_2.name],
    ["description", (n) => ({ ...GOOD, description: tag(n) }), RECIPE_LIMITS_2.description],
    ["a Slot's label", (n) => ({ ...GOOD, slots: [{ label: tag(n) }, ...GOOD.slots.slice(1)] }), RECIPE_LIMITS_2.label],
    ["an output's label", (n) => ({ ...GOOD, outputs: [{ ...GOOD.outputs[0], label: tag(n) }, ...GOOD.outputs.slice(1)] }), RECIPE_LIMITS_2.label],
    ["a title", (n) => ({ ...GOOD, outputs: [...GOOD.outputs.slice(0, 4), { ...GOOD.outputs[4], title: tag(n) }, GOOD.outputs[5]] }), RECIPE_LIMITS_2.title],
    ["a note", (n) => ({ ...GOOD, outputs: [...GOOD.outputs.slice(0, 4), { ...GOOD.outputs[4], note: tag(n) }, GOOD.outputs[5]] }), RECIPE_LIMITS_2.note],
    ["the steps", (n) => ({ ...GOOD, steps: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, fn: "growth", of: "slot1" })), outputs: [{ step: "s0", label: "x", shows: "series", unit: "number" }] }), RECIPE_LIMITS_2.steps],
    ["the outputs", (n) => ({ ...GOOD, outputs: Array.from({ length: n }, (_, i) => ({ step: "rho", label: `o${i}`, shows: "value", unit: "number" })) }), RECIPE_LIMITS_2.outputs],
    ["the Slots", (n) => ({ ...GOOD, slots: Array.from({ length: n }, () => ({ label: "M" })) }), RECIPE_LIMITS_2.slots],
    ["the controls", (n) => ({ ...GOOD, steps: GOOD.steps.map((s) => (s.id === "part" ? { ...s, controls: ["slot3", "slot2", "slot1", "chg", "flat"].slice(0, n) } : s)) }), RECIPE_LIMITS_2.controls],
    ["the drivers", (n) => ({ ...GOOD, steps: GOOD.steps.map((s) => (s.id === "model" ? { ...s, drivers: ["slot2", "slot3", "chg", "flat", "smooth", "mid", "rho"].slice(0, n) } : s)) }), RECIPE_LIMITS_2.drivers],
  ];
  it.each(cases)("%s: at the limit it passes, one over it is refused", (name, make, limit) => {
    const at = ok(make(limit));
    const over = ok(make(limit + 1));
    // The lists name steps that exist only by their kind: only the length matters to the schema's side.
    expect(over.theirs, `${name}: Ajv one over`).toBe(false);
    expect(over.ours, `${name}: checks one over`).toBe(false);
    if (name !== "the steps" && name !== "the controls" && name !== "the drivers") {
      expect(at.theirs, `${name}: Ajv at the limit`).toBe(true);
      expect(at.ours, `${name}: checks at the limit`).toBe(true);
    }
  });
  it("the steps, the controls and the drivers pass at their limit through the checks and Ajv", () => {
    const twelve = { ...GOOD, steps: Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, fn: "growth", of: "slot1" })), outputs: [{ step: "s0", label: "x", shows: "series", unit: "number" }] };
    expect(ok(twelve)).toEqual({ ours: true, theirs: true });
    const four = { ...GOOD, steps: GOOD.steps.map((s) => (s.id === "part" ? { ...s, controls: ["slot3", "slot2", "chg", "flat"] } : s)) };
    expect(ok(four)).toEqual({ ours: true, theirs: true });
    const six = { ...GOOD, steps: GOOD.steps.map((s) => (s.id === "model" ? { ...s, drivers: ["slot2", "slot3", "chg", "flat", "smooth", "mid"] } : s)) };
    // `mid` is a value, which a fit cannot take: the schema accepts it, the checks refuse it, on the meaning alone.
    expect(ok(six)).toEqual({ ours: false, theirs: true });
  });
  const parameter: [string, number, number, string, string][] = [
    ["movingAverage", 2, 60, "window", "of"],
    ["seasonalIndex", 2, 53, "season", "of"],
    ["quantile", 1, 99, "percent", "of"],
    ["laggedCorrelation", 0, 6, "maxLag", "with"],
  ];
  it.each(parameter)("%s takes its parameter from %i to %i and nothing outside", (fn, lo, hi, key) => {
    const make = (n: number) => ({ ...GOOD, steps: [{ id: "x", fn, of: "slot1", ...(fn === "laggedCorrelation" ? { with: "slot2" } : {}), [key]: n }], outputs: [{ step: "x", label: "x", shows: fn === "laggedCorrelation" ? "table" : fn === "quantile" ? "value" : "series", ...(fn === "laggedCorrelation" ? {} : { unit: "number" }) }] });
    for (const [n, want] of [[lo - 1, false], [lo, true], [hi, true], [hi + 1, false], [lo + 0.5, false]] as const) expect(ok(make(n)), `${fn} ${key} ${n}`).toEqual({ ours: want, theirs: want });
  });
  it("a file is read up to 32,768 bytes, no further", () => {
    const base = text({ ...GOOD, description: "" });
    const pad = (n: number) => text({ ...GOOD, description: "x".repeat(n) });
    const fill = RECIPE_LIMITS_2.bytes - new TextEncoder().encode(pad(0)).length;
    expect(base.length).toBeGreaterThan(0);
    // The description is held to 300 characters, so the size is filled by white space.
    const padded = (extra: number) => `${text(GOOD)}${" ".repeat(extra)}`;
    const size = new TextEncoder().encode(text(GOOD)).length;
    expect(checkAnalysisRecipe(padded(RECIPE_LIMITS_2.bytes - size)).ok).toBe(true);
    expect(checkAnalysisRecipe(padded(RECIPE_LIMITS_2.bytes - size + 1)).ok).toBe(false);
    expect(fill).toBeGreaterThan(0);
  });
  it("a file nested 6 levels deep passes and 7 is refused", () => {
    // root 1, steps 2, a step 3, controls 4, an entry 5: the deepest this format makes is 5; two more levels of a list inside a field are refused.
    expect(checkAnalysisRecipe(text(GOOD)).ok).toBe(true);
    const deep = text({ ...GOOD, steps: GOOD.steps.map((s) => (s.id === "part" ? { ...s, controls: [["slot3"]] } : s)) });
    expect(checkAnalysisRecipe(deep).ok).toBe(false);
    const tooDeep = text({ ...GOOD, steps: GOOD.steps.map((s) => (s.id === "part" ? { ...s, controls: [[["slot3"]]] } : s)) });
    expect(refusedWith(tooDeep)!.map((p) => p.message).join()).toContain("nested more than 6 levels deep");
  });
});

describe("the published schema", () => {
  const path = repoFile("docs/reference/analysis-recipe-2.schema.json");
  const generated = `${JSON.stringify(ANALYSIS_RECIPE_SCHEMA_2, null, 2)}\n`;
  it("is the one the checks run", () => {
    if (process.env.UPDATE_REFERENCE) writeFileSync(path, generated);
    expect(readFileSync(path, "utf8")).toBe(generated);
  });
  it("is a JSON Schema another validator agrees with, on every hostile file", () => {
    expect(ajv(GOOD)).toBe(true);
    let schemaCases = 0;
    for (const [name, file, , , who] of HOSTILE) {
      let value: unknown;
      try {
        value = JSON.parse(file);
      } catch {
        continue;
      }
      const ours = checkAnalysisRecipeValue(value).ok;
      // Every case the checks refuse for the schema is refused by Ajv too; every case only the meaning can refuse, Ajv accepts.
      if (who === "schema") {
        schemaCases++;
        expect(ours, `${name}: the checks`).toBe(false);
        expect(ajv(value), `${name}: Ajv`).toBe(false);
      } else {
        expect(ours, `${name}: the checks`).toBe(false);
        expect(ajv(value), `${name}: Ajv accepts what only the meaning refuses`).toBe(true);
      }
    }
    expect(schemaCases).toBeGreaterThan(30);
  });
  it("leaves no way for a file in /2 to be valid in the schema and refused for a reason of the schema", () => {
    // What Ajv accepts the checks accept, unless the case is one of meaning (the table above names every one).
    for (const [name, file, , , who] of HOSTILE) {
      let value: unknown;
      try {
        value = JSON.parse(file);
      } catch {
        continue;
      }
      if (ajv(value) === true) expect(who, `${name} passes Ajv, so it must be a case of meaning`).toBe("meaning");
    }
  });
});

describe("files in /1 still load", () => {
  const packRecipes = (JSON.parse(readFileSync(repoFile("packs/saas-metrics.pack.json"), "utf8")).contents.analyses ?? []) as { key: string; recipe: unknown }[];
  const samples: [string, unknown][] = [...RECIPES.map((id) => [`built-in ${id}`, JSON.parse(readFileSync(new URL(`./analysis-recipes/${id}.json`, import.meta.url), "utf8"))] as [string, unknown]), ...packRecipes.map((p) => [`Pack ${p.key}`, p.recipe] as [string, unknown])];
  it("has samples to hold", () => expect(samples.length).toBeGreaterThanOrEqual(7));
  it.each(samples)("%s passes, stays in format /1 and is written back as it was", (_, file) => {
    const res = checkAnalysisRecipeValue(file);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.recipe.format).toBe("ziffr.analysis/1");
    expect(res.recipe).toEqual(file);
    expect(ajvOne(file)).toBe(true);
    expect(ajv(file)).toBe(false);
    const written = writeAnalysisRecipe(res.recipe);
    const again = checkAnalysisRecipe(written);
    expect(again.ok && writeAnalysisRecipe(again.recipe)).toBe(written);
  });
  it("a /1 file may not use a function that only /2 has", () => {
    const file = text({ ...JSON.parse(readFileSync(new URL("./analysis-recipes/trend.json", import.meta.url), "utf8")), steps: [{ id: "x", fn: "spearman", of: "slot1", with: "slot1" }] });
    expect(refusedWith(file)!.map((p) => p.message).join()).toContain("must be one of “movingAverage”");
  });
  it("the built-in recipes are all /1, and mean the same as before", () => {
    for (const id of RECIPES) expect(BUILT_IN_RECIPES[id].format).toBe("ziffr.analysis/1");
  });
  it("a /1 recipe is drawn by its outputs as before; a /2 recipe draws only its series and values", () => {
    expect(drawnOutputs(BUILT_IN_RECIPES["moving-average"]).map((o) => o.step)).toEqual(BUILT_IN_RECIPES["moving-average"].outputs.map((o) => o.step));
    expect(drawnOutputs(GOOD).map((o) => [o.step, o.gives])).toEqual([["smooth", "series"], ["rho", "value"]]);
    expect(drawnOutputs(null)).toEqual([]);
  });
});
