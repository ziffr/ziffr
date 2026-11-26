// The Pack format, ziffr.pack/1 (GLOSSARY: Pack): one file of things to add to a Workspace, with no code, and its
// manifest (name, version, author, license). Each item is a document in a format Ziffr already checks, and is checked
// by exactly that format's checks; this file only wraps them. docs/reference is generated from the schema below.
// The one image it may bring is `logo` (spec 0039), held to the shared logo checks. Security: a Pack is untrusted input. Its size, depth and number of items are limited before anything is walked,
// unknown and repeated fields are refused, "__proto__" is read as data, web addresses appear only in `listing`, an
// item may name only items of the same Pack, and texts that address an assistant are reported for a person to see.
import { checkFormat, parseJson, under, type FormatCheck, type Problem, type Schema } from "./json-check.js";
import { itemKey, plainText } from "./file-text.js";
import { checkMetricFile1Value, METRIC_FILE_LIMITS, type MetricFile } from "./metric-file.js";
import { checkDashboardTemplateFileValue, dashboardTemplateReferences, DASHBOARD_TEMPLATE_LIMITS, type DashboardTemplateFile } from "./dashboard-template-file.js";
import { checkThemeFileValue, THEME_FILE_LIMITS, type ThemeFile } from "./theme-file.js";
import { cleanLogo, logoProblem, PACK_LOGO_MAX_BYTES } from "./logo.js";
import { checkDeckTemplateFileValue, deckTemplateReferences, DECK_TEMPLATE_LIMITS, type DeckTemplateFile } from "./deck-template-file.js";
import { checkWorkflowTemplateFileValue, WORKFLOW_TEMPLATE_LIMITS, type WorkflowTemplateFile } from "./workflow-template-file.js";
import { checkViewDesignValue, VIEW_LIMITS, type ViewDesign } from "./view-design.js";
import { checkAnalysisRecipeValue, RECIPE_LIMITS, type AnyAnalysisRecipe } from "./analysis-recipe.js";
import { checkPackFormula, type FormulaEntry } from "./formula-check.js";
import { textsAimedAtAssistants } from "./assistant-words.js";
import { AUDIENCE_SCHEMA, checkAudience, type PackAudience } from "./audience.js";

/** The format this Ziffr writes; it reads every version in `PACK_FORMATS`. */
export const PACK_FORMAT = "ziffr.pack/1";
/** Every Pack format Ziffr ever published, oldest first. */
export const PACK_FORMATS = [PACK_FORMAT] as const;
/** The exact limits a Pack is held to (spec 0030): 1 MiB, 200 items, 50 of a kind. Each item is also held to its own
 * format's limits. */
export const PACK_LIMITS = { bytes: 1_048_576, depth: 20, items: 200, perKind: 50, name: 80, summary: 300, author: 80, address: 200, logoBytes: PACK_LOGO_MAX_BYTES, feeds: 10, feedFills: 50 } as const;
/** The Automation Templates for Feeds a Pack may name (spec 0043): ids of the list Ziffr ships in docs/automations/feed-templates.json, and only those, so that everything that ends up in someone's n8n was reviewed here. A test holds this list and that file to each other. */
export const FEED_TEMPLATE_IDS = ["google-sheets", "excel", "stripe", "hubspot", "bigquery", "snowflake"] as const;
/** What Ziffr says of a Pack file from outside the Marketplace, in the spec's words. */
export const UNSIGNED_WARNING = "Uploaded file. The Marketplace did not check it.";
/** The licenses a Pack may carry: CC BY 4.0 or MIT for a free one, the Ziffr Pack License for a paid one. */
export const PACK_LICENSES = ["CC-BY-4.0", "MIT", "Ziffr-Pack-1.0"] as const;

/** The kinds of things a Pack holds, each with the field its document is in and how that document is checked. */
const KINDS = {
  metrics: { field: "metric", what: "Metric Catalog entries", format: "ziffr.metric/1", bytes: METRIC_FILE_LIMITS.bytes, check: checkMetricFile1Value },
  dashboards: { field: "template", what: "Dashboard Templates", format: "ziffr.dashboard-template/1", bytes: DASHBOARD_TEMPLATE_LIMITS.bytes, check: checkDashboardTemplateFileValue },
  views: { field: "design", what: "View Designs", format: "ziffr.view/1", bytes: VIEW_LIMITS.bytes, check: (v: unknown, l: Map<string, number>): FormatCheck<ViewDesign> => { const r = checkViewDesignValue(v, l); return r.ok ? { ok: true, value: r.design } : r; } },
  analyses: { field: "recipe", what: "Analysis Recipes", format: "ziffr.analysis/1 or ziffr.analysis/2", bytes: RECIPE_LIMITS.bytes, check: (v: unknown, l: Map<string, number>): FormatCheck<AnyAnalysisRecipe> => { const r = checkAnalysisRecipeValue(v, l); return r.ok ? { ok: true, value: r.recipe } : r; } },
  themes: { field: "theme", what: "Themes", format: "ziffr.theme/1 or ziffr.theme/2", bytes: THEME_FILE_LIMITS.bytes, check: checkThemeFileValue },
  decks: { field: "template", what: "Deck Templates", format: "ziffr.deck-template/1, ziffr.deck-template/2 or ziffr.deck-template/3", bytes: DECK_TEMPLATE_LIMITS.bytes, check: checkDeckTemplateFileValue },
  workflows: { field: "template", what: "Workflow Templates", format: "ziffr.workflow-template/1", bytes: WORKFLOW_TEMPLATE_LIMITS.bytes, check: checkWorkflowTemplateFileValue },
} as const;
/** A kind of thing in a Pack, as its manifest names the list. */
export type PackKind = keyof typeof KINDS;

/** One item of a Pack: its key, unique in the Pack and kept across versions, and its document. */
export type PackItem<F extends string, T> = { key: string } & Record<F, T>;
/** A Pack as a file (GLOSSARY: Pack), in the newest format. */
export type Pack = {
  format: typeof PACK_FORMAT;
  id: string;
  name: string;
  version: string;
  summary: string;
  author: { name: string };
  license: (typeof PACK_LICENSES)[number];
  ziffr?: string;
  /** Whom the Pack is for (spec 0052): ranks it in the Setup Guide, never hides it. Needs `ziffr` beside it. */
  audience?: PackAudience;
  logo?: string;
  listing?: { homepage?: string; support?: string };
  /** Which Automation Templates fill which of its Metric Catalog entries (spec 0043). Installing makes nothing of it. */
  feeds?: { template: (typeof FEED_TEMPLATE_IDS)[number]; fills: string[] }[];
  contents: {
    metrics?: PackItem<"metric", MetricFile>[];
    dashboards?: PackItem<"template", DashboardTemplateFile>[];
    views?: PackItem<"design", ViewDesign>[];
    analyses?: PackItem<"recipe", AnyAnalysisRecipe>[];
    themes?: PackItem<"theme", ThemeFile>[];
    decks?: PackItem<"template", DeckTemplateFile>[];
    workflows?: PackItem<"template", WorkflowTemplateFile>[];
  };
};

// An https address: a host of letters, digits, dots and dashes (no user name, so nothing before an @), an optional
// port, and a path and query without spaces, quotes or angle brackets.
const ADDRESS: Schema = {
  type: "string",
  maxLength: PACK_LIMITS.address,
  pattern: "^https://[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?)+(?::[0-9]{1,5})?(?:/[A-Za-z0-9._~%!$&'()*+,;=:@/-]*)?(?:\\?[A-Za-z0-9._~%!$&'()*+,;=:@/?-]*)?$",
  description: "an https address, such as “https://example.com/help”",
};
const item = (kind: PackKind): Schema => ({
  type: "array",
  maxItems: PACK_LIMITS.perKind,
  description: `${KINDS[kind].what}, each a ${KINDS[kind].format} document under “${KINDS[kind].field}”.`,
  items: {
    type: "object",
    properties: { key: itemKey("a key unique in the Pack and kept across its versions: lower-case letters, digits and dashes"), [KINDS[kind].field]: { type: "object", description: `A ${KINDS[kind].format} document, checked by its own schema.` } },
    required: ["key", KINDS[kind].field],
    additionalProperties: false,
  },
});

/** The JSON Schema of ziffr.pack/1: the one definition the checks run and docs/reference is generated from. Each
 * item's document is held to its own published schema (metric, dashboard-template, deck-template, view-design,
 * analysis-recipe, workflow-template, theme). */
export const PACK_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.net/schemas/ziffr.pack-1.json",
  title: "Ziffr Pack (ziffr.pack/1)",
  description: "A file of things to add to a Workspace, with no code: Metric Catalog entries, Dashboard and Deck Templates, View Designs, Analysis Recipes, Workflow Templates and Themes, with its name, version, author and license.",
  type: "object",
  properties: {
    format: { const: PACK_FORMAT, description: "The format and its version." },
    id: { type: "string", maxLength: 100, pattern: "^[a-z0-9][a-z0-9-]{0,38}/[a-z0-9][a-z0-9-]{0,59}$", description: "the creator's Marketplace handle and a slug, such as “ziffr/saas-metrics”, the same for every version" },
    name: { ...plainText(PACK_LIMITS.name), minLength: 1 },
    version: { type: "string", maxLength: 20, pattern: "^(?:0|[1-9][0-9]{0,5})\\.(?:0|[1-9][0-9]{0,5})\\.(?:0|[1-9][0-9]{0,5})$", description: "three numbers, major, minor and patch, such as “1.2.0”" },
    summary: { ...plainText(PACK_LIMITS.summary), minLength: 1 },
    author: { type: "object", properties: { name: { ...plainText(PACK_LIMITS.author), minLength: 1 } }, required: ["name"], additionalProperties: false },
    license: { enum: [...PACK_LICENSES], description: "CC-BY-4.0 or MIT for a free Pack, Ziffr-Pack-1.0 for a paid one." },
    ziffr: { type: "string", maxLength: 20, pattern: "^>=(?:0|[1-9][0-9]{0,3})\\.(?:0|[1-9][0-9]{0,3})(?:\\.(?:0|[1-9][0-9]{0,3}))?$", description: "the oldest Ziffr that can install it, such as “>=0.12”" },
    audience: AUDIENCE_SCHEMA,
    logo: {
      type: "string",
      // 4 base64 characters per 3 bytes, and the longest prefix a data address has.
      maxLength: Math.ceil((PACK_LOGO_MAX_BYTES * 4) / 3) + 30,
      pattern: "^data:image/(?:png|jpeg|svg\\+xml);base64,[A-Za-z0-9+/]+={0,2}$",
      description: `The Pack's one logo, as a PNG, JPEG or plain SVG data address: at most ${PACK_LOGO_MAX_BYTES.toLocaleString("en")} bytes and 512 pixels on each side. Shown only in a bordered box on the Packs page and the Marketplace; Themes of the Pack may use it with "logo": "pack".`,
    },
    listing: {
      type: "object",
      description: "The only place a Pack may hold web addresses, shown on its pages as plain links.",
      properties: { homepage: ADDRESS, support: ADDRESS },
      additionalProperties: false,
    },
    feeds: {
      type: "array",
      maxItems: PACK_LIMITS.feeds,
      description: "Which of Ziffr's n8n templates fill which of the Pack's Metric Catalog entries (spec 0043). Only ids Ziffr ships are accepted. Installing makes nothing of it: after Set up, the page offers the download for the Metrics made from the entries. A Pack that uses it should say so in its `ziffr` minimum version.",
      items: {
        type: "object",
        properties: {
          template: { enum: [...FEED_TEMPLATE_IDS], description: "the id of one of the templates Ziffr ships, such as “google-sheets”" },
          fills: { type: "array", minItems: 1, maxItems: PACK_LIMITS.feedFills, items: itemKey("the key of a Metric Catalog entry of this Pack the template fills") },
        },
        required: ["template", "fills"],
        additionalProperties: false,
      },
    },
    contents: {
      type: "object",
      description: "What installing adds. Nothing in it may hold a web address.",
      properties: Object.fromEntries((Object.keys(KINDS) as PackKind[]).map((k) => [k, item(k)])),
      additionalProperties: false,
    },
  },
  required: ["format", "id", "name", "version", "summary", "author", "license", "contents"],
  additionalProperties: false,
};

/** The result of checking a Pack: the Pack with what a person must see before installing it, or every problem found. */
export type PackCheck =
  | { ok: true; pack: Pack; items: number; needsOwner: boolean; assistantTexts: { path: string; line: number | null; text: string }[] }
  | { ok: false; problems: Problem[] };

/** The three numbers of a version, to compare. */
const numbers = (v: string) => v.replace(/^>=/, "").split(".").map(Number);
/** Whether version `a` is lower than `b`, by major, minor and patch. */
export function versionBelow(a: string, b: string): boolean {
  const [x, y] = [numbers(a), numbers(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
}

/** Checks a Pack's text before anything is shown or written: size and depth, the manifest, every item by its own
 * format's checks, the references between items, and, when `ziffr` (a Ziffr's version) is given, the Ziffr it needs. */
export function checkPack(textIn: string, ziffr?: string): PackCheck {
  const parsed = parseJson(textIn, { maxBytes: PACK_LIMITS.bytes, maxDepth: PACK_LIMITS.depth });
  if (!parsed.ok) return parsed;
  return checkPackValue(parsed.value, parsed.lines, ziffr);
}

/** Checks a Pack already read from JSON (`lines` names where each path starts, when known). */
export function checkPackValue(value: unknown, lines: Map<string, number> = new Map(), ziffr?: string): PackCheck {
  const res = checkFormat({ family: "ziffr.pack", reads: PACK_FORMATS, schema: PACK_SCHEMA, meaning: (p: Pack, at) => meaning(p, lines, ziffr, at) }, value, lines);
  if (!res.ok) return res;
  // The logo leaves as Ziffr wrote it out itself (an SVG is serialized again from what was parsed): what was checked is
  // exactly what is stored and served.
  const pack = res.value.logo === undefined ? res.value : { ...res.value, logo: cleanLogo(res.value.logo, PACK_LOGO_MAX_BYTES) ?? res.value.logo };
  const kinds = Object.keys(KINDS) as PackKind[];
  return {
    ok: true,
    pack,
    items: kinds.reduce((n, k) => n + (pack.contents[k]?.length ?? 0), 0),
    needsOwner: (pack.contents.themes?.length ?? 0) > 0,
    // Only the texts people and assistants read: names, descriptions and words. Keys, formats and enums cannot hold
    // a sentence, and `listing` holds only addresses.
    assistantTexts: textsAimedAtAssistants({ name: pack.name, summary: pack.summary, author: pack.author, contents: pack.contents }).map((t) => ({ ...t, line: lines.get(t.path) ?? null })),
  };
}

/** What the schema cannot say: how many items, keys unique, each item by its own checks, references inside the Pack. */
function meaning(p: Pack, lines: Map<string, number>, ziffr: string | undefined, at: (path: string, message: string) => void) {
  if (ziffr && p.ziffr && versionBelow(ziffr, p.ziffr)) {
    at("ziffr", `This Pack needs Ziffr ${p.ziffr.replace(/^>=/, "")} or later; this is Ziffr ${ziffr}.`);
    return;
  }
  if (p.audience !== undefined) checkAudience(p.audience, p.ziffr, at);
  if (p.logo !== undefined) {
    const why = logoProblem(p.logo, PACK_LOGO_MAX_BYTES);
    if (why) at("logo", why);
  }
  const kinds = (Object.keys(KINDS) as PackKind[]).filter((k) => p.contents[k]);
  const total = kinds.reduce((n, k) => n + p.contents[k]!.length, 0);
  if (total === 0) at("contents", "holds nothing: a Pack adds at least one thing.");
  if (total > PACK_LIMITS.items) at("contents", `holds ${total} items; at most ${PACK_LIMITS.items} are allowed.`);
  const seen = new Map<string, string>();
  for (const k of kinds) {
    const { field, bytes, check } = KINDS[k];
    (p.contents[k] as Record<string, unknown>[]).forEach((it, i) => {
      const here = `contents.${k}[${i}]`;
      const key = it.key as string;
      if (seen.has(key)) at(`${here}.key`, `“${key}” is the key of ${seen.get(key)} already: every item needs a key of its own.`);
      else seen.set(key, here);
      const doc = it[field];
      const size = new TextEncoder().encode(JSON.stringify(doc)).length;
      if (size > bytes) return at(`${here}.${field}`, `is ${size.toLocaleString("en")} bytes; at most ${bytes.toLocaleString("en")} are allowed for one of ${KINDS[k].what}.`);
      const path = `${here}.${field}`;
      const r = k === "themes"
        ? checkThemeFileValue(doc, new Map(), p.logo === undefined ? "pack-without-logo" : "pack-with-logo")
        : (check as (v: unknown, l: Map<string, number>) => FormatCheck<unknown>)(doc, new Map());
      if (!r.ok) for (const x of r.problems) at(under(path, x).path, x.message);
    });
  }
  references(p, at);
}

/** Every item names only items of the same Pack: a Slot's suggested entry, a widget's View Design, a formula's inputs. */
function references(p: Pack, at: (path: string, message: string) => void) {
  const metrics = p.contents.metrics ?? [];
  const keys = (k: PackKind) => new Set((p.contents[k] ?? []).map((x) => x.key));
  const known = { metrics: keys("metrics"), views: keys("views"), themes: keys("themes") };
  const what = { metrics: "a Metric Catalog entry", views: "a View Design", themes: "a Theme" };
  const named = (here: string, refs: Partial<Record<keyof typeof known, { path: string; key: string }[]>>) => {
    for (const k of Object.keys(refs) as (keyof typeof known)[])
      for (const r of refs[k]!) if (!known[k].has(r.key)) at(`${here}.${r.path}`, `names “${r.key}”, which is not ${what[k]} of this Pack.`);
  };
  // A template may fill only entries of this Pack, and is named once, an entry once for it.
  const templates = new Set<string>();
  (p.feeds ?? []).forEach((f, i) => {
    if (templates.has(f.template)) at(`feeds[${i}].template`, `“${f.template}” is named already: list the entries it fills together.`);
    templates.add(f.template);
    const once = new Set<string>();
    f.fills.forEach((k, j) => {
      if (!known.metrics.has(k)) at(`feeds[${i}].fills[${j}]`, `names “${k}”, which is not ${what.metrics} of this Pack.`);
      else if (metrics.find((m) => m.key === k)?.metric.formula !== undefined) at(`feeds[${i}].fills[${j}]`, `names “${k}”, a Derived Metric: it is computed and takes no values, so a template cannot fill it.`);
      if (once.has(k)) at(`feeds[${i}].fills[${j}]`, `names “${k}” twice.`);
      once.add(k);
    });
  });
  (p.contents.dashboards ?? []).forEach((d, i) => named(`contents.dashboards[${i}].template`, dashboardTemplateReferences(d.template)));
  (p.contents.decks ?? []).forEach((d, i) => named(`contents.decks[${i}].template`, deckTemplateReferences(d.template)));
  // A Derived Metric's formula names the Pack's other entries by key, held to every rule a formula in a Workspace is.
  const inputs: FormulaEntry[] = metrics.map((m) => ({ key: m.key, name: m.metric.name, period: m.metric.period, aggregation: m.metric.aggregation, derived: m.metric.formula !== undefined }));
  metrics.forEach((m, i) => {
    if (m.metric.formula === undefined) return;
    const why = checkPackFormula(m.metric.formula, inputs, { key: m.key, period: m.metric.period });
    if (why) at(`contents.metrics[${i}].metric.formula`, why);
  });
}
