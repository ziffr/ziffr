// The View Design format, ziffr.view/1 (GLOSSARY: View Design): a View written as a file of Slots, marks and what each
// shows, drawn by Ziffr's own renderer. Plain data, never code: the schema below is the only definition, checked on the
// server whenever a design is saved and in the Playground as it is typed, and docs/reference is generated from it.
// Security: nothing in a design is run. It holds no web addresses, HTML, scripts or styles, unknown fields are
// refused, and every number it shows comes from the core's verified functions, never from the file.
import { checkSchema, parseJson, type Problem, type Schema } from "./json-check.js";
import { plainText } from "./file-text.js";
import { ANALYSIS_RECIPE_SCHEMA, ANALYSIS_RECIPE_SCHEMA_2, checkAnalysisRecipeValue, drawnOutputs, type AnyAnalysisRecipe } from "./analysis-recipe.js";

/** The format this Ziffr writes; it reads every version in `VIEW_FORMATS`. */
export const VIEW_FORMAT = "ziffr.view/1";
/** Every View Design format Ziffr ever published, oldest first. A file made in any of them still loads. */
export const VIEW_FORMATS = [VIEW_FORMAT] as const;

/** The exact limits a View Design is held to, so a file can never be large enough to slow down anyone who opens it. */
export const VIEW_LIMITS = { bytes: 65_536, depth: 10, slots: 4, parts: 12, marksInPlot: 12, partsInGroup: 12, pieces: 12, marks: 48, name: 80, description: 300, label: 60, text: 200 } as const;

/** What a mark may show of a Metric's values: always computed by the core (shownSeries, the forecast), never by a design. */
export type SeriesShow = "values" | "forecast" | "target.line" | RecipeShow;
/** An output of the design's Analysis Recipe, by its step: computed by the library's verified functions. */
export type RecipeShow = `recipe.${string}`;
/** The values a text may show, each written by the core (formatValue in the Number Style, pointName, compare). */
export type TextShow = (typeof TEXT_SHOWS)[number] | RecipeShow;
/** A colour, always a Theme token: so a design fits every Theme. */
export type Tone = (typeof TONES)[number];
/** When a part is drawn: an option that is on, or something the data has. All must hold. */
export type Flag = (typeof FLAGS)[number];
/** How a text looks, from the Theme's type scale. */
export type TextStyle = (typeof TEXT_STYLES)[number];

/** A piece of a text: words of the design (drawn as text, always), or a value the core writes. */
export type Piece = string | { show: TextShow; style?: "strong"; before?: string; after?: string };

/** A mark inside a plot: drawn against the plot's scales. */
export type PlotMark =
  | { mark: "line"; show: SeriesShow; tone?: Tone; detail?: "plain" | "full"; dash?: boolean; weight?: "light" | "regular" | "strong"; when?: Flag[] }
  | { mark: "area"; show: "forecast.range"; tone?: Tone; when?: Flag[] }
  | { mark: "bar"; show: "values" | RecipeShow; tone?: Tone; when?: Flag[] }
  | { mark: "point"; show: "pairs" | "drivers.pairs"; tone?: Tone; when?: Flag[] }
  | { mark: "band"; show: "target"; when?: Flag[] }
  | { mark: "rule"; show: "target.min" | "target.max" | RecipeShow; tone?: Tone; when?: Flag[] };

/** A part of a design's layout, drawn top to bottom (or side by side in a row group). */
export type Part =
  | { mark: "text"; content: Piece[]; style?: TextStyle; when?: Flag[] }
  | { mark: "group"; direction: "row" | "column"; align?: "start" | "center"; style?: TextStyle; parts: Part[]; when?: Flag[] }
  | { mark: "plot"; axes: "none" | "compact" | "regular"; x?: "period" | "value"; grid?: "none" | "horizontal" | "both"; scale?: "padded" | "auto" | "tight"; marks: PlotMark[]; when?: Flag[] }
  | { mark: "gauge"; show: "latest"; when?: Flag[] }
  | { mark: "rows"; show: "values" | "correlations" | "matrix" | "reasons"; limit?: "rows" | number; when?: Flag[] }
  | { mark: "polar"; show: "values" | RecipeShow; when?: Flag[] }
  | { mark: "radar"; show: "latest"; against?: "previous"; when?: Flag[] }
  | { mark: "bump"; show: "breakdown"; when?: Flag[] };

/** How many spokes (a radar) or periods (a polar plot) are drawn, at least and at most: fewer than 3 is a line, more than 12 cannot be read. */
export const SPOKES = { min: 3, max: 12 } as const;

/** A place a design is filled with Metrics when it is used (GLOSSARY: Slot): one, or several for small multiples. */
export type DesignSlot = { label: string; metrics: "one" | "several"; min?: number };

/** What a person may change when placing a design, with its default (GLOSSARY: Widget settings). */
export type DesignOptions = {
  window?: { label?: string; default: number };
  rows?: { label?: string; default: number };
  showTarget?: { label?: string; default: boolean };
  showForecast?: { label?: string; default: boolean };
  /** It may be shown by a longer period than the Metric's own (GLOSSARY: Display Period); the Metric's own by default. */
  display?: { label?: string };
};

/** A View written as a file (GLOSSARY: View Design), in the newest format. */
export type ViewDesign = {
  format: typeof VIEW_FORMAT;
  name: string;
  description?: string;
  kind: "metric" | "analysis";
  slots: DesignSlot[];
  size: { w: number; h: number };
  options?: DesignOptions;
  /** What it says while a Slot is not filled or its Metrics have too little in common. */
  empty?: string;
  /** An Analysis Recipe the design draws: its Slots are the design's first Metrics, in order. */
  analysis?: AnyAnalysisRecipe;
  parts: Part[];
};

const TEXT_SHOWS = [
  "metric.name", "latest.value", "latest.period", "latest.status", "latest.approval", "target.note",
  "forecast.value", "forecast.period", "forecast.low", "forecast.high",
  "correlation.strength", "correlation.r", "correlation.over",
  "drivers.name", "drivers.strength", "drivers.over",
] as const;
const TONES = ["data", "muted", "ink", "good", "bad", "accent", "status"] as const;
const FLAGS = ["showTarget", "showForecast", "hasForecast", "hasNote", "manyValues"] as const;
const TEXT_STYLES = ["headline", "value", "body", "caption", "note"] as const;

const text = (max: number, description: string): Schema => plainText(max, description);
const flags: Schema = { type: "array", maxItems: FLAGS.length, items: { enum: [...FLAGS] }, description: "Drawn only when all of these hold: showTarget and showForecast are the options; hasForecast, hasNote and manyValues (two or more values) are about the data." };
const esc = (x: string) => x.replace(/\./g, "\\.");
// What a mark shows: one of the core's results, or "recipe." and a step of the design's Analysis Recipe.
const shows = (names: readonly string[], recipe: boolean, what: string): Schema => ({
  type: "string",
  pattern: `^(?:${names.map(esc).join("|")}${recipe ? "|recipe\\.[a-z][a-zA-Z0-9]{0,23}" : ""})$`,
  description: `one of ${names.map((n) => `“${n}”`).join(", ")}${recipe ? `, or “recipe.” and a step of the design's analysis` : ""} (${what})`,
});
const tone: Schema = { enum: [...TONES], description: "A Theme colour: data, muted, ink, good, bad, accent, or status (by the target: bad when off target)." };
const mark = (name: string, description: string, props: Record<string, Schema>, required: string[] = []): Schema => ({
  type: "object",
  description,
  properties: { mark: { const: name }, ...props, when: { $ref: "#/$defs/when" } },
  required: ["mark", ...required],
  additionalProperties: false,
});

/** The JSON Schema of ziffr.view/1: the one definition the checks run and docs/reference is generated from. */
export const VIEW_DESIGN_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.net/schemas/ziffr.view-1.json",
  title: "Ziffr View Design (ziffr.view/1)",
  description: "A View written as a file: its Slots, its marks and what each shows, and its Theme colours. It holds no code.",
  type: "object",
  properties: {
    format: { const: VIEW_FORMAT, description: "The format and its version." },
    name: { ...text(VIEW_LIMITS.name, "plain text, without markup or web addresses"), minLength: 1 },
    description: text(VIEW_LIMITS.description, "plain text, without markup or web addresses"),
    kind: { enum: ["metric", "analysis"], description: "Draws one Metric, or analyses several." },
    slots: { type: "array", minItems: 1, maxItems: VIEW_LIMITS.slots, items: { $ref: "#/$defs/slot" }, description: "The Metrics it takes, in order." },
    size: {
      type: "object",
      description: "Its size when placed on a dashboard, in grid columns and rows.",
      properties: { w: { type: "integer", minimum: 1, maximum: 12 }, h: { type: "integer", minimum: 2, maximum: 24 } },
      required: ["w", "h"],
      additionalProperties: false,
    },
    options: {
      type: "object",
      description: "What a person may change when placing it, with the defaults.",
      properties: {
        window: { $ref: "#/$defs/countOption" },
        rows: { $ref: "#/$defs/countOption" },
        showTarget: { $ref: "#/$defs/switchOption" },
        showForecast: { $ref: "#/$defs/switchOption" },
        display: {
          type: "object",
          description: "It may be shown by a longer period than the Metric's own, its values combined by the Metric's Aggregation (Show by).",
          properties: { label: text(VIEW_LIMITS.label, "plain text, without markup or web addresses") },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    empty: text(VIEW_LIMITS.text, "plain text, without markup or web addresses"),
    analysis: {
      oneOf: [ANALYSIS_RECIPE_SCHEMA, ANALYSIS_RECIPE_SCHEMA_2].map((r) => ({ ...r, $schema: undefined, $id: undefined, title: undefined, description: undefined })),
      description: "An Analysis Recipe (ziffr.analysis/1 or ziffr.analysis/2) the design draws; its Slots are the design's first Metrics, in order.",
    },
    parts: { type: "array", minItems: 1, maxItems: VIEW_LIMITS.parts, items: { $ref: "#/$defs/part" }, description: "What it draws, top to bottom." },
  },
  required: ["format", "name", "kind", "slots", "size", "parts"],
  additionalProperties: false,
  $defs: {
    when: flags,
    slot: {
      type: "object",
      properties: {
        label: { ...text(VIEW_LIMITS.label, "plain text, without markup or web addresses"), minLength: 1 },
        metrics: { enum: ["one", "several"], description: "One Metric, or several (small multiples, a matrix)." },
        min: { type: "integer", minimum: 1, maximum: 12, description: "For several: how many it needs at least." },
      },
      required: ["label", "metrics"],
      additionalProperties: false,
    },
    countOption: {
      type: "object",
      properties: { label: text(VIEW_LIMITS.label, "plain text, without markup or web addresses"), default: { type: "integer", minimum: 1, maximum: 120 } },
      required: ["default"],
      additionalProperties: false,
    },
    switchOption: {
      type: "object",
      properties: { label: text(VIEW_LIMITS.label, "plain text, without markup or web addresses"), default: { type: "boolean" } },
      required: ["default"],
      additionalProperties: false,
    },
    piece: {
      oneOf: [
        text(VIEW_LIMITS.text, "plain text, without markup or web addresses"),
        {
          type: "object",
          description: "A value the core writes, in the Workspace's Number Style.",
          properties: {
            show: shows(TEXT_SHOWS, true, "a value the core writes"),
            style: { enum: ["strong"] },
            before: text(VIEW_LIMITS.label, "plain text, without markup or web addresses"),
            after: text(VIEW_LIMITS.label, "plain text, without markup or web addresses"),
          },
          required: ["show"],
          additionalProperties: false,
        },
      ],
    },
    part: {
      oneOf: [
        mark("text", "Words and values, drawn as text.", { content: { type: "array", minItems: 1, maxItems: VIEW_LIMITS.pieces, items: { $ref: "#/$defs/piece" } }, style: { enum: [...TEXT_STYLES] } }, ["content"]),
        mark("group", "Parts side by side (a row) or stacked (a column).", {
          direction: { enum: ["row", "column"] },
          align: { enum: ["start", "center"] },
          style: { enum: [...TEXT_STYLES] },
          parts: { type: "array", minItems: 1, maxItems: VIEW_LIMITS.partsInGroup, items: { $ref: "#/$defs/part" } },
        }, ["direction", "parts"]),
        mark("plot", "A chart: marks against a period or value axis and a value axis.", {
          axes: { enum: ["none", "compact", "regular"] },
          x: { enum: ["period", "value"] },
          grid: { enum: ["none", "horizontal", "both"] },
          scale: { enum: ["padded", "auto", "tight"] },
          marks: { type: "array", minItems: 1, maxItems: VIEW_LIMITS.marksInPlot, items: { $ref: "#/$defs/plotMark" } },
        }, ["axes", "marks"]),
        mark("gauge", "Where the latest value sits against the target.", { show: { const: "latest" } }, ["show"]),
        mark("rows", "Table rows: the latest values; the Metrics ranked by how much they move with the first (correlations), or every pair (matrix); or why Metrics were left out of a comparison (reasons).", { show: { enum: ["values", "correlations", "matrix", "reasons"] }, limit: { oneOf: [{ type: "string", enum: ["rows"] }, { type: "integer", minimum: 1, maximum: 120 }] } }, ["show"]),
        mark("polar", `Values around a circle: the periods of a series as angles in the order given, the values as the distance from the centre, which is 0; ${SPOKES.min} to ${SPOKES.max} periods, none below 0.`, { show: shows(["values"], true, "a series") }, ["show"]),
        mark("radar", `Several Metrics as spokes on one shape, in the order of the Slots, ${SPOKES.min} to ${SPOKES.max} of them: each spoke has its own scale, from the Metric's lowest value of the periods shown at the centre to its highest at the rim. With against, the period before is drawn as a second, dashed shape.`, { show: { const: "latest" }, against: { const: "previous" } }, ["show"]),
        mark("bump", "A bump chart: one line per row of the Metric's Breakdown across its periods, the vertical axis the rank (1 at the top) and not the value; at most 8 rows (the best average rank), a row a period lacks is a gap and never last, ties share the better rank, and the row that gained the most places says so in words; a period without a Breakdown is left out and counted.", { show: { const: "breakdown" } }, ["show"]),
      ],
    },
    plotMark: {
      oneOf: [
        mark("line", "A line through the values.", { show: shows(["values", "forecast", "target.line"], true, "a series"), tone, detail: { enum: ["plain", "full"] }, dash: { type: "boolean" }, weight: { enum: ["light", "regular", "strong"], description: "light: a fine line, slightly faded; strong: the line of a Metric's own values." } }, ["show"]),
        mark("area", "A filled range.", { show: { const: "forecast.range" }, tone }, ["show"]),
        mark("bar", "One bar per period.", { show: shows(["values"], true, "a series"), tone }, ["show"]),
        mark("point", "One point per period two Metrics share: the first against the second (pairs), or against the one that moves most with it (drivers.pairs).", { show: { enum: ["pairs", "drivers.pairs"] }, tone }, ["show"]),
        mark("band", "The target range.", { show: { const: "target" } }, ["show"]),
        mark("rule", "A straight line across the plot.", { show: shows(["target.min", "target.max"], true, "one value"), tone }, ["show"]),
      ],
    },
  },
};

/** The result of checking a View Design: the design, or every problem found with its line. */
export type DesignCheck = { ok: true; design: ViewDesign } | { ok: false; problems: Problem[] };

/** Checks a View Design's text: size and depth, the schema, then what the schema cannot say. Runs on every save. */
export function checkViewDesign(textIn: string): DesignCheck {
  const parsed = parseJson(textIn, { maxBytes: VIEW_LIMITS.bytes, maxDepth: VIEW_LIMITS.depth });
  if (!parsed.ok) return parsed;
  return checkViewDesignValue(parsed.value, parsed.lines);
}

/** Checks a View Design already read from JSON (`lines` names where each path starts, when known). */
export function checkViewDesignValue(value: unknown, lines: Map<string, number> = new Map(), schema: Schema = VIEW_DESIGN_SCHEMA): DesignCheck {
  const fmt = value && typeof value === "object" && !Array.isArray(value) ? (value as { format?: unknown }).format : undefined;
  // An unknown version is named as one, not as a list of fields that do not fit.
  if (typeof fmt === "string" && fmt.startsWith("ziffr.view/") && !(VIEW_FORMATS as readonly string[]).includes(fmt))
    return { ok: false, problems: [{ path: "format", line: lines.get("format") ?? null, message: `This file is in format ${fmt}; this Ziffr reads ${VIEW_FORMATS.join(", ")}. Update Ziffr, or save the design again in ${VIEW_FORMAT}.` }] };
  const problems = checkSchema(schema, value, lines);
  if (problems.length) return { ok: false, problems };
  const design = value as ViewDesign;
  const more = meaning(design, lines);
  return more.length ? { ok: false, problems: more } : { ok: true, design };
}

/** What the schema cannot say: limits across the whole file, and parts that need what the design does not declare. */
function meaning(d: ViewDesign, lines: Map<string, number>): Problem[] {
  const out: Problem[] = [];
  const at = (path: string, message: string) => out.push({ path, line: lines.get(path) ?? null, message });
  const metrics = d.slots.reduce((n, s) => n + (s.metrics === "several" ? 2 : 1), 0);
  // The fewest Metrics the design always has: a Slot of several holds at least its "min".
  const fewest = d.slots.reduce((n, s) => n + (s.metrics === "several" ? (s.min ?? 1) : 1), 0);
  let count = 0;
  const flagsOk = (when: Flag[] | undefined, path: string) => {
    for (const [n, f] of (when ?? []).entries()) if ((f === "showTarget" || f === "showForecast") && !d.options?.[f]) at(`${path}.when[${n}]`, `uses the option “${f}”, which the design does not declare under options.`);
  };
  const needsTwo = (path: string, what: string) => {
    if (metrics < 2) at(path, `${what} needs two Metrics: give the design a second Slot, or a Slot of several.`);
  };
  const walk = (parts: Part[], path: string) =>
    parts.forEach((p, n) => {
      const here = `${path}[${n}]`;
      count++;
      flagsOk(p.when, here);
      if (p.mark === "group") walk(p.parts, `${here}.parts`);
      if (p.mark === "plot") {
        p.marks.forEach((m, k) => {
          count++;
          flagsOk(m.when, `${here}.marks[${k}]`);
          if (m.mark === "point") needsTwo(`${here}.marks[${k}]`, "A point mark of pairs");
        });
        const pairs = p.marks.some((m) => m.mark === "point");
        if (pairs !== (p.x === "value")) at(here, pairs ? "A plot of pairs needs “x”: “value”." : "A plot with “x”: “value” draws pairs: give it a point mark.");
      }
      if (p.mark === "text")
        p.content.forEach((c, k) => {
          if (typeof c !== "string" && (c.show.startsWith("correlation.") || c.show.startsWith("drivers."))) needsTwo(`${here}.content[${k}]`, `“${c.show}”`);
        });
      if (p.mark === "rows" && p.limit === "rows" && !d.options?.rows) at(`${here}.limit`, "uses the option “rows”, which the design does not declare under options.");
      if (p.mark === "rows" && p.show !== "values") needsTwo(here, `Rows of ${p.show}`);
      if (p.mark === "radar" && (fewest < SPOKES.min || fewest > SPOKES.max)) at(here, `A radar needs ${SPOKES.min} to ${SPOKES.max} spokes: give the design ${SPOKES.min} Slots, or a Slot of several with “min”: ${SPOKES.min}, and no more than ${SPOKES.max} in all.`);
    });
  walk(d.parts, "parts");
  recipeUse(d, lines, at);
  if (count > VIEW_LIMITS.marks) at("parts", `has ${count} parts and marks in all; at most ${VIEW_LIMITS.marks} are allowed.`);
  return out;
}

/** The design's analysis and what its marks show of it: each "recipe." names an output step of the right kind. */
function recipeUse(d: ViewDesign, lines: Map<string, number>, at: (path: string, message: string) => void) {
  if (d.analysis) {
    const sub = new Map([...lines].filter(([k]) => k.startsWith("analysis")).map(([k, v]) => [k.replace(/^analysis\.?/, ""), v]));
    const res = checkAnalysisRecipeValue(d.analysis, sub);
    if (!res.ok) for (const p of res.problems) at(p.path ? `analysis.${p.path}` : "analysis", p.message);
    const metrics = d.slots.reduce((n, s) => n + (s.metrics === "several" ? 2 : 1), 0);
    if (d.analysis.slots.length > metrics) at("analysis.slots", `The analysis has ${d.analysis.slots.length} Slots; the design fills at most ${metrics}.`);
  }
  // What a mark may draw of a step: a series or one value that an output shows with a unit; any other output (a table, a
  // Takeaway) is not drawn by a mark yet, and is said so.
  const kind = (step: string): "series" | "value" | "other" | null => {
    if (!d.analysis?.outputs.some((o) => o.step === step)) return null;
    return drawnOutputs(d.analysis).find((o) => o.step === step)?.gives ?? "other";
  };
  const use = (show: string, path: string, wants: "series" | "value" | "any") => {
    if (!show.startsWith("recipe.")) return;
    const step = show.slice("recipe.".length);
    if (!d.analysis) return at(path, `shows “${show}”, but the design has no analysis.`);
    const k = kind(step);
    if (!k) return at(path, `“${step}” is not an output of the design's analysis.`);
    if (k === "other") return at(path, `“${show}” is a table, a fit or a Takeaway, or has no unit; marks draw a series or one value.`);
    if (wants !== "any" && k !== wants) at(path, `“${show}” gives ${k === "series" ? "a series" : "one value"}; this mark needs ${wants === "series" ? "a series" : "one value"}.`);
  };
  const walk = (parts: Part[], path: string) =>
    parts.forEach((p, n) => {
      const here = `${path}[${n}]`;
      if (p.mark === "group") walk(p.parts, `${here}.parts`);
      if (p.mark === "plot") p.marks.forEach((m, k) => use(m.show, `${here}.marks[${k}].show`, m.mark === "rule" ? "value" : "series"));
      if (p.mark === "polar") use(p.show, `${here}.show`, "series");
      if (p.mark === "text") p.content.forEach((c, k) => typeof c !== "string" && use(c.show, `${here}.content[${k}].show`, "any"));
    });
  walk(d.parts, "parts");
}

/** A design as the text Ziffr writes it: two-space JSON, fields in the order the format lists them, so a design
 * exported, brought back and exported again is the same file. */
export function writeViewDesign(d: ViewDesign): string {
  return `${JSON.stringify(ordered(d, VIEW_DESIGN_SCHEMA), null, 2)}\n`;
}

function ordered(v: unknown, raw: Schema | undefined): unknown {
  const s = raw?.$ref ? VIEW_DESIGN_SCHEMA.$defs?.[raw.$ref.replace("#/$defs/", "")] : raw;
  if (Array.isArray(v)) return v.map((x) => ordered(x, s?.items));
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  const branch = s?.oneOf?.map((b) => (b.$ref ? VIEW_DESIGN_SCHEMA.$defs?.[b.$ref.replace("#/$defs/", "")] : b)).find((b) => b?.type === "object" && (!b.properties?.mark || b.properties.mark.const === o.mark) && (!b.properties?.format || b.properties.format.const === o.format));
  const props = (branch ?? s)?.properties ?? {};
  const keys = [...Object.keys(props).filter((k) => k in o), ...Object.keys(o).filter((k) => !(k in props)).sort()];
  return Object.fromEntries(keys.map((k) => [k, ordered(o[k], props[k])]));
}
