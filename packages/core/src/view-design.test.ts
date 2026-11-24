// The View Design format (spec 0024, #146): a good design passes, and a table of invalid and hostile files is refused
// with the right message and line. The table grows with every way of breaking a file found later.
import { templateWidgetSettings } from "./dashboard-template-file";
import { readFileSync, writeFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { checkViewDesign, checkViewDesignValue, VIEW_DESIGN_SCHEMA, VIEW_LIMITS, writeViewDesign, type ViewDesign } from "./view-design";
import { DESIGNED_VIEWS } from "./built-in-designs";
import { repoFile } from "./test/repo-file";

/** A design using every kind of part and mark, as a designer might write it. */
export const EXAMPLE: ViewDesign = {
  format: "ziffr.view/1",
  name: "Line with forecast",
  description: "The trend, its target band and a forecast.",
  kind: "metric",
  slots: [{ label: "Metric", metrics: "one" }],
  size: { w: 6, h: 6 },
  options: { window: { label: "Periods", default: 12 }, showTarget: { default: true }, showForecast: { default: false } },
  parts: [
    { mark: "text", style: "caption", when: ["hasForecast"], content: ["Expected ", { show: "forecast.value" }, " by ", { show: "forecast.period" }] },
    {
      mark: "plot",
      axes: "regular",
      grid: "horizontal",
      scale: "padded",
      marks: [
        { mark: "band", show: "target", when: ["showTarget"] },
        { mark: "area", show: "forecast.range", when: ["showForecast"] },
        { mark: "line", show: "forecast", tone: "muted", dash: true, when: ["showForecast"] },
        { mark: "line", show: "values", tone: "data", detail: "full" },
      ],
    },
    { mark: "group", direction: "row", style: "caption", parts: [{ mark: "text", content: [{ show: "latest.period" }, { show: "latest.status" }] }] },
  ],
};

/** A design that draws an Analysis Recipe: a moving average as a line, the deviation as a text. */
export const WITH_RECIPE: ViewDesign = {
  ...EXAMPLE,
  name: "Line with its average",
  analysis: {
    format: "ziffr.analysis/1",
    name: "Average and spread",
    slots: [{ label: "Metric" }],
    steps: [{ id: "avg", fn: "movingAverage", of: "slot1", window: 3 }, { id: "sd", fn: "standardDeviation", of: "slot1" }],
    outputs: [{ step: "avg", label: "Three-period average", unit: "metric" }, { step: "sd", label: "Spread", unit: "metric" }],
  },
  parts: [
    { mark: "plot", axes: "regular", scale: "padded", marks: [{ mark: "line", show: "values", weight: "strong" }, { mark: "line", show: "recipe.avg", tone: "muted", dash: true }, { mark: "rule", show: "target.max" }] },
    { mark: "text", style: "note", content: ["Spread ", { show: "recipe.sd" }, ", average now ", { show: "recipe.avg" }] },
  ],
};
/** A design with a polar plot of a recipe's series and a radar of three Metrics. */
export const WITH_POLAR_AND_RADAR: ViewDesign = {
  ...EXAMPLE,
  name: "Pattern and profile",
  kind: "analysis",
  slots: [{ label: "Metrics", metrics: "several", min: 3 }],
  analysis: { ...WITH_RECIPE.analysis!, slots: [{ label: "Metric" }] },
  parts: [{ mark: "polar", show: "recipe.avg" }, { mark: "polar", show: "values" }, { mark: "radar", show: "latest" }, { mark: "radar", show: "latest", against: "previous" }],
};
/** A design with the formula tree of a Derived Metric (spec 0041, ticket 11): one Slot, whose Metric has the formula. */
export const WITH_BREAKDOWN_TREE: ViewDesign = { ...EXAMPLE, name: "Where the rows add up", slots: [{ label: "Metric with a breakdown", metrics: "one" }], parts: [{ mark: "tree", show: "breakdown" }] };
export const WITH_TREE: ViewDesign = {
  ...EXAMPLE,
  name: "Where the number comes from",
  slots: [{ label: "Derived Metric", metrics: "one" }],
  parts: [{ mark: "tree", show: "formula" }],
};
const text = (v: unknown) => JSON.stringify(v, null, 2);
const withPart = (part: unknown, extra: Record<string, unknown> = {}) => text({ ...EXAMPLE, ...extra, parts: [part] });
const deep = (n: number): unknown => (n === 0 ? "x" : { mark: "group", direction: "row", parts: [deep(n - 1)] });

// [what it is, the file's text, a part of the message expected, where the line it names starts (a text found in the
// file, whose line is the one expected; null: the problem has no line, such as the file's size)]
// A list's entries start on the line after the one that opens it: `{ after: '"parts": [' }`.
type Where = string | { after: string } | null;
const HOSTILE: [string, string, string, Where][] = [
  ["not JSON", "{ name: 'x' }", "Expected a field name in double quotes", "{"],
  ["empty", "", "ends too early", ""],
  ["a list, not a design", "[]", "must be an object", "["],
  ["trailing text", `${text(EXAMPLE)}\n x`, "more after the end", " x"],
  ["a field given twice", '{\n "name": "a",\n "name": "b"\n}', "given twice", '"b"'],
  ["a text over its line", '{\n "name": "a\n"}', "closing quote", '"a'],
  ["oversized", text({ ...EXAMPLE, description: "x".repeat(VIEW_LIMITS.bytes) }), "at most 65,536 are allowed", null],
  ["nested too deeply", JSON.stringify({ ...EXAMPLE, parts: [deep(12)] }), "nested more than 10 levels", "{"],
  ["no format", text({ ...EXAMPLE, format: undefined }), "needs the field “format”", "{"],
  ["a later version", text({ ...EXAMPLE, format: "ziffr.view/2" }), "format ziffr.view/2; this Ziffr reads ziffr.view/1", '"format"'],
  ["another format", text({ ...EXAMPLE, format: "vega-lite/5" }), "must be “ziffr.view/1”", '"format"'],
  ["an unknown field", text({ ...EXAMPLE, script: "x" }), "is not a field here", '"script"'],
  ["an unknown field in a mark", withPart({ mark: "plot", axes: "none", marks: [{ mark: "line", show: "values", onClick: "x" }] }), "is not a field here", '"onClick"'],
  ["a style field", withPart({ mark: "text", content: ["a"], css: "color: red" }), "is not a field here", '"css"'],
  ["an unknown mark", withPart({ mark: "iframe", src: "x" }), "must be one of “text”, “group”, “plot”, “gauge”, “rows”, “polar”, “radar”, “progress”", '"iframe"'],
  ["a progress mark of something else", withPart({ mark: "progress", show: "values" }), "must be “latest”", '"values"'],
  ["a progress mark with a style field", withPart({ mark: "progress", show: "latest", color: "red" }), "is not a field here", '"color"'],
  ["a progress mark of 13 Metrics", withPart({ mark: "progress", show: "latest" }, { slots: [{ label: "A", metrics: "several", min: 12 }, { label: "B", metrics: "one" }] }), "A progress mark draws 12 bars at most", { after: '"parts": [' }],
  ["a slope mark of something else", withPart({ mark: "slope", show: "values" }), "must be “latest”", '"values"'],
  ["a slope mark with a style field", withPart({ mark: "slope", show: "latest", color: "red" }), "is not a field here", '"color"'],
  ["a slope mark of 13 Metrics", withPart({ mark: "slope", show: "latest" }, { slots: [{ label: "A", metrics: "several", min: 12 }, { label: "B", metrics: "one" }] }), "A slope mark draws 12 rows at most", { after: '"parts": [' }],
  ["a slope option that is not a choice", withPart({ mark: "slope", show: "latest" }, { options: { slope: { default: "sideways" } } }), "must be one of", '"sideways"'],
  ["a cumulative mark of something else", withPart({ mark: "cumulative", show: "values" }), "must be “year”", '"values"'],
  ["a cumulative mark with a style field", withPart({ mark: "cumulative", show: "year", color: "red" }), "is not a field here", '"color"'],
  ["a part with no mark", withPart({ content: ["a"] }), "needs the field “mark”", { after: '"parts": [' }],
  ["a web address in a name", text({ ...EXAMPLE, name: "See https://evil.example" }), "plain text, without markup or web addresses", '"name"'],
  ["a bare www address", text({ ...EXAMPLE, name: "www.evil.example" }), "without markup or web addresses", '"name"'],
  ["a javascript: link", withPart({ mark: "text", content: ["JavaScript:alert(1)"] }), "without markup or web addresses", "JavaScript"],
  ["a data: address", withPart({ mark: "text", content: ["data:text/html,hi"] }), "without markup or web addresses", "data:"],
  ["a CSS url(", text({ ...EXAMPLE, description: "background: url(x)" }), "without markup or web addresses", "url("],
  ["HTML in a text", withPart({ mark: "text", content: ["<img src=x onerror=alert(1)>"] }), "without markup or web addresses", "<img"],
  ["a script tag", text({ ...EXAMPLE, empty: "<script>alert(1)</script>" }), "without markup or web addresses", "<script"],
  ["template braces", withPart({ mark: "text", content: ["{{constructor.constructor('x')()}}"] }), "without markup or web addresses", "{{"],
  ["a line break in a text", text({ ...EXAMPLE, name: "a\nb" }), "without markup or web addresses", '"name"'],
  ["a control character", text({ ...EXAMPLE, name: "a\u0000b" }), "without markup or web addresses", '"name"'],
  ["a backslash", text({ ...EXAMPLE, name: "a\\b" }), "without markup or web addresses", '"name"'],
  ["an over-long name", text({ ...EXAMPLE, name: "x".repeat(81) }), "81 characters; at most 80", '"name"'],
  ["an empty name", text({ ...EXAMPLE, name: "" }), "must not be empty", '"name"'],
  ["too many slots", text({ ...EXAMPLE, slots: Array(5).fill({ label: "M", metrics: "one" }) }), "5 entries; at most 4", '"slots"'],
  ["no slots", text({ ...EXAMPLE, slots: [] }), "must not be empty", '"slots"'],
  ["too many parts", text({ ...EXAMPLE, parts: Array(13).fill({ mark: "text", content: ["a"] }) }), "13 entries; at most 12", '"parts"'],
  ["too many marks in all", text({ ...EXAMPLE, parts: Array(12).fill({ mark: "group", direction: "row", parts: Array(4).fill({ mark: "text", content: ["a"] }) }) }), "60 parts and marks in all; at most 48", '"parts"'],
  ["a value it cannot show", withPart({ mark: "text", content: [{ show: "workspace.secrets" }] }), "must be one of “metric.name”", "workspace.secrets"],
  ["a computed value", withPart({ mark: "plot", axes: "none", marks: [{ mark: "line", show: "values * 2" }] }), "must be one of “values”, “forecast”, “target.line”", "values * 2"],
  ["a colour that is not a Theme token", withPart({ mark: "plot", axes: "none", marks: [{ mark: "line", show: "values", tone: "#ff0000" }] }), "must be one of “data”", "#ff0000"],
  ["a number where a word belongs", text({ ...EXAMPLE, kind: 3 }), "must be one of “metric”, “analysis”", '"kind"'],
  ["a fraction where a whole number belongs", text({ ...EXAMPLE, size: { w: 2.5, h: 4 } }), "must be a whole number, not a number", "2.5"],
  ["a size out of range", text({ ...EXAMPLE, size: { w: 99, h: 4 } }), "must be at most 12", "99"],
  ["a window out of range", text({ ...EXAMPLE, options: { window: { default: 100000 } } }), "must be at most 120", "100000"],
  ["an option that is not a setting", text({ ...EXAMPLE, options: { fetch: { default: 1 } } }), "is not a field here", '"fetch"'],
  ["a switch with a word", text({ ...EXAMPLE, options: { showTarget: { default: "yes" } } }), "must be true or false, not a text", '"yes"'],
  ["a when that is not a flag", withPart({ mark: "text", when: ["always()"], content: ["a"] }), "must be one of “showTarget”", "always()"],
  ["an option it does not declare", withPart({ mark: "text", when: ["showForecast"], content: ["a"] }, { options: undefined }), "uses the option “showForecast”, which the design does not declare", '"showForecast"'],
  ["rows limited by an undeclared option", withPart({ mark: "rows", show: "values", limit: "rows" }), "uses the option “rows”", '"limit"'],
  ["pairs from one Metric", withPart({ mark: "plot", axes: "regular", x: "value", marks: [{ mark: "point", show: "pairs" }] }), "needs two Metrics", { after: '"marks": [' }],
  ["a correlation from one Metric", withPart({ mark: "text", content: [{ show: "correlation.r" }] }), "needs two Metrics", { after: '"content": [' }],
  ["pairs on a period axis", withPart({ mark: "plot", axes: "regular", marks: [{ mark: "point", show: "pairs" }] }, { slots: [{ label: "A", metrics: "one" }, { label: "B", metrics: "one" }] }), "A plot of pairs needs “x”: “value”", { after: '"parts": [' }],
  // Polar and radar marks (spec 0041, ticket 10).
  ["a polar plot of a computed value", withPart({ mark: "polar", show: "values * 2" }), "must be one of “values”", "values * 2"],
  ["a polar plot with an unknown field", withPart({ mark: "polar", show: "values", rings: 9 }), "is not a field here", '"rings"'],
  ["a polar plot of a recipe output without an analysis", withPart({ mark: "polar", show: "recipe.avg" }), "but the design has no analysis", '"recipe.avg"'],
  ["a polar plot of one value", text({ ...WITH_RECIPE, parts: [{ mark: "polar", show: "recipe.sd" }] }), "“recipe.sd” gives one value; this mark needs a series", '"recipe.sd"'],
  ["a stacked mark of something else", withPart({ mark: "stacked", show: "values" }), "must be “breakdown”", '"values"'],
  ["a stacked mark with no show", withPart({ mark: "stacked" }), "needs the field “show”", { after: '"parts": [' }],
  ["a heatmap of something else", withPart({ mark: "heatmap", show: "latest" }), "must be “values”", '"latest"'],
  ["a heatmap with no show", withPart({ mark: "heatmap" }), "needs the field “show”", { after: '"parts": [' }],
  ["a radar of something else", withPart({ mark: "radar", show: "values" }), "must be “latest”", '"values"'],
  ["a radar against a target", withPart({ mark: "radar", show: "latest", against: "target" }, { slots: [{ label: "M", metrics: "several", min: 3 }] }), "must be “previous”", '"target"'],
  ["a radar of one Metric", withPart({ mark: "radar", show: "latest" }), "A radar needs 3 to 12 spokes", { after: '"parts": [' }],
  ["a radar of two Slots", withPart({ mark: "radar", show: "latest" }, { slots: [{ label: "A", metrics: "one" }, { label: "B", metrics: "one" }] }), "A radar needs 3 to 12 spokes", { after: '"parts": [' }],
  ["a radar of a Slot of several that may hold two", withPart({ mark: "radar", show: "latest" }, { slots: [{ label: "A", metrics: "several", min: 2 }] }), "A radar needs 3 to 12 spokes", { after: '"parts": [' }],
  ["a radar of 13 Slots' worth", withPart({ mark: "radar", show: "latest" }, { slots: [{ label: "A", metrics: "several", min: 12 }, { label: "B", metrics: "one" }] }), "A radar needs 3 to 12 spokes", { after: '"parts": [' }],
  // The scoreboard mark: one table of 3 to 12 Metrics.
  ["a scoreboard of one Metric", withPart({ mark: "scoreboard", show: "latest" }), "A scoreboard needs 3 to 12 Metrics", { after: '"parts": [' }],
  ["a scoreboard of a Slot of several that may hold two", withPart({ mark: "scoreboard", show: "latest" }, { slots: [{ label: "A", metrics: "several", min: 2 }] }), "A scoreboard needs 3 to 12 Metrics", { after: '"parts": [' }],
  ["a scoreboard that needs 13", withPart({ mark: "scoreboard", show: "latest" }, { slots: [{ label: "A", metrics: "several", min: 12 }, { label: "B", metrics: "one" }] }), "A scoreboard needs 3 to 12 Metrics", { after: '"parts": [' }],
  ["a scoreboard of something else", withPart({ mark: "scoreboard", show: "values" }, { slots: [{ label: "M", metrics: "several", min: 3 }] }), "must be “latest”", '"values"'],
  ["a scoreboard with a style field", withPart({ mark: "scoreboard", show: "latest", color: "red" }, { slots: [{ label: "M", metrics: "several", min: 3 }] }), "is not a field here", '"color"'],
  ["a radar with a style field", withPart({ mark: "radar", show: "latest", color: "red" }, { slots: [{ label: "M", metrics: "several", min: 3 }] }), "is not a field here", '"color"'],
  // The formula tree mark (spec 0041, ticket 11).
  ["a tree of something else", withPart({ mark: "tree", show: "values" }), "must be one of “formula”, “breakdown”", '"values"'],
  ["a tree of a recipe output", withPart({ mark: "tree", show: "recipe.avg" }), "must be one of “formula”, “breakdown”", '"recipe.avg"'],
  ["a tree with a style field", withPart({ mark: "tree", show: "formula", color: "red" }), "is not a field here", '"color"'],
  ["a tree with a formula of its own", withPart({ mark: "tree", show: "formula", formula: "{a} + {b}" }), "is not a field here", '"formula": "{a} + {b}"'],
  ["a tree without what it shows", withPart({ mark: "tree" }), "needs the field “show”", { after: '"parts": [' }],
  ["a prototype key", text(EXAMPLE).replace('"format"', '"__proto__": { "admin": true },\n  "format"'), "is not a field here", "__proto__"],
  ["a constructor key in a mark", withPart({ mark: "text", content: ["a"], constructor: { prototype: 1 } }), "is not a field here", "constructor"],
  // A design's Analysis Recipe (#151): checked as a recipe, and every "recipe." names an output of the right kind.
  ["a recipe output without an analysis", withPart({ mark: "plot", axes: "none", marks: [{ mark: "line", show: "recipe.avg" }] }), "but the design has no analysis", '"recipe.avg"'],
  ["a recipe step that is no output", text({ ...WITH_RECIPE, parts: [{ mark: "text", content: [{ show: "recipe.nothing" }] }] }), "“nothing” is not an output of the design's analysis", '"recipe.nothing"'],
  ["a value drawn as a line", text({ ...WITH_RECIPE, parts: [{ mark: "plot", axes: "none", marks: [{ mark: "line", show: "recipe.sd" }] }] }), "“recipe.sd” gives one value; this mark needs a series", '"recipe.sd"'],
  ["a series drawn as a rule", text({ ...WITH_RECIPE, parts: [{ mark: "plot", axes: "none", marks: [{ mark: "rule", show: "recipe.avg" }] }] }), "“recipe.avg” gives a series; this mark needs one value", '"recipe.avg"'],
  ["a recipe show with markup", text({ ...WITH_RECIPE, parts: [{ mark: "text", content: [{ show: "recipe.<b>" }] }] }), "or “recipe.” and a step of the design's analysis", '"recipe.<b>"'],
  ["an analysis with a function the library does not have", text({ ...WITH_RECIPE, analysis: { ...WITH_RECIPE.analysis!, steps: [{ id: "avg", fn: "fetch", of: "slot1" }] } }), "must be one of “movingAverage”", '"fetch"'],
  ["an analysis that reads a Metric by name", text({ ...WITH_RECIPE, analysis: { ...WITH_RECIPE.analysis!, steps: [{ id: "avg", fn: "mean", of: "revenue" }] } }), "“revenue” is neither a Slot of this recipe nor an earlier step", '"revenue"'],
  ["an analysis with more Slots than the design fills", text({ ...WITH_RECIPE, analysis: { ...WITH_RECIPE.analysis!, slots: [{ label: "A" }, { label: "B" }] } }), "the design fills at most 1", '"slots": [\n      {'],
  ["an unknown field in an analysis", text({ ...WITH_RECIPE, analysis: { ...WITH_RECIPE.analysis!, run: "x" } }), "is not a field here", '"run"'],
  ["a 400-digit number", text(EXAMPLE).replace('"w": 6', `"w": ${"9".repeat(400)}`), "Expected “,” or “}”", "999"],
];

describe("checkViewDesign", () => {
  it("accepts a design with every kind of part, and one that draws an Analysis Recipe", () => {
    const res = checkViewDesign(text(EXAMPLE));
    expect(res.ok ? [] : res.problems).toEqual([]);
    const withRecipe = checkViewDesign(text(WITH_RECIPE));
    expect(withRecipe.ok ? [] : withRecipe.problems).toEqual([]);
    // A stacked mark of a Breakdown is a View Design like any other (the built-in Stacked bars over time).
    expect(checkViewDesign(text({ ...EXAMPLE, parts: [{ mark: "stacked", show: "breakdown", when: ["manyValues"] }] })).ok).toBe(true);
    // A slope mark takes a Slot of several, and the option that says what it compares.
    expect(checkViewDesign(text({ ...EXAMPLE, slots: [{ label: "Metrics", metrics: "several" }], options: { slope: { label: "Compare", default: "metrics" } }, parts: [{ mark: "slope", show: "latest" }] })).ok).toBe(true);
    const polar = checkViewDesign(text(WITH_POLAR_AND_RADAR));
    expect(polar.ok ? [] : polar.problems).toEqual([]);
    const tree = checkViewDesign(text(WITH_TREE));
    expect(tree.ok ? [] : tree.problems).toEqual([]);
    const rows = checkViewDesign(text(WITH_BREAKDOWN_TREE));
    expect(rows.ok ? [] : rows.problems).toEqual([]);
    // A progress mark takes a Slot of several, or one Metric: it is one bar each.
    expect(checkViewDesign(text({ ...EXAMPLE, slots: [{ label: "Metrics", metrics: "several" }], parts: [{ mark: "progress", show: "latest" }] })).ok).toBe(true);
    expect(checkViewDesign(text({ ...EXAMPLE, parts: [{ mark: "progress", show: "latest" }] })).ok).toBe(true);
    // A cumulative mark takes one Metric.
    expect(checkViewDesign(text({ ...EXAMPLE, parts: [{ mark: "cumulative", show: "year" }] })).ok).toBe(true);
    // A heatmap of a Metric's values is a View Design like any other (the built-in Heatmap).
    expect(checkViewDesign(text({ ...EXAMPLE, parts: [{ mark: "heatmap", show: "values" }] })).ok).toBe(true);
    // Three Slots of one Metric each are three spokes as well.
    expect(checkViewDesign(text({ ...WITH_POLAR_AND_RADAR, analysis: undefined, parts: [{ mark: "radar", show: "latest" }], slots: ["A", "B", "C"].map((label) => ({ label, metrics: "one" })) })).ok).toBe(true);
    // A scoreboard of a Slot of several with at least three, or of three Slots.
    expect(checkViewDesign(text({ ...EXAMPLE, kind: "analysis", slots: [{ label: "Metrics", metrics: "several", min: 3 }], parts: [{ mark: "scoreboard", show: "latest" }] })).ok).toBe(true);
    expect(checkViewDesign(text({ ...EXAMPLE, kind: "analysis", slots: ["A", "B", "C"].map((label) => ({ label, metrics: "one" })), parts: [{ mark: "scoreboard", show: "latest" }] })).ok).toBe(true);
    const once = writeViewDesign(WITH_RECIPE);
    const back = checkViewDesign(once);
    expect(back.ok && writeViewDesign(back.design)).toBe(once);
  });

  it.each(HOSTILE)("refuses %s", (_, file, message, marker) => {
    const res = checkViewDesign(file);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.problems.map((p) => p.message).join(" | ")).toContain(message);
    const lineOf = (t: string) => file.slice(0, file.indexOf(t)).split("\n").length;
    const line = marker === null ? null : typeof marker === "string" ? lineOf(marker) : lineOf(marker.after) + 1;
    expect(res.problems.find((p) => p.message.includes(message))?.line ?? null).toBe(line);
  });

  it("accepts words that only look odd: a path with slashes is plain text, drawn as text", () => {
    expect(checkViewDesign(text({ ...EXAMPLE, description: "Revenue / orders, 50/50" })).ok).toBe(true);
  });

  it("accepts everyday punctuation and other scripts", () => {
    const ok = text({ ...EXAMPLE, name: "Umsatz (netto) – Q3: 12 % über Plan, “gut”", description: "売上 · Выручка · 50/50 & more…" });
    expect(checkViewDesign(ok).ok).toBe(true);
  });

  it("reads a __proto__ field as data: no object gains a property", () => {
    checkViewDesign(text(EXAMPLE).replace('"format"', '"__proto__": { "polluted": true },\n  "format"'));
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("names at most 50 problems, and does not walk a list that is already too long", () => {
    const many = text({ ...EXAMPLE, parts: Array.from({ length: 12 }, () => ({ mark: "group", direction: "row", parts: Array.from({ length: 12 }, () => ({ mark: "text", content: ["a"], x: 1, y: 2, z: 3 })) })) });
    const res = checkViewDesign(many);
    expect(res.ok ? 0 : res.problems.length).toBe(50);
    const long = checkViewDesign(text({ ...EXAMPLE, slots: Array(500).fill({ label: "<b>", metrics: "x" }) }));
    expect(long.ok ? [] : long.problems.map((p) => p.path)).toEqual(["slots"]);
  });

  it("names every problem, not only the first", () => {
    const res = checkViewDesign(text({ ...EXAMPLE, name: "", kind: "chart", x: 1 }));
    expect(res.ok ? 0 : res.problems.length).toBe(3);
  });

  it("reads a design already parsed", () => {
    expect(checkViewDesignValue(EXAMPLE).ok).toBe(true);
    expect(checkViewDesignValue(null).ok).toBe(false);
  });
});

describe("writeViewDesign", () => {
  it("writes the fields in the format's order, so a round trip gives the same file", () => {
    const shuffled = JSON.parse(JSON.stringify({ parts: EXAMPLE.parts, size: EXAMPLE.size, format: EXAMPLE.format, slots: EXAMPLE.slots, kind: EXAMPLE.kind, name: EXAMPLE.name, options: EXAMPLE.options, description: EXAMPLE.description }));
    const once = writeViewDesign(shuffled);
    expect(once.indexOf('"format"')).toBeLessThan(once.indexOf('"name"'));
    const back = checkViewDesign(once);
    expect(back.ok).toBe(true);
    if (back.ok) expect(writeViewDesign(back.design)).toBe(once);
  });
});

describe("$schema, for editors", () => {
  const withSchema = { $schema: "https://docs.ziffr.net/schemas/ziffr.view-1.json", ...EXAMPLE };

  it("is accepted at the top and dropped, so a saved design never holds it", () => {
    const r = checkViewDesign(JSON.stringify(withSchema));
    expect(r.ok).toBe(true);
    if (r.ok) expect("$schema" in r.design).toBe(false);
  });

  it("starts every file Ziffr writes, and a file brought back and written again is the same file", () => {
    const once = writeViewDesign(EXAMPLE);
    expect(once.startsWith('{\n  "$schema": "https://docs.ziffr.net/schemas/ziffr.view-1.json",\n  "format"')).toBe(true);
    const back = checkViewDesign(once);
    expect(back.ok).toBe(true);
    if (back.ok) expect(writeViewDesign(back.design)).toBe(once);
  });

  it("is only a short string, and no other unknown field gets in beside it", () => {
    expect(checkViewDesign(JSON.stringify({ ...withSchema, $schema: 5 })).ok).toBe(false);
    expect(checkViewDesign(JSON.stringify({ ...withSchema, $schema: "x".repeat(201) })).ok).toBe(false);
    expect(checkViewDesign(JSON.stringify({ ...withSchema, $id: "https://example.com" })).ok).toBe(false);
    expect(checkViewDesign(JSON.stringify({ ...withSchema, other: 1 })).ok).toBe(false);
  });

  it("is not a place for text the checks refuse elsewhere: a name with a web address is still refused", () => {
    expect(checkViewDesign(JSON.stringify({ ...withSchema, name: "see https://example.com" })).ok).toBe(false);
  });
});

describe("the guide's table of the built-in Views", () => {
  it("names every built-in design", () => {
    const guide = readFileSync(repoFile("docs/guides/view-designs.md"), "utf8");
    for (const id of DESIGNED_VIEWS) expect(guide, id).toContain(`(\`${id}\`)`);
  });
});

describe("$schema from outside", () => {
  it("is never written back out: an export carries Ziffr's own address, whatever came in", () => {
    const foreign = { ...EXAMPLE, $schema: "https://evil.example/s.json" } as unknown as typeof EXAMPLE;
    const out = writeViewDesign(foreign);
    expect(out).not.toContain("evil.example");
    expect(out.startsWith('{\n  "$schema": "https://docs.ziffr.net/schemas/ziffr.view-1.json"')).toBe(true);
  });

  it("is not kept in the widget a template's inline design makes", () => {
    const s = templateWidgetSettings({ design: { $schema: "https://evil.example/s.json", ...EXAMPLE } as never }, new Map());
    expect(s?.design?.body).toBeDefined();
    expect(JSON.stringify(s)).not.toContain("evil.example");
  });
});

describe("Placeholders in a design's texts", () => {
  it("accepts the known ones in words, before and after, and refuses any other braces", () => {
    const ok = withPart({ mark: "text", content: ["{metric}: {latest} ({change yoy}) vs {metric 2}", { show: "latest.value", before: "{period} ", after: " {target}" }] });
    expect(checkViewDesign(ok).ok).toBe(true);
    expect(checkViewDesign(withPart({ mark: "text", content: ["{unknown}"] })).ok).toBe(false);
    expect(checkViewDesign(withPart({ mark: "text", content: [{ show: "latest.value", before: "{x}" }] })).ok).toBe(false);
  });
});

describe("the published schema", () => {
  // The schema in docs/reference is generated from VIEW_DESIGN_SCHEMA, never written by hand. UPDATE_REFERENCE=1 writes it.
  const path = repoFile("docs/reference/view-design.schema.json");
  const generated = `${JSON.stringify(VIEW_DESIGN_SCHEMA, null, 2)}\n`;

  it("is the one the checks run", () => {
    if (process.env.UPDATE_REFERENCE) writeFileSync(path, generated);
    expect(readFileSync(path, "utf8")).toBe(generated);
  });

  it("is a JSON Schema another validator agrees with, for the example and every hostile file that parses", () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(VIEW_DESIGN_SCHEMA as object);
    expect(validate(EXAMPLE)).toBe(true);
    expect(validate(WITH_POLAR_AND_RADAR)).toBe(true);
    expect(validate(WITH_TREE)).toBe(true);
    expect(validate(WITH_BREAKDOWN_TREE)).toBe(true);
    for (const [name, file] of HOSTILE) {
      let value: unknown;
      try {
        value = JSON.parse(file);
      } catch {
        continue;
      }
      const ours = checkViewDesignValue(value);
      // Ours also checks what a schema cannot say (versions, limits across the file, what parts need); where the
      // schema alone refuses, both refuse.
      if (validate(value) === false) expect(ours.ok, name).toBe(false);
      if (ours.ok) expect(validate(value), name).toBe(true);
    }
  });
});
