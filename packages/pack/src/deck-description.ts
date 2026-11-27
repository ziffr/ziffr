// The deck description, ziffr.deck/1 (GLOSSARY: Deck, Slide, Slide Type, Deck Design; spec 0069): what a deck Ziffr
// makes stores of itself. It is content only: no number, position, colour or font. Ziffr fills the numbers in for
// whoever looks, the Deck Design says where things stand and the Theme how they look. The schema below is the only
// definition, checked by the core on every write and again on read.
// Security: a description comes from a browser, so the check is closed. It first takes a bounded copy of plain data,
// then holds it to known slide types and fields, integer ids and capped plain strings. No field holds markup, an
// address, an image or code; the typed words are only ever drawn as text. The check says nothing about who may see a
// listed Metric: that is the core's work, slide by slide.
import { APP_REFUSED } from "./file-text.js";
import { checkFormat, type FormatCheck, type Schema } from "./json-check.js";

/** The format of a deck description. A stored deck document in it is told apart from older ones by this word. */
export const DECK_DESCRIPTION_FORMAT = "ziffr.deck/1";

/** The Deck Designs (GLOSSARY: Deck Design): `band`, a headline band; `column`, a side column at the left. */
export const DECK_DESIGNS = ["band", "column"] as const;
/** One Deck Design. */
export type DeckDesign = (typeof DECK_DESIGNS)[number];

/** How loud the Deck Design's panel is drawn. */
export const DECK_EMPHASES = ["strong", "quiet"] as const;
/** One emphasis. */
export type DeckEmphasis = (typeof DECK_EMPHASES)[number];

/** How a chart on a slide draws its values. */
export const SLIDE_CHART_FORMS = ["columns", "line"] as const;
/** One form of a chart. */
export type SlideChartForm = (typeof SLIDE_CHART_FORMS)[number];

/** The exact limits a deck description is held to. `bytes` counts its JSON, `depth` how deep that may be nested. */
export const DECK_DESCRIPTION_LIMITS = {
  bytes: 524_288, depth: 8, slides: 40, metrics: 12, headline: 140, answers: 3, question: 140, answer: 400, answerLines: 4,
  minPeriods: 2, maxPeriods: 53, minTreeLevels: 2, maxTreeLevels: 3,
} as const;

const L = DECK_DESCRIPTION_LIMITS;

/** The options of a slide type that takes none. */
export type NoSlideOptions = Record<string, never>;
/** `summary`: how its one chart, of the first Metric, is drawn. `periods` left out, Ziffr picks. */
export type SummarySlideOptions = { periods?: number; target?: boolean; form?: SlideChartForm };
/** `chart`: `form` left out is columns. With `part` the next Metric fills part of each column, and with `reference`
 * one more Metric draws a reference line; either makes the slide one chart. `target` draws the target. */
export type ChartSlideOptions = { periods?: number; target?: boolean; form?: SlideChartForm; part?: boolean; reference?: boolean };
/** `table`: how many periods each trend shows. */
export type TableSlideOptions = { periods?: number };
/** `gap-table`: with `total`, the first Metric is a Total and the others are its parts; else two Breakdowns. */
export type GapTableSlideOptions = { total?: boolean };
/** `driver-tree`: how many levels of the formula are drawn, the first Metric's counted as one. */
export type DriverTreeSlideOptions = { levels?: number };

/** What `options` holds for each Slide Type. */
export type SlideOptions = {
  cover: NoSlideOptions;
  summary: SummarySlideOptions;
  chart: ChartSlideOptions;
  table: TableSlideOptions;
  "gap-table": GapTableSlideOptions;
  bridge: NoSlideOptions;
  mosaic: NoSlideOptions;
  "driver-tree": DriverTreeSlideOptions;
  questions: NoSlideOptions;
  definitions: NoSlideOptions;
  about: NoSlideOptions;
};

/** A Slide Type (GLOSSARY: Slide Type). */
export type SlideType = keyof SlideOptions;

type TypeRule = {
  description: string;
  /** How many Metrics a slide of this type lists: the fewest and the most. */
  metrics: readonly [number, number];
  /** Whether a person's typed answers may stand on it. */
  answers?: boolean;
  options?: Record<string, Schema>;
};

const flag = (description: string): Schema => ({ type: "boolean", description });
const periods: Schema = { type: "integer", minimum: L.minPeriods, maximum: L.maxPeriods, description: "How many periods are shown." };
const chartOptions: Record<string, Schema> = { periods, target: flag("Draws the target."), form: { enum: [...SLIDE_CHART_FORMS], description: "Columns or a line." } };

// The order is the one the Slide Types are listed in. A slide reads only the Metrics it lists, so a type whose Metric
// is built from others (a Total, a Derived Metric) lists those too.
const TYPES: Record<SlideType, TypeRule> = {
  cover: { description: "The deck's name, the period and an agenda made from the headlines.", metrics: [0, 0] },
  summary: { description: "Up to 4 figures and a chart of the first.", metrics: [1, 4], options: chartOptions },
  chart: {
    description: "1 or 2 charts; or one with a filled part, a reference line or both.", metrics: [1, 3],
    // The spec's own example puts a question beside a chart.
    answers: true,
    options: { ...chartOptions, part: flag("The next Metric fills part of each column."), reference: flag("One more Metric draws a reference line.") },
  },
  table: { description: "One row per Metric: latest, before, change, trend, on or off target.", metrics: [1, L.metrics], options: { periods } },
  "gap-table": { description: "Two Breakdowns, or a Total and its parts, with the difference.", metrics: [2, L.metrics], options: { total: flag("The first Metric is a Total and the others are its parts.") } },
  bridge: { description: "The change since the period before, a step per part. The first Metric is the one bridged.", metrics: [1, L.metrics] },
  mosaic: { description: "A Breakdown with parents as columns as wide as their share.", metrics: [1, 1] },
  "driver-tree": {
    description: "A Derived Metric, listed first, and what its formula reads.", metrics: [1, L.metrics],
    options: { levels: { type: "integer", minimum: L.minTreeLevels, maximum: L.maxTreeLevels, description: "How many levels are drawn." } },
  },
  questions: { description: "Up to 3 questions with typed answers.", metrics: [0, L.metrics], answers: true },
  definitions: { description: "Each Metric and how it is calculated.", metrics: [1, L.metrics] },
  about: { description: "About these slides, written by Ziffr: always the last slide, never changed or hidden.", metrics: [0, 0] },
};

/** Every Slide Type of this format. */
export const SLIDE_TYPES = Object.keys(TYPES) as SlideType[];

/** How many Metrics a slide of each type lists. */
export const SLIDE_METRICS: Readonly<Record<SlideType, { min: number; max: number }>> = Object.fromEntries(
  SLIDE_TYPES.map((t) => [t, { min: TYPES[t].metrics[0], max: TYPES[t].metrics[1] }]),
) as Record<SlideType, { min: number; max: number }>;

/** A question on a slide with what a person typed under it. `writtenOn` is the day, as 2026-11-27, or null. */
export type SlideAnswer = { question: string; text: string; writtenOn: string | null };

/** One slide of a deck description. Naming the type, as in `SlideDescription<"chart">`, narrows its options. */
export type SlideDescription<T extends SlideType = SlideType> = {
  [K in T]: {
    id: string;
    type: K;
    /** The ids of the only Metrics the slide reads, in the order the type reads them. */
    metrics: number[];
    options: SlideOptions[K];
    /** The person's own headline; null for Ziffr's. */
    headline: string | null;
    hidden: boolean;
    answers: SlideAnswer[];
  };
}[T];

/** A deck description: what is stored of a deck Ziffr makes. The slides stand in the order of the list. */
export type DeckDescription = {
  format: typeof DECK_DESCRIPTION_FORMAT;
  design: DeckDesign;
  emphasis: DeckEmphasis;
  slides: SlideDescription[];
};

// A typed string holds nothing XML forbids (control characters, lone surrogates, U+FFFE and U+FFFF), so the PowerPoint
// writer and the database take every checked word, and none of the invisible or direction-reversing characters that
// are refused in anything else a person types into Ziffr.
const CHARACTER = `[^${APP_REFUSED}\\uFFFE\\uFFFF]`;
const oneLine = (max: number, description: string): Schema => ({ type: "string", minLength: 1, maxLength: max, pattern: `^${CHARACTER}*$`, description });
const headlineWords = "one line of text without control characters or characters that reverse its direction";

const object = (description: string, properties: Record<string, Schema>): Schema => ({ type: "object", description, properties, required: Object.keys(properties), additionalProperties: false });
const orNull = (s: Schema, description: string): Schema => ({ description, oneOf: [{ type: "null" }, s] });

function slideSchema(type: SlideType): Schema {
  const rule = TYPES[type];
  const [min, max] = rule.metrics;
  // The last slide is Ziffr's own: nothing on it is a person's to write or hide.
  const fixed = type === "about";
  return object(rule.description, {
    // First, so that the checks name a slide's branch by it.
    type: { const: type },
    id: { type: "string", pattern: "^sl_[a-z0-9]{1,32}$", description: "“sl_” followed by 1 to 32 small letters or digits" },
    metrics: { type: "array", minItems: min, maxItems: max, uniqueItems: true, items: { type: "integer", minimum: 1, maximum: 2_147_483_647 }, description: "The ids of the only Metrics the slide reads." },
    options: { type: "object", description: "What this Slide Type lets a deck set; every field may be left out.", properties: rule.options ?? {}, additionalProperties: false },
    headline: fixed ? { type: "null" } : orNull(oneLine(L.headline, headlineWords), "The person's own headline; null for Ziffr's."),
    hidden: fixed ? { type: "boolean", const: false } : { type: "boolean" },
    answers: { type: "array", maxItems: rule.answers ? L.answers : 0, items: { $ref: "#/$defs/answer" } },
  });
}

/** The JSON Schema of ziffr.deck/1: the one definition `checkDeckDescription` runs. */
export const DECK_DESCRIPTION_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Ziffr deck description (ziffr.deck/1)",
  ...object("A deck Ziffr makes: its slides, with no number and no position.", {
    format: { const: DECK_DESCRIPTION_FORMAT, description: "The format and its version." },
    design: { enum: [...DECK_DESIGNS], description: "The Deck Design." },
    emphasis: { enum: [...DECK_EMPHASES], description: "How loud the design's panel is." },
    slides: { type: "array", minItems: 1, maxItems: L.slides, items: { oneOf: SLIDE_TYPES.map(slideSchema) }, description: "The slides, in order; the last one is “about”." },
  }),
  $defs: {
    answer: object("A question and what a person typed under it.", {
      question: oneLine(L.question, headlineWords),
      text: {
        type: "string", maxLength: L.answer, pattern: `^${CHARACTER}*(?:\\n${CHARACTER}*){0,${L.answerLines - 1}}$`,
        description: `text of at most ${L.answerLines} lines without control characters or characters that reverse its direction`,
      },
      writtenOn: orNull({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "a day such as 2026-11-27" }, "The day the answer was written."),
    }),
  },
};

const isDay = (day: string) => {
  const t = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(day);
};

/** What the schema cannot say: where the about slide stands, ids used once, real days and what some options need. */
function meaning(d: DeckDescription, at: (path: string, message: string) => void) {
  const ids = new Set<string>();
  const last = d.slides.length - 1;
  if (d.slides[last].type !== "about") at(`slides[${last}]`, "is the last slide, which must be the “about” slide.");
  d.slides.forEach((s, i) => {
    const here = `slides[${i}]`;
    if (s.type === "about" && i !== last) at(here, "is an “about” slide: there is one, and it is the last slide.");
    if (ids.has(s.id)) at(`${here}.id`, `“${s.id}” is used by an earlier slide.`);
    ids.add(s.id);
    s.answers.forEach((a, k) => {
      if (a.writtenOn !== null && !isDay(a.writtenOn)) at(`${here}.answers[${k}].writtenOn`, `“${a.writtenOn}” is not a day of the calendar.`);
    });
    if (s.type === "chart") chartMeaning(s, here, at);
    if (s.type === "gap-table" && !s.options.total && s.metrics.length !== 2) at(`${here}.metrics`, "must list 2 Metrics, unless the option “total” is on.");
  });
}

/** A chart's Metrics are one each of up to 2 charts, or those of one chart with a filled part or a reference line. */
function chartMeaning(s: SlideDescription<"chart">, here: string, at: (path: string, message: string) => void) {
  const { part, reference, form } = s.options;
  if (part && form === "line") at(`${here}.options.part`, "needs columns: a line has no part to fill.");
  const extra = Number(part ?? false) + Number(reference ?? false);
  if (!extra && s.metrics.length > 2) at(`${here}.metrics`, "lists at most 2 Metrics, a chart each, unless “part” or “reference” is on.");
  if (extra && s.metrics.length !== 1 + extra) at(`${here}.metrics`, `must list ${1 + extra} Metrics: the chart's, then its part and its reference as the options say.`);
}

const NOT_PLAIN = "holds something that is not plain data (text, numbers, true or false, null, lists and objects).";

/** A copy of `value` made of plain data only, or what is wrong with it. It stops as soon as the value is nested too
 * deeply or must be larger than allowed, so no later step walks more than that; the copy is what gets checked and
 * kept, so a value cannot say one thing to the check and another to whoever reads it next. */
function plainCopy(value: unknown): { copy: unknown } | { problem: string } {
  // Every value and every character of a text or field name takes at least one byte of JSON.
  let room: number = L.bytes;
  let problem = "";
  const refuse = (message: string) => void (problem ||= message);
  const spend = (n: number) => (room -= n) >= 0 || (refuse(`is larger than ${L.bytes / 1024} KB.`), false);
  const walk = (v: unknown, depth: number): unknown => {
    if (problem || !spend(typeof v === "string" ? v.length + 1 : 1)) return null;
    if (v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) return v;
    if (typeof v !== "object") return refuse(NOT_PLAIN);
    if (depth > L.depth) return refuse(`is nested more than ${L.depth} levels deep.`);
    if (Array.isArray(v)) {
      // By index: a hole in a list is not a value, and a very long empty list ends at the limit.
      const out: unknown[] = [];
      for (let i = 0; i < v.length && !problem; i++) out.push(walk(v[i], depth + 1));
      return out;
    }
    const proto: unknown = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return refuse(NOT_PLAIN);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      if (problem || !spend(k.length)) break;
      // A plain record: "__proto__" and friends are data here, never the object's prototype.
      Object.defineProperty(out, k, { value: walk((v as Record<string, unknown>)[k], depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return out;
  };
  const copy = walk(value, 1);
  if (!problem && new TextEncoder().encode(JSON.stringify(copy)).length > L.bytes) refuse(`is larger than ${L.bytes / 1024} KB.`);
  return problem ? { problem } : { copy };
}

/** Checks an untrusted deck description, already read from JSON. What passes is returned as a copy of its own: use
 * that, not the value given. */
export function checkDeckDescription(value: unknown): FormatCheck<DeckDescription> {
  const plain = plainCopy(value);
  if ("problem" in plain) return { ok: false, problems: [{ path: "", line: null, message: `The deck description ${plain.problem}` }] };
  return checkFormat({ family: "ziffr.deck", reads: [DECK_DESCRIPTION_FORMAT], schema: DECK_DESCRIPTION_SCHEMA, meaning }, plain.copy);
}
