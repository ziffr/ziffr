// The Metric file format, ziffr.metric/1 (GLOSSARY: Metric Description, Metric Catalog, Pack): a Metric Description
// written as a file, without owner, Submitters or values, as a Metric Catalog entry in a Pack. The schema below is the
// only definition, checked wherever such a file is read, and docs/reference is generated from it.
// Security: a file holds no person, no value and no web address; a Derived Metric's formula is only read, never run.
import { checkFormat, parseJson, type FormatCheck, type Schema } from "./json-check.js";
import { plainText } from "./file-text.js";
import { formulaSyntaxProblem, FORMULA_LIMITS } from "./formula-check.js";
import { ATTAINMENT_METHODS, type Aggregation, type AttainmentMethod, type Format, type Period, type Polarity, type SourceId, type SubmissionRule, type UnitPosition } from "./kinds.js";

/** The format this Ziffr writes; it reads every version in `METRIC_FILE_FORMATS`. */
export const METRIC_FILE_FORMAT = "ziffr.metric/1";
/** Every Metric file format Ziffr ever published, oldest first. */
export const METRIC_FILE_FORMATS = [METRIC_FILE_FORMAT] as const;
/** The exact limits a Metric file is held to; name, unit and decimals as the Metric form keeps them. */
export const METRIC_FILE_LIMITS = { bytes: 16_384, depth: 4, name: 120, description: 1000, unit: 20, category: 60, tags: 12, tag: 30, magnitude: 1e15 } as const;

/** A Metric Description as a file (GLOSSARY: Metric Description), in the newest format. Fields left out take the
 * defaults of the Metric form. `formula` makes it a Derived Metric; in a Pack it names other entries by their key. */
export type MetricFile = {
  format: typeof METRIC_FILE_FORMAT;
  name: string;
  description?: string;
  category?: string;
  industries?: string[];
  segments?: string[];
  period: Period;
  aggregation: Aggregation;
  polarity: Polarity;
  unit?: string;
  unitPosition?: UnitPosition;
  valueFormat?: Format;
  decimals?: number;
  submissionRule?: SubmissionRule;
  targetMin?: number;
  targetMax?: number;
  attainmentMethod?: AttainmentMethod;
  sources?: SourceId[];
  formula?: string;
};

const TAG: Schema = { type: "string", pattern: "^[a-z][a-z0-9-]{0,29}$", description: "a key in lower case, such as “saas” or “b2b”" };
const tags = (what: string): Schema => ({ type: "array", maxItems: METRIC_FILE_LIMITS.tags, items: TAG, description: `The kinds of ${what} it suits; left out, any.` });
const bound = (what: string): Schema => ({ type: "number", minimum: -METRIC_FILE_LIMITS.magnitude, maximum: METRIC_FILE_LIMITS.magnitude, description: `The ${what} of its Target Range.` });

/** The JSON Schema of ziffr.metric/1: the one definition the checks run and docs/reference is generated from. */
export const METRIC_FILE_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.app/schemas/ziffr.metric-1.json",
  title: "Ziffr Metric Description (ziffr.metric/1)",
  description: "A Metric Description written as a file, without owner, Submitters or values: a Metric Catalog entry. It holds no code.",
  type: "object",
  properties: {
    format: { const: METRIC_FILE_FORMAT, description: "The format and its version." },
    name: { ...plainText(METRIC_FILE_LIMITS.name), minLength: 1 },
    description: plainText(METRIC_FILE_LIMITS.description),
    category: plainText(METRIC_FILE_LIMITS.category, "plain text, without markup or web addresses, such as “Revenue”"),
    industries: tags("business, such as “saas” or “retail”"),
    segments: tags("customers, such as “b2b” or “b2c”"),
    period: { enum: ["day", "week", "month", "quarter", "year"], description: "How often it has a value." },
    aggregation: { enum: ["sum", "average", "last", "none"], description: "How its values combine over longer periods." },
    polarity: { enum: ["higher", "lower", "target"], description: "Whether higher, lower or a range of values is good." },
    unit: plainText(METRIC_FILE_LIMITS.unit, "plain text, without markup or web addresses, such as “€” or “hours”"),
    unitPosition: { enum: ["before", "after"], description: "Which side of the number the unit stands on; left out, after." },
    valueFormat: { enum: ["number", "currency", "percent"], description: "What kind of number it counts; left out, number." },
    decimals: { type: "integer", minimum: 0, maximum: 6 },
    submissionRule: { enum: ["reject", "overwrite", "add", "keep_both"], description: "What a second value for the same period does; left out, overwrite." },
    targetMin: bound("lower end"),
    targetMax: bound("upper end"),
    attainmentMethod: { enum: [...ATTAINMENT_METHODS], description: "How its Attainment is computed; left out, the Workspace's way." },
    sources: { type: "array", maxItems: 5, items: { enum: ["web_form", "mail", "slack", "telegram", "api"] }, description: "Where its values may arrive from; left out, every Source." },
    formula: { type: "string", maxLength: FORMULA_LIMITS.length, pattern: "^[a-z0-9{}()+\\-*/. ]*$", description: "a formula of + - * /, brackets, numbers and {key} of another entry, such as “{revenue} / {orders}”" },
  },
  required: ["format", "name", "period", "aggregation", "polarity"],
  additionalProperties: false,
};

const FORMAT = {
  family: "ziffr.metric",
  reads: METRIC_FILE_FORMATS,
  schema: METRIC_FILE_SCHEMA,
  meaning(m: MetricFile, at: (path: string, message: string) => void) {
    if (m.targetMin !== undefined && m.targetMax !== undefined && m.targetMin > m.targetMax) at("targetMin", "is above targetMax: the lower end of a Target Range comes first.");
    if (m.sources && new Set(m.sources).size !== m.sources.length) at("sources", "names a Source twice.");
    for (const k of ["industries", "segments"] as const) if (m[k] && new Set(m[k]).size !== m[k]!.length) at(k, "names a kind twice.");
    if (m.formula !== undefined) {
      const why = formulaSyntaxProblem(m.formula);
      if (why) at("formula", why);
      else if (m.sources) at("sources", "A Derived Metric is computed; values do not arrive for it, so it has no Sources.");
    }
  },
};

/** Checks a Metric file's text: size and depth, the schema, then what the schema cannot say. A formula is checked as
 * written here; which entries it names is checked by the Pack it is in. */
export function checkMetricFile(textIn: string): FormatCheck<MetricFile> {
  const parsed = parseJson(textIn, { maxBytes: METRIC_FILE_LIMITS.bytes, maxDepth: METRIC_FILE_LIMITS.depth });
  if (!parsed.ok) return parsed;
  return checkMetricFileValue(parsed.value, parsed.lines);
}

/** Checks a Metric file already read from JSON (`lines` names where each path starts, when known). */
export function checkMetricFileValue(value: unknown, lines: Map<string, number> = new Map()): FormatCheck<MetricFile> {
  return checkFormat(FORMAT, value, lines);
}

