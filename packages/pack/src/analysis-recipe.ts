// The Analysis Recipe formats, ziffr.analysis/1 and /2 (GLOSSARY: Analysis Recipe): an Analysis written as steps of
// Ziffr's verified functions (recipe-functions.ts, recipe-methods.ts) over the Metrics in its Slots. Plain data, never
// code: the schemas below are the only definition, checked wherever a recipe is saved and in the Playground, and
// docs/reference is generated from them. Running one is recipe-run.ts. /1 is read for ever and never changes; /2 adds
// the newer Methods as functions with typed inputs, outputs that are tables, and Takeaway outputs.
import { checkSchema, MAX_PROBLEMS, parseJson, type Problem, type Schema } from "./json-check.js";
import { plainText } from "./file-text.js";

/** The first format, which Ziffr reads for ever; a recipe that uses only its functions may stay in it. */
export const ANALYSIS_FORMAT = "ziffr.analysis/1";
/** The newest format, which Ziffr writes once a recipe uses a function that only it has. */
export const ANALYSIS_FORMAT_2 = "ziffr.analysis/2";
/** Every Analysis Recipe format Ziffr ever published, oldest first. */
export const ANALYSIS_FORMATS = [ANALYSIS_FORMAT, ANALYSIS_FORMAT_2] as const;
/** The exact limits a recipe is held to. */
export const RECIPE_LIMITS = { bytes: 32_768, depth: 6, slots: 4, steps: 12, outputs: 6, name: 80, description: 300, label: 60 } as const;

/** The library's functions: what each needs and what it gives. */
export const FUNCTIONS = {
  movingAverage: { inputs: 1, param: "window", gives: "series" },
  difference: { inputs: 1, gives: "series" },
  growth: { inputs: 1, gives: "series" },
  share: { inputs: 2, gives: "series" },
  linearTrend: { inputs: 1, gives: "series" },
  slope: { inputs: 1, gives: "value" },
  mean: { inputs: 1, gives: "value" },
  standardDeviation: { inputs: 1, gives: "value" },
  zScore: { inputs: 1, gives: "series" },
  seasonalIndex: { inputs: 1, param: "season", gives: "series" },
  correlation: { inputs: 2, gives: "value" },
} as const;
/** The name of a function in the library. */
export type FunctionName = keyof typeof FUNCTIONS;

/** One step: a function of the library, the series it is applied to (a Slot, or an earlier step), and its parameter. */
export type Step = { id: string; fn: FunctionName; of: string; with?: string; window?: number; season?: number };
/** What a recipe gives: a step's result, with a label and how its numbers are written. */
export type Output = { step: string; label: string; unit: "metric" | "percent" | "number" };
/** An Analysis written as a file (GLOSSARY: Analysis Recipe), in the newest format. */
export type AnalysisRecipe = { format: typeof ANALYSIS_FORMAT; name: string; description?: string; slots: { label: string }[]; steps: Step[]; outputs: Output[] };

const text = (max: number): Schema => plainText(max);
const ID = "^[a-z][a-zA-Z0-9]{0,23}$";
const SOURCE: Schema = { type: "string", pattern: "^(slot[1-4]|[a-z][a-zA-Z0-9]{0,23})$", description: "a Slot (slot1 to slot4) or the id of an earlier step" };
const step = (fn: FunctionName): Schema => {
  const f = FUNCTIONS[fn] as { inputs: number; param?: "window" | "season" };
  const props: Record<string, Schema> = { id: { type: "string", pattern: ID, description: "a name for the step: a letter, then letters and digits" }, fn: { const: fn }, of: SOURCE };
  const required = ["id", "fn", "of"];
  if (f.inputs === 2) {
    props.with = SOURCE;
    required.push("with");
  }
  if (f.param === "window") {
    props.window = { type: "integer", minimum: 2, maximum: 60 };
    required.push("window");
  }
  if (f.param === "season") {
    props.season = { type: "integer", minimum: 2, maximum: 53 };
    required.push("season");
  }
  return { type: "object", properties: props, required, additionalProperties: false };
};

/** The JSON Schema of ziffr.analysis/1: the one definition the checks run and docs/reference is generated from. */
export const ANALYSIS_RECIPE_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.net/schemas/ziffr.analysis-1.json",
  title: "Ziffr Analysis Recipe (ziffr.analysis/1)",
  description: "An Analysis written as steps of Ziffr's verified functions over the Metrics in its Slots. It holds no code.",
  type: "object",
  properties: {
    format: { const: ANALYSIS_FORMAT },
    name: { ...text(RECIPE_LIMITS.name), minLength: 1 },
    description: text(RECIPE_LIMITS.description),
    slots: { type: "array", minItems: 1, maxItems: RECIPE_LIMITS.slots, items: { type: "object", properties: { label: { ...text(RECIPE_LIMITS.label), minLength: 1 } }, required: ["label"], additionalProperties: false } },
    steps: { type: "array", minItems: 1, maxItems: RECIPE_LIMITS.steps, items: { oneOf: (Object.keys(FUNCTIONS) as FunctionName[]).map(step) } },
    outputs: {
      type: "array",
      minItems: 1,
      maxItems: RECIPE_LIMITS.outputs,
      items: { type: "object", properties: { step: { type: "string", pattern: ID }, label: { ...text(RECIPE_LIMITS.label), minLength: 1 }, unit: { enum: ["metric", "percent", "number"] } }, required: ["step", "label", "unit"], additionalProperties: false },
    },
  },
  required: ["format", "name", "slots", "steps", "outputs"],
  additionalProperties: false,
};

/** An Analysis Recipe in any format Ziffr reads. */
export type AnyAnalysisRecipe = AnalysisRecipe | AnalysisRecipe2;

/** The result of checking a recipe: the recipe, or every problem found with its line. */
export type RecipeCheck = { ok: true; recipe: AnyAnalysisRecipe } | { ok: false; problems: Problem[] };

/** Checks an Analysis Recipe's text: size and depth, the schema, then how its steps fit together. */
export function checkAnalysisRecipe(textIn: string): RecipeCheck {
  const parsed = parseJson(textIn, { maxBytes: RECIPE_LIMITS.bytes, maxDepth: RECIPE_LIMITS.depth });
  if (!parsed.ok) return parsed;
  return checkAnalysisRecipeValue(parsed.value, parsed.lines);
}

/** Checks an Analysis Recipe already read from JSON (`lines` names where each path starts, when known). The format
 * the file names decides which schema holds it: a /1 file is held to /1 exactly as before, whatever /2 adds. */
export function checkAnalysisRecipeValue(value: unknown, lines: Map<string, number> = new Map()): RecipeCheck {
  const fmt = value && typeof value === "object" && !Array.isArray(value) ? (value as { format?: unknown }).format : undefined;
  if (typeof fmt === "string" && fmt.startsWith("ziffr.analysis/") && !(ANALYSIS_FORMATS as readonly string[]).includes(fmt))
    return { ok: false, problems: [{ path: "format", line: lines.get("format") ?? null, message: `This file is in format ${fmt}; this Ziffr reads ${ANALYSIS_FORMATS.join(", ")}.` }] };
  // A file that names no format is held to the first one's checks, as it always was.
  if (fmt === ANALYSIS_FORMAT || fmt === undefined) return checkFirst(value, lines);
  return checkSecond(value, lines);
}

function checkFirst(value: unknown, lines: Map<string, number>): RecipeCheck {
  const problems = checkSchema(ANALYSIS_RECIPE_SCHEMA, value, lines);
  if (problems.length) return { ok: false, problems };
  const r = value as AnalysisRecipe;
  const out: Problem[] = [];
  const at = (path: string, message: string) => out.push({ path, line: lines.get(path) ?? null, message });
  // What each name stands for so far: a Slot's series, or an earlier step's series or value.
  const kinds = new Map<string, "series" | "value">(r.slots.map((_, i) => [`slot${i + 1}`, "series"]));
  r.steps.forEach((s, i) => {
    const here = `steps[${i}]`;
    if (kinds.has(s.id)) at(`${here}.id`, `“${s.id}” is used already: each step needs a name of its own, and slot1 to slot4 are the Slots.`);
    for (const k of ["of", "with"] as const) {
      const src = s[k];
      if (src === undefined) continue;
      const kind = kinds.get(src);
      if (!kind) at(`${here}.${k}`, `“${src}” is neither a Slot of this recipe nor an earlier step.`);
      else if (kind === "value") at(`${here}.${k}`, `“${src}” gives one value; ${s.fn} needs a series.`);
    }
    if (!kinds.has(s.id)) kinds.set(s.id, FUNCTIONS[s.fn].gives);
  });
  r.outputs.forEach((o, i) => {
    if (!r.steps.some((s) => s.id === o.step)) at(`outputs[${i}].step`, `“${o.step}” is not a step of this recipe.`);
  });
  return out.length ? { ok: false, problems: out } : { ok: true, recipe: r };
}

// ---- ziffr.analysis/2 ----

/** What a step, or a Slot, gives: a series, one value, a table (rows with a label and a number), or a fit (what a fit step holds). */
export type Kind = "series" | "value" | "table" | "model";

/** The exact limits a /2 recipe is held to: those of /1, and how many inputs steps may name in all, how many fits, and the lists in a step. */
export const RECIPE_LIMITS_2 = { ...RECIPE_LIMITS, inputs: 40, fits: 2, controls: 4, drivers: 6, title: 60, note: 200 } as const;

type Param = "window" | "season" | "percent" | "maxLag";
type Function2 = { of: "series" | "model"; with?: true; controls?: true; drivers?: true; param?: Param; gives: Kind; takeaway?: true };

/** The functions of /2: every one of /1 and the newer Methods, each with the kind it takes as `of`, what else it takes, what it gives, and
 * whether the Method has a Takeaway of its own (an output can show it; a recipe author writes no sentence about statistics). */
export const FUNCTIONS_2 = {
  movingAverage: { of: "series", param: "window", gives: "series" },
  difference: { of: "series", gives: "series" },
  growth: { of: "series", gives: "series" },
  share: { of: "series", with: true, gives: "series" },
  linearTrend: { of: "series", gives: "series" },
  slope: { of: "series", gives: "value" },
  mean: { of: "series", gives: "value" },
  standardDeviation: { of: "series", gives: "value" },
  zScore: { of: "series", gives: "series" },
  seasonalIndex: { of: "series", param: "season", gives: "series" },
  correlation: { of: "series", with: true, gives: "value" },
  changes: { of: "series", gives: "series" },
  detrended: { of: "series", gives: "series" },
  quantile: { of: "series", param: "percent", gives: "value" },
  spearman: { of: "series", with: true, gives: "value", takeaway: true },
  partialCorrelation: { of: "series", with: true, controls: true, gives: "value", takeaway: true },
  laggedCorrelation: { of: "series", with: true, param: "maxLag", gives: "table", takeaway: true },
  usualRange: { of: "series", gives: "table", takeaway: true },
  fit: { of: "series", drivers: true, gives: "model", takeaway: true },
  importance: { of: "model", gives: "table" },
} as const satisfies Record<string, Function2>;
/** The name of a function in the /2 library. */
export type FunctionName2 = keyof typeof FUNCTIONS_2;

/** One step of /2: a function, what it works on (`of`: a Slot or an earlier step), and what else it takes. */
export type Step2 = { id: string; fn: FunctionName2; of: string; with?: string; controls?: string[]; drivers?: string[]; window?: number; season?: number; percent?: number; maxLag?: number };
/** What an output of /2 shows: a series, one value, a table, or a Takeaway (a model is shown only through its Takeaway). */
export type Shows = "series" | "value" | "table" | "takeaway";
/** An output of /2: a step's result with a label; `unit` for a series or one value; `title` and `note` for a Takeaway. */
export type Output2 = { step: string; label: string; shows: Shows; unit?: Output["unit"]; title?: string; note?: string };
/** An Analysis written as a file (GLOSSARY: Analysis Recipe), in format /2. */
export type AnalysisRecipe2 = { format: typeof ANALYSIS_FORMAT_2; name: string; description?: string; slots: { label: string }[]; steps: Step2[]; outputs: Output2[] };

const PARAMS: Record<Param, Schema> = {
  window: { type: "integer", minimum: 2, maximum: 60 },
  season: { type: "integer", minimum: 2, maximum: 53 },
  percent: { type: "integer", minimum: 1, maximum: 99, description: "the share of the values below it, in percent" },
  maxLag: { type: "integer", minimum: 0, maximum: 6, description: "the longest delay tried, in periods" },
};
const list = (max: number): Schema => ({ type: "array", minItems: 1, maxItems: max, uniqueItems: true, items: SOURCE });
const step2 = (fn: FunctionName2): Schema => {
  const f = FUNCTIONS_2[fn] as Function2;
  const props: Record<string, Schema> = { id: { type: "string", pattern: ID, description: "a name for the step: a letter, then letters and digits" }, fn: { const: fn }, of: SOURCE };
  const required = ["id", "fn", "of"];
  const add = (k: string, s: Schema) => (props[k] = s) && required.push(k);
  if (f.with) add("with", SOURCE);
  if (f.controls) add("controls", list(RECIPE_LIMITS_2.controls));
  if (f.drivers) add("drivers", list(RECIPE_LIMITS_2.drivers));
  if (f.param) add(f.param, PARAMS[f.param]);
  return { type: "object", properties: props, required, additionalProperties: false };
};

/** The JSON Schema of ziffr.analysis/2: the one definition the checks run and docs/reference is generated from. */
export const ANALYSIS_RECIPE_SCHEMA_2: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.net/schemas/ziffr.analysis-2.json",
  title: "Ziffr Analysis Recipe (ziffr.analysis/2)",
  description: "An Analysis written as steps of Ziffr's verified functions over the Metrics in its Slots; a step may give a series, one value, a table or a fit, and an output may be a Takeaway. It holds no code.",
  type: "object",
  properties: {
    format: { const: ANALYSIS_FORMAT_2 },
    name: { ...text(RECIPE_LIMITS_2.name), minLength: 1 },
    description: text(RECIPE_LIMITS_2.description),
    slots: { type: "array", minItems: 1, maxItems: RECIPE_LIMITS_2.slots, items: { type: "object", properties: { label: { ...text(RECIPE_LIMITS_2.label), minLength: 1 } }, required: ["label"], additionalProperties: false } },
    steps: { type: "array", minItems: 1, maxItems: RECIPE_LIMITS_2.steps, items: { oneOf: (Object.keys(FUNCTIONS_2) as FunctionName2[]).map(step2) } },
    outputs: {
      type: "array",
      minItems: 1,
      maxItems: RECIPE_LIMITS_2.outputs,
      items: {
        type: "object",
        properties: {
          step: { type: "string", pattern: ID },
          label: { ...text(RECIPE_LIMITS_2.label), minLength: 1 },
          shows: { enum: ["series", "value", "table", "takeaway"], description: "what it shows; a fit is shown only through its Takeaway" },
          unit: { enum: ["metric", "percent", "number"], description: "for a series or one value" },
          title: text(RECIPE_LIMITS_2.title),
          note: text(RECIPE_LIMITS_2.note),
        },
        required: ["step", "label", "shows"],
        additionalProperties: false,
      },
    },
  },
  required: ["format", "name", "slots", "steps", "outputs"],
  additionalProperties: false,
};

const A_KIND: Record<Kind, string> = { series: "a series", value: "one value", table: "a table", model: "a fit" };

function checkSecond(value: unknown, lines: Map<string, number>): RecipeCheck {
  const problems = checkSchema(ANALYSIS_RECIPE_SCHEMA_2, value, lines);
  if (problems.length) return { ok: false, problems };
  const r = value as AnalysisRecipe2;
  const out: Problem[] = [];
  const at = (path: string, message: string) => void (out.length < MAX_PROBLEMS && out.push({ path, line: lines.get(path) ?? null, message }));
  // What each name stands for so far: a Slot's series, or an earlier step's result.
  const kinds = new Map<string, Kind>(r.slots.map((_, i) => [`slot${i + 1}`, "series"]));
  const known = (src: string) => kinds.get(src);
  let inputs = 0;
  r.steps.forEach((s, i) => {
    const here = `steps[${i}]`;
    const f = FUNCTIONS_2[s.fn] as Function2;
    // slot1 to slot4 are the Slots' names for ever, so no step may take one, even beyond the Slots this recipe has.
    if (kinds.has(s.id) || /^slot[1-4]$/.test(s.id)) at(`${here}.id`, `“${s.id}” is used already: each step needs a name of its own, and slot1 to slot4 are the Slots.`);
    if (s.drivers?.includes(s.of)) at(`${here}.drivers`, `lists “${s.of}”, which is the series it explains; a series cannot be its own driver.`);
    const refs: [string, string, Kind][] = [[`${here}.of`, s.of, f.of]];
    if (s.with !== undefined) refs.push([`${here}.with`, s.with, "series"]);
    s.controls?.forEach((c, j) => refs.push([`${here}.controls[${j}]`, c, "series"]));
    s.drivers?.forEach((c, j) => refs.push([`${here}.drivers[${j}]`, c, "series"]));
    for (const [path, src, need] of refs) {
      inputs++;
      const kind = known(src);
      if (!kind) at(path, `“${src}” is neither a Slot of this recipe nor an earlier step.`);
      else if (kind !== need) at(path, `“${src}” gives ${A_KIND[kind]}; ${s.fn} needs ${A_KIND[need]}.`);
    }
    if (!kinds.has(s.id)) kinds.set(s.id, f.gives);
  });
  if (inputs > RECIPE_LIMITS_2.inputs) at("steps", `name ${inputs} inputs in all; at most ${RECIPE_LIMITS_2.inputs} are allowed.`);
  const fits = r.steps.filter((s) => s.fn === "fit").length;
  if (fits > RECIPE_LIMITS_2.fits) at("steps", `have ${fits} fits; at most ${RECIPE_LIMITS_2.fits} are allowed.`);
  r.outputs.forEach((o, i) => {
    const here = `outputs[${i}]`;
    const s = r.steps.find((x) => x.id === o.step);
    if (!s) return at(`${here}.step`, `“${o.step}” is not a step of this recipe.`);
    const gives = FUNCTIONS_2[s.fn].gives;
    if (o.shows === "takeaway") {
      if (!("takeaway" in FUNCTIONS_2[s.fn])) at(`${here}.shows`, `${s.fn} has no Takeaway; show its ${A_KIND[gives]} instead.`);
      // The words of a Takeaway name Metrics and their units, so everything it is worked out from must be a Slot.
      else if (s.fn === "laggedCorrelation" && s.maxLag !== 6) at(`${here}.shows`, `The Takeaway of a lagged correlation looks at all 6 delays; ${o.step} asks for ${s.maxLag}, so its table and its Takeaway would differ. Set maxLag to 6.`);
      else if (![s.of, s.with, ...(s.controls ?? []), ...(s.drivers ?? [])].every((x) => x === undefined || /^slot[1-4]$/.test(x))) at(`${here}.shows`, `A Takeaway is worked out from Slots only; ${o.step} works on another step.`);
    } else if (gives === "model") at(`${here}.shows`, `“${o.step}” gives a fit, which is shown only through its Takeaway.`);
    else if (gives !== o.shows) at(`${here}.shows`, `“${o.step}” gives ${A_KIND[gives]}, not ${A_KIND[o.shows]}.`);
    const plain = o.shows === "series" || o.shows === "value";
    if (plain && o.unit === undefined) at(here, `needs the field “unit”: how a ${o.shows} is written.`);
    if (!plain && o.unit !== undefined) at(`${here}.unit`, `is for a series or one value, not ${A_KIND[o.shows === "takeaway" ? gives : o.shows]}.`);
    if (o.shows !== "takeaway") for (const k of ["title", "note"] as const) if (o[k] !== undefined) at(`${here}.${k}`, "is for a Takeaway.");
  });
  return out.length ? { ok: false, problems: out } : { ok: true, recipe: r };
}

const order = (o: object, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, (o as Record<string, unknown>)[k]]));

/** An output a mark can draw: a series or one value, with the unit it is written in. */
export type DrawnOutput = { step: string; label: string; unit: Output["unit"]; gives: "series" | "value" };

/** The outputs of a recipe in either format that a View Design's marks can draw (a table or a Takeaway has no mark yet), in order. */
export function drawnOutputs(r: AnyAnalysisRecipe | null | undefined): DrawnOutput[] {
  if (!r) return [];
  const out: DrawnOutput[] = [];
  for (const o of r.outputs) {
    const s = r.steps.find((x) => x.id === o.step);
    if (!s || o.unit === undefined || ("shows" in o && o.shows !== "series" && o.shows !== "value")) continue;
    const gives = r.format === ANALYSIS_FORMAT ? FUNCTIONS[s.fn as FunctionName].gives : FUNCTIONS_2[s.fn as FunctionName2].gives;
    if (gives === "series" || gives === "value") out.push({ step: o.step, label: o.label, unit: o.unit, gives });
  }
  return out;
}

/** A recipe as the text Ziffr writes it: two-space JSON, fields in the format's order, so a recipe exported, brought
 * back and exported again is the same file. */
export function writeAnalysisRecipe(r: AnyAnalysisRecipe): string {
  const out = {
    ...order(r, ["format", "name", "description"]),
    slots: r.slots.map((s) => order(s, ["label"])),
    steps: (r.steps as Step2[]).map((s) => order(s, ["id", "fn", "of", "with", "controls", "drivers", "window", "season", "percent", "maxLag"])),
    outputs: (r.outputs as Output2[]).map((o) => order(o, ["step", "label", "shows", "unit", "title", "note"])),
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}
