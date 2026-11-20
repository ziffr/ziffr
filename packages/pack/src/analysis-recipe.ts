// The Analysis Recipe format, ziffr.analysis/1 (GLOSSARY: Analysis Recipe): an Analysis written as steps of Ziffr's
// verified functions (recipe-functions.ts) over the Metrics in its Slots. Plain data, never code: the schema below is
// the only definition, checked wherever a recipe is saved and in the Playground, and docs/reference is generated
// from it. Running one is recipe-run.ts.
import { checkSchema, parseJson, type Problem, type Schema } from "./json-check.js";
import { plainText } from "./file-text.js";

/** The format this Ziffr writes; it reads every version in `ANALYSIS_FORMATS`. */
export const ANALYSIS_FORMAT = "ziffr.analysis/1";
/** Every Analysis Recipe format Ziffr ever published, oldest first. */
export const ANALYSIS_FORMATS = [ANALYSIS_FORMAT] as const;
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
  $id: "https://ziffr.app/schemas/ziffr.analysis-1.json",
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

/** The result of checking a recipe: the recipe, or every problem found with its line. */
export type RecipeCheck = { ok: true; recipe: AnalysisRecipe } | { ok: false; problems: Problem[] };

/** Checks an Analysis Recipe's text: size and depth, the schema, then how its steps fit together. */
export function checkAnalysisRecipe(textIn: string): RecipeCheck {
  const parsed = parseJson(textIn, { maxBytes: RECIPE_LIMITS.bytes, maxDepth: RECIPE_LIMITS.depth });
  if (!parsed.ok) return parsed;
  return checkAnalysisRecipeValue(parsed.value, parsed.lines);
}

/** Checks an Analysis Recipe already read from JSON (`lines` names where each path starts, when known). */
export function checkAnalysisRecipeValue(value: unknown, lines: Map<string, number> = new Map()): RecipeCheck {
  const fmt = value && typeof value === "object" && !Array.isArray(value) ? (value as { format?: unknown }).format : undefined;
  if (typeof fmt === "string" && fmt.startsWith("ziffr.analysis/") && !(ANALYSIS_FORMATS as readonly string[]).includes(fmt))
    return { ok: false, problems: [{ path: "format", line: lines.get("format") ?? null, message: `This file is in format ${fmt}; this Ziffr reads ${ANALYSIS_FORMATS.join(", ")}.` }] };
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

const order = (o: object, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, (o as Record<string, unknown>)[k]]));

/** A recipe as the text Ziffr writes it: two-space JSON, fields in the format's order, so a recipe exported, brought
 * back and exported again is the same file. */
export function writeAnalysisRecipe(r: AnalysisRecipe): string {
  const out = {
    ...order(r, ["format", "name", "description"]),
    slots: r.slots.map((s) => order(s, ["label"])),
    steps: r.steps.map((s) => order(s, ["id", "fn", "of", "with", "window", "season"])),
    outputs: r.outputs.map((o) => order(o, ["step", "label", "unit"])),
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}
