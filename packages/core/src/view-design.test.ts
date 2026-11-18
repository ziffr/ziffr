// The View Design format (spec 0024, #146): a good design passes, and a table of invalid and hostile files is refused
// with the right message and line. The table grows with every way of breaking a file found later.
import { readFileSync, writeFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { checkViewDesign, checkViewDesignValue, VIEW_DESIGN_SCHEMA, VIEW_LIMITS, writeViewDesign, type ViewDesign } from "./view-design";

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
  ["an unknown field", text({ ...EXAMPLE, script: "x" }), "“script” is not a field here", '"script"'],
  ["an unknown field in a mark", withPart({ mark: "plot", axes: "none", marks: [{ mark: "line", show: "values", onClick: "x" }] }), "“onClick” is not a field here", '"onClick"'],
  ["a style field", withPart({ mark: "text", content: ["a"], css: "color: red" }), "“css” is not a field here", '"css"'],
  ["an unknown mark", withPart({ mark: "iframe", src: "x" }), "must be one of “text”, “group”, “plot”, “gauge”, “rows”", '"iframe"'],
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
  ["an option that is not a setting", text({ ...EXAMPLE, options: { fetch: { default: 1 } } }), "“fetch” is not a field here", '"fetch"'],
  ["a switch with a word", text({ ...EXAMPLE, options: { showTarget: { default: "yes" } } }), "must be true or false, not a text", '"yes"'],
  ["a when that is not a flag", withPart({ mark: "text", when: ["always()"], content: ["a"] }), "must be one of “showTarget”", "always()"],
  ["an option it does not declare", withPart({ mark: "text", when: ["showForecast"], content: ["a"] }, { options: undefined }), "uses the option “showForecast”, which the design does not declare", '"showForecast"'],
  ["rows limited by an undeclared option", withPart({ mark: "rows", show: "values", limit: "rows" }), "uses the option “rows”", '"limit"'],
  ["pairs from one Metric", withPart({ mark: "plot", axes: "regular", x: "value", marks: [{ mark: "point", show: "pairs" }] }), "needs two Metrics", { after: '"marks": [' }],
  ["a correlation from one Metric", withPart({ mark: "text", content: [{ show: "correlation.r" }] }), "needs two Metrics", { after: '"content": [' }],
  ["pairs on a period axis", withPart({ mark: "plot", axes: "regular", marks: [{ mark: "point", show: "pairs" }] }, { slots: [{ label: "A", metrics: "one" }, { label: "B", metrics: "one" }] }), "A plot of pairs needs “x”: “value”", { after: '"parts": [' }],
  ["a prototype key", text(EXAMPLE).replace('"format"', '"__proto__": { "admin": true },\n  "format"'), "“__proto__” is not a field here", "__proto__"],
  ["a constructor key in a mark", withPart({ mark: "text", content: ["a"], constructor: { prototype: 1 } }), "“constructor” is not a field here", "constructor"],
  ["a 400-digit number", text(EXAMPLE).replace('"w": 6', `"w": ${"9".repeat(400)}`), "Expected “,” or “}”", "999"],
];

describe("checkViewDesign", () => {
  it("accepts a design with every kind of part", () => {
    const res = checkViewDesign(text(EXAMPLE));
    expect(res.ok ? [] : res.problems).toEqual([]);
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

describe("the published schema", () => {
  // The schema in docs/reference is generated from VIEW_DESIGN_SCHEMA, never written by hand. UPDATE_REFERENCE=1 writes it.
  const path = new URL("../../../docs/reference/view-design.schema.json", import.meta.url);
  const generated = `${JSON.stringify(VIEW_DESIGN_SCHEMA, null, 2)}\n`;

  it("is the one the checks run", () => {
    if (process.env.UPDATE_REFERENCE) writeFileSync(path, generated);
    expect(readFileSync(path, "utf8")).toBe(generated);
  });

  it("is a JSON Schema another validator agrees with, for the example and every hostile file that parses", () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(VIEW_DESIGN_SCHEMA as object);
    expect(validate(EXAMPLE)).toBe(true);
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
