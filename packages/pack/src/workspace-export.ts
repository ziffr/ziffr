// The Workspace Export format, ziffr.workspace-export/1 (GLOSSARY: Workspace Export, Pack): a whole Workspace as one
// file of JSON Lines, one record per line, so a writer can stream it and a reader can check it line by line without
// holding it. It lives beside the Pack format (MIT) because it reuses the Pack's formats for what both carry (Metric
// Descriptions, dashboard, deck and Workflow templates, Themes) and the Pack's checks for text, so one set of checks
// serves both and anyone may read or write such a file. The schema below is the one definition the checks run and
// docs/reference/workspace-export.schema.json is generated from.
// Security: a Workspace Export is an untrusted file whoever made it (AGENTS rule 4). Line length, nesting, the number
// of records of each kind and of all are capped before a record is walked; every record is held to a closed schema
// (an unknown field is refused, so no secret, key, ciphertext or Connector link can ride along); ids are labels that
// stand for rows of the file only, never database ids, and every reference must name a record already read; numbers
// are finite and bounded, dates real and in range; text follows the Pack's plain-text rules; "__proto__" and its kin
// are data (ids are held in Maps, keys are refused by pattern). Nothing here runs or queries what it reads.
import { checkSchema, MAX_PROBLEMS, parseJson, under, type Problem, type Schema } from "./json-check.js";
import { itemKey, plainText } from "./file-text.js";
import { checkMetricFileValue, METRIC_FILE_LIMITS, type MetricFile } from "./metric-file.js";
import { checkDashboardTemplateFileValue, DASHBOARD_TEMPLATE_LIMITS, dashboardTemplateReferences, refusedOutsidePack, type DashboardTemplateFile } from "./dashboard-template-file.js";
import { checkDeckTemplateFileValue, DECK_TEMPLATE_LIMITS, deckTemplateReferences, type DeckTemplateFile } from "./deck-template-file.js";
import { checkWorkflowTemplateFileValue, WORKFLOW_TEMPLATE_LIMITS, type WorkflowTemplateFile } from "./workflow-template-file.js";
import { checkThemeFileValue, THEME_FILE_LIMITS, type ThemeFile } from "./theme-file.js";
import { checkPackFormula, type FormulaEntry } from "./formula-check.js";
import type { Period, SourceId } from "./kinds.js";

/** The format this Ziffr writes; it reads every version in `WORKSPACE_EXPORT_FORMATS`. */
export const WORKSPACE_EXPORT_FORMAT = "ziffr.workspace-export/1";
/** Every Workspace Export format Ziffr ever published, oldest first. */
export const WORKSPACE_EXPORT_FORMATS = [WORKSPACE_EXPORT_FORMAT] as const;

/** The records of a file, in the order they must come: a record may name only records of an earlier or the same step,
 * and a file never goes back a step. This is what lets a reader check references while it streams. */
export const WORKSPACE_EXPORT_KINDS = ["header", "group", "theme", "person", "metric", "dashboard", "deck", "workflow", "share", "target", "projection", "value", "end"] as const;
/** One of WORKSPACE_EXPORT_KINDS. */
export type WorkspaceExportKind = (typeof WORKSPACE_EXPORT_KINDS)[number];
const STEP: Record<WorkspaceExportKind, number> = { header: 0, group: 1, theme: 1, person: 2, metric: 3, dashboard: 4, deck: 4, workflow: 4, share: 5, target: 6, projection: 6, value: 6, end: 7 };

/** The exact limits a file is held to. The two byte limits are the reader's (an Installation setting may lower or
 * raise them); the rest belong to the format. A Workspace Limit of the destination is checked by the import, not here. */
export const WORKSPACE_EXPORT_LIMITS = {
  fileBytes: 200 * 1024 * 1024,
  textBytes: 1024 * 1024 * 1024,
  /** The longest line: a deck template of 512 KiB and its envelope. */
  lineBytes: 640 * 1024,
  depth: 20,
  records: 10_000_000,
  perKind: { group: 1_000, theme: 200, person: 5_000, metric: 10_000, dashboard: 2_000, deck: 2_000, workflow: 1_000, share: 100_000, target: 1_000_000, projection: 1_000_000, value: 8_000_000 },
  name: 120,
  id: 64,
  email: 254,
  tags: 12,
  tag: 30,
  breakdown: 200,
  label: 60,
  slotMetrics: 50,
  workflowMetrics: 1_000,
  submitters: 100,
  groupsOfPerson: 50,
  magnitude: 1e15,
  decimals: 6,
  firstYear: 1900,
  lastYear: 2200,
} as const;
const L = WORKSPACE_EXPORT_LIMITS;

/** The limits the byte-level reader may be given: the two sizes an Installation setting changes. */
export type WorkspaceExportReaderLimits = { fileBytes: number; textBytes: number };

/** The kinds of record that hold things counted by `perKind`. */
type Counted = keyof typeof L.perKind;

// ---------------------------------------------------------------------------------------------------------------------
// The records, as TypeScript sees them.

/** What the Workspace's Owner chose that travels in version 1. */
export type WorkspaceExportSettings = { name: string; timeZone?: string; language?: string; yearStart?: number; attainmentMethod?: "ratio" | "distance" };
/** The first line: what the file is. */
export type HeaderRecord = { kind: "header"; format: typeof WORKSPACE_EXPORT_FORMAT; ziffr: string; exportedAt: string; workspace: WorkspaceExportSettings };
/** A Group: its name; its people name it on their own record. */
export type GroupRecord = { kind: "group"; id: string; name: string };
/** A Theme of the Workspace, as the Theme file format. */
export type ThemeRecord = { kind: "theme"; id: string; theme: ThemeFile };
/** A person, as an invitation: name, address, Workspace Role and Groups. Never an id, key or sign-in of the old Workspace. */
export type PersonRecord = { kind: "person"; id: string; name: string; email: string; role: "admin" | "member" | "guest"; groups?: string[] };
/** A Metric: its Description as the Metric file format, its key (how formulas name it), Tags, owner and Submitters. */
export type MetricRecord = { kind: "metric"; id: string; key: string; metric: MetricFile; tags?: string[]; owner?: string; submitters?: string[] };
/** A dashboard: a Dashboard Template file whose Slots are filled with these Metrics. */
export type DashboardRecord = { kind: "dashboard"; id: string; dashboard: DashboardTemplateFile; slots: string[][] };
/** A deck: a Deck Template file whose Slots are filled with these Metrics, and its Theme. */
export type DeckRecord = { kind: "deck"; id: string; deck: DeckTemplateFile; slots: string[][]; theme?: string };
/** A Workflow: a Workflow Template file and the Metrics it asks for. */
export type WorkflowRecord = { kind: "workflow"; id: string; workflow: WorkflowTemplateFile; metrics: string[] };
/** A Share: a dashboard, deck or Metric shown to a Group or a person. */
export type ShareRecord = { kind: "share"; of: { kind: "dashboard" | "deck" | "metric"; id: string }; with: { kind: "group" | "person"; id: string } };
/** A Target Series entry: the Target Range of one period. */
export type TargetRecord = { kind: "target"; metric: string; period: string; min?: number; max?: number };
/** A Projection: a value for a future period. */
export type ProjectionRecord = { kind: "projection"; metric: string; period: string; value: number };
/** A value: one observation, with who submitted it as a name and its Breakdown. */
export type ValueRecord = { kind: "value"; metric: string; period: string; value: number; recordedAt?: string; source?: SourceId | "import"; submittedBy?: string; breakdown?: { label: string; value: number }[] };
/** The last line: how many records of each kind the file holds, so a cut-off file is noticed. */
export type EndRecord = { kind: "end"; counts: Record<Counted, number> };
/** One line of a Workspace Export. */
export type WorkspaceExportRecord = HeaderRecord | GroupRecord | ThemeRecord | PersonRecord | MetricRecord | DashboardRecord | DeckRecord | WorkflowRecord | ShareRecord | TargetRecord | ProjectionRecord | ValueRecord | EndRecord;

// ---------------------------------------------------------------------------------------------------------------------
// The schema.

const ID = "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$";
const id = (what: string): Schema => ({ type: "string", pattern: ID, description: `${what}: a label of up to ${L.id} letters, digits, dashes and underscores, standing for one record of this file only` });
const ref = (what: string): Schema => id(`the label of ${what} of this file, listed before this record`);
const refs = (what: string, max: number, min = 0): Schema => ({ type: "array", minItems: min, maxItems: max, items: ref(what), description: `The labels of ${what}.` });
const obj = (properties: Record<string, Schema>, required: string[], description?: string): Schema => ({ type: "object", ...(description ? { description } : {}), properties, required, additionalProperties: false });
const number = (description: string): Schema => ({ type: "number", minimum: -L.magnitude, maximum: L.magnitude, description });
const PERIOD_START = { type: "string", maxLength: 10, pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", description: "The first day of the period, as YYYY-MM-DD." } satisfies Schema;
const INSTANT = { type: "string", maxLength: 24, pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,3})?Z$", description: "A moment in UTC, as YYYY-MM-DDTHH:MM:SSZ." } satisfies Schema;
const record = (kind: WorkspaceExportKind, description: string, properties: Record<string, Schema>, required: string[]): Schema =>
  obj({ kind: { const: kind, description: "Which record this line is." }, ...properties }, ["kind", ...required], description);
const slots: Schema = { type: "array", minItems: 1, maxItems: DASHBOARD_TEMPLATE_LIMITS.slots, items: refs("the Metrics that fill one Slot", L.slotMetrics, 1), description: "The Metrics that fill each Slot of the template, in order." };

/** The JSON Schema of one line of ziffr.workspace-export/1: the one definition the checks run and docs/reference is
 * generated from. The documents inside a record (`metric`, `dashboard`, ...) are held to their own published schemas. */
export const WORKSPACE_EXPORT_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.net/schemas/ziffr.workspace-export-1.json",
  title: "Ziffr Workspace Export, one line (ziffr.workspace-export/1)",
  description: "One record of a Workspace Export: a file of JSON Lines that holds a whole Workspace for another Installation to import, with no secret, key, Connector link or sealed data. The first line is a header, the last an end record, and a record names only records before it.",
  oneOf: [
    record("header", "The first line: what the file is and the Workspace's own settings.", {
      format: { const: WORKSPACE_EXPORT_FORMAT, description: "The format and its version." },
      ziffr: { type: "string", maxLength: 40, pattern: "^[0-9]{1,4}\\.[0-9]{1,4}\\.[0-9]{1,4}(?:-[0-9A-Za-z.-]{1,30})?$", description: "The Ziffr release that wrote the file." },
      exportedAt: INSTANT,
      workspace: obj({
        name: { ...plainText(80), minLength: 1 },
        timeZone: { type: "string", maxLength: 64, pattern: "^[A-Za-z][A-Za-z0-9_+/-]{0,63}$", description: "A time zone name such as “Europe/Berlin”." },
        language: { type: "string", maxLength: 5, pattern: "^[a-z]{2}(?:-[A-Z]{2})?$", description: "A language such as “en” or “de-AT”." },
        yearStart: { type: "integer", minimum: 1, maximum: 12, description: "The month the Workspace's year starts in (its Fiscal Year); left out, January." },
        attainmentMethod: { enum: ["ratio", "distance"], description: "How Attainment is computed in the Workspace." },
      }, ["name"], "The settings of the Workspace an Owner chose."),
    }, ["format", "ziffr", "exportedAt", "workspace"]),
    record("group", "A Group of people.", { id: id("this Group"), name: { ...plainText(80), minLength: 1 } }, ["id", "name"]),
    record("theme", "A Theme of the Workspace, as a ziffr.theme/1 document.", { id: id("this Theme"), theme: { type: "object", description: "A ziffr.theme/1 document, checked by its own schema." } }, ["id", "theme"]),
    record("person", "A person, as an invitation the new Owner chooses to send. Nothing of their account travels.", {
      id: id("this person"),
      name: { ...plainText(L.name), minLength: 1 },
      email: { type: "string", minLength: 3, maxLength: L.email, pattern: "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$", description: "an email address, such as “ada@example.com”" },
      role: { enum: ["admin", "member", "guest"], description: "The Workspace Role to invite them with. The Owner of the old Workspace is listed as an admin: the person who imports becomes the Owner." },
      groups: refs("the Groups they belong to", L.groupsOfPerson),
    }, ["id", "name", "email", "role"]),
    record("metric", "A Metric: its Description, Tags, owner and Submitters. Its values are separate records.", {
      id: id("this Metric"),
      key: itemKey("the Metric's key, which a Derived Metric's formula names as {key}: lower-case letters, digits and dashes, unique in the file"),
      metric: { type: "object", description: "A ziffr.metric/1 document, checked by its own schema." },
      tags: { type: "array", maxItems: L.tags, items: { ...plainText(L.tag), minLength: 1 }, description: "The Tags put on the Metric." },
      owner: ref("the person who owns it"),
      submitters: refs("the people who send its values", L.submitters),
    }, ["id", "key", "metric"]),
    record("dashboard", "A dashboard, as a ziffr.dashboard-template/1 document and the Metrics that fill its Slots.", { id: id("this dashboard"), dashboard: { type: "object", description: "A ziffr.dashboard-template/1 document, checked by its own schema." }, slots }, ["id", "dashboard", "slots"]),
    record("deck", "A deck, as a ziffr.deck-template/1 document, the Metrics that fill its Slots and its Theme.", { id: id("this deck"), deck: { type: "object", description: "A ziffr.deck-template/1 document, checked by its own schema." }, slots, theme: ref("the Theme it starts with") }, ["id", "deck", "slots"]),
    record("workflow", "A Workflow, as a ziffr.workflow-template/1 document and the Metrics it asks for.", { id: id("this Workflow"), workflow: { type: "object", description: "A ziffr.workflow-template/1 document, checked by its own schema." }, metrics: refs("the Metrics it asks for", L.workflowMetrics, 1) }, ["id", "workflow", "metrics"]),
    record("share", "A dashboard, deck or Metric shown to a Group or a person.", {
      of: obj({ kind: { enum: ["dashboard", "deck", "metric"] }, id: ref("what is shared") }, ["kind", "id"]),
      with: obj({ kind: { enum: ["group", "person"] }, id: ref("who it is shared with") }, ["kind", "id"]),
    }, ["of", "with"]),
    record("target", "The Target Range of one period of a Metric (a Target Series entry).", { metric: ref("the Metric"), period: PERIOD_START, min: number("The lower end."), max: number("The upper end.") }, ["metric", "period"]),
    record("projection", "A value for a future period of a Metric.", { metric: ref("the Metric"), period: PERIOD_START, value: number("The projected value.") }, ["metric", "period", "value"]),
    record("value", "One observation of a Metric for one period.", {
      metric: ref("the Metric"),
      period: PERIOD_START,
      value: number(`The value, with at most ${L.decimals} decimals.`),
      recordedAt: INSTANT,
      source: { enum: ["web_form", "mail", "slack", "telegram", "api", "import"], description: "Where it arrived from; an import records every value as an Import whatever this says." },
      submittedBy: { ...plainText(L.name), minLength: 1, description: "Who submitted it, as a name, never an id." },
      breakdown: { type: "array", maxItems: L.breakdown, items: obj({ label: { ...plainText(L.label), minLength: 1 }, value: number("The part of the value.") }, ["label", "value"]), description: "Labelled values that split the observation." },
    }, ["metric", "period", "value"]),
    record("end", "The last line: how many records of each kind the file holds.", {
      counts: obj(Object.fromEntries(Object.keys(L.perKind).map((k) => [k, { type: "integer", minimum: 0, maximum: L.perKind[k as Counted] } satisfies Schema])), Object.keys(L.perKind), "The records of each kind, header and end not counted."),
    }, ["counts"]),
  ],
};

// ---------------------------------------------------------------------------------------------------------------------
// The checks.

/** Field names a record may never carry, whatever its schema: said in words instead of "is not a field here". */
const SECRETISH = /key|secret|token|password|cipher|webhook|connector|credential|sealed|signature|session|cookie|salt|nonce|slack|telegram|chat|auth|private|hash|\biv\b/i;

/** The day of a `YYYY-MM-DD` text, or null when it is not a real day between the first and last year. */
function realDay(text: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = text.split("-").map(Number);
  if (y < L.firstYear || y > L.lastYear) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? { y, m, d } : null;
}
/** Whether a `YYYY-MM-DDTHH:MM:SS(.sss)Z` text is a real moment between the first and last year. */
function realInstant(text: string): boolean {
  if (!realDay(text.slice(0, 10))) return false;
  const [h, mi, s] = [Number(text.slice(11, 13)), Number(text.slice(14, 16)), Number(text.slice(17, 19))];
  return h < 24 && mi < 60 && s < 60;
}
/** Whether `v` has no more than `places` decimals. */
const decimalsOk = (v: number, places: number) => Number(v.toFixed(places)) === v;
/** Whether `zone` is a time zone this runtime knows. */
function zoneOk(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
/** Whether a day starts a period of this length: a Monday for a week, the first of the month, of a quarter or of the
 * year as the Workspace's year starts (`yearStart`, 1 to 12), and any day for a day. */
function startsPeriod(day: { y: number; m: number; d: number }, period: Period, yearStart: number): boolean {
  if (period === "week") return new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay() === 1;
  if (period === "day") return true;
  if (day.d !== 1) return false;
  const away = (day.m - yearStart + 12) % 12;
  return period === "month" || (period === "quarter" ? away % 3 === 0 : away === 0);
}

/** The result of checking a whole text: the file's counts, or every problem found (the first 50). */
export type WorkspaceExportCheck = { ok: true; header: HeaderRecord; counts: Record<Counted, number>; records: number } | { ok: false; problems: Problem[] };

/** What the checker keeps of a Metric: enough to check what later records say of it. */
type MetricInfo = { key: string; period: Period; line: number };

/**
 * Checks a Workspace Export one line at a time, holding only the labels of what it has read (never the values), so
 * a reader streams a file of any size within its limits. `line()` is called once per line, in order, and returns that
 * line's problems with the record when it is sound; `finish()` returns what only the whole file shows. Nothing is
 * written anywhere: the caller decides what a problem means (an import stops at the first).
 */
export class WorkspaceExportChecker {
  private n = 0;
  private step = 0;
  private header: HeaderRecord | undefined;
  private ended = false;
  /** Labels by kind: the records already read that a later record may name. */
  private readonly ids = { group: new Set<string>(), theme: new Set<string>(), person: new Set<string>(), dashboard: new Set<string>(), deck: new Set<string>(), workflow: new Set<string>() };
  private readonly metrics = new Map<string, MetricInfo>();
  private readonly metricKeys = new Map<string, number>();
  private readonly metricEntries = new Map<string, { entry: FormulaEntry; formula?: string; line: number }>();
  private readonly emails = new Set<string>();
  private readonly shares = new Set<string>();
  private readonly counts: Record<Counted, number> = { group: 0, theme: 0, person: 0, metric: 0, dashboard: 0, deck: 0, workflow: 0, share: 0, target: 0, projection: 0, value: 0 };
  /** The last target and projection read, as `metric period`: each kind is listed in strictly rising order, so a repeat is seen with no memory. */
  private last = { target: "", projection: "" };
  private declared: Record<Counted, number> | undefined;

  /** The lines read so far. */
  get lines(): number {
    return this.n;
  }
  /** The header, once the first line was sound. */
  get headerRecord(): HeaderRecord | undefined {
    return this.header;
  }
  /** The records of each kind read so far. */
  get recordCounts(): Readonly<Record<Counted, number>> {
    return this.counts;
  }

  /** Checks the next line of the file (without its line break). */
  line(text: string): { ok: true; record: WorkspaceExportRecord } | { ok: false; problems: Problem[] } {
    this.n++;
    const n = this.n;
    const fail = (path: string, message: string): { ok: false; problems: Problem[] } => ({ ok: false, problems: [{ path, line: n, message }] });
    if (this.n > L.records) return fail("", `The file has more than ${L.records.toLocaleString("en")} lines.`);
    if (this.ended) return fail("", "There is more after the end record: the file ends with it.");
    if (text.trim() === "") return fail("", "This line is empty: every line is one record.");
    const parsed = parseJson(text, { maxBytes: L.lineBytes, maxDepth: L.depth });
    if (!parsed.ok) return { ok: false, problems: parsed.problems.map((p) => ({ ...p, line: n })) };
    const value = parsed.value;
    if (value === null || typeof value !== "object" || Array.isArray(value)) return fail("", "must be an object: a record.");
    const raw = value as Record<string, unknown>;
    const kind = raw.kind;
    if (typeof kind !== "string" || !(WORKSPACE_EXPORT_KINDS as readonly string[]).includes(kind)) {
      return fail("kind", typeof kind === "string" ? `“${kind.slice(0, 40)}” is not a record this Ziffr reads in ${WORKSPACE_EXPORT_FORMAT}; the kinds are ${WORKSPACE_EXPORT_KINDS.map((k) => `“${k}”`).join(", ")}.` : `needs the field “kind”: one of ${WORKSPACE_EXPORT_KINDS.map((k) => `“${k}”`).join(", ")}.`);
    }
    if (n === 1 && kind !== "header") return fail("kind", "The first line of a Workspace Export is its header.");
    if (n > 1 && kind === "header") return fail("kind", "A second header: the header is the first line only.");
    if (n === 1) {
      const fmt = raw.format;
      if (typeof fmt === "string" && fmt.startsWith("ziffr.workspace-export/") && !(WORKSPACE_EXPORT_FORMATS as readonly string[]).includes(fmt)) {
        return fail("format", `This file is in format ${fmt.slice(0, 40)}; this Ziffr reads ${WORKSPACE_EXPORT_FORMATS.join(", ")}.`);
      }
    }
    const k = kind as WorkspaceExportKind;
    if (STEP[k] < this.step) return fail("kind", `A “${k}” record comes after records that must follow it: the file lists ${WORKSPACE_EXPORT_KINDS.map((x) => `“${x}”`).join(", ")} in that order.`);
    this.step = STEP[k];
    // Every record counts, sound or not, so the end record's counts are compared with what the file holds.
    if (k in L.perKind && ++this.counts[k as Counted] > L.perKind[k as Counted]) return fail("kind", `The file holds more than ${L.perKind[k as Counted].toLocaleString("en")} “${k}” records.`);

    // Fields that name a secret are refused in words, before the closed schema says only "not a field here".
    const branch = WORKSPACE_EXPORT_SCHEMA.oneOf!.find((b) => b.properties?.kind?.const === k);
    for (const f of Object.keys(raw)) if (SECRETISH.test(f) && !Object.prototype.hasOwnProperty.call(branch?.properties ?? {}, f)) return fail(f, "is a secret, a key or a link to another system: a Workspace Export never carries one.");

    const problems = checkSchema(WORKSPACE_EXPORT_SCHEMA, raw).map((p) => ({ ...p, line: n }));
    if (problems.length) {
      this.registerLabel(k, raw);
      return { ok: false, problems };
    }
    const out: Problem[] = [];
    const at = (path: string, message: string) => void (out.length < MAX_PROBLEMS && out.push({ path, line: n, message }));
    this.meaning(k, raw as unknown as WorkspaceExportRecord, at);
    if (out.length) return { ok: false, problems: out };
    return { ok: true, record: raw as unknown as WorkspaceExportRecord };
  }

  /** Checks what only the whole file shows: that it ends with its end record, that the counts match, and the formulas
   * of Derived Metrics, which may name Metrics listed after them. */
  finish(): Problem[] {
    const out: Problem[] = [];
    const at = (line: number | null, path: string, message: string) => void (out.length < MAX_PROBLEMS && out.push({ path, line, message }));
    if (this.n === 0) return [{ path: "", line: null, message: "The file is empty." }];
    if (!this.ended) at(this.n, "", "The file has no end record: it may have been cut off while it was written or downloaded.");
    else if (this.declared) {
      for (const k of Object.keys(this.counts) as Counted[]) if (this.declared[k] !== this.counts[k]) at(this.n, `counts.${k}`, `says ${this.declared[k].toLocaleString("en")} but the file holds ${this.counts[k].toLocaleString("en")}.`);
    }
    // The entries are listed once and the loop stops at the problem limit, so 10,000 formulas cost one pass each.
    const entries = new Map([...this.metricEntries.values()].map((e) => [e.entry.key, e.entry] as const));
    for (const { entry, formula, line } of this.metricEntries.values()) {
      if (out.length >= MAX_PROBLEMS) break;
      if (formula === undefined) continue;
      const why = checkPackFormula(formula, entries, { key: entry.key, period: entry.period });
      if (why) at(line, "metric.formula", why);
    }
    return out;
  }

  /** Remembers a label of a record that failed its schema, when it has a sound one, so later records do not all fail for its sake. */
  private registerLabel(k: WorkspaceExportKind, raw: Record<string, unknown>) {
    const label = raw.id;
    if (typeof label !== "string" || !new RegExp(ID).test(label)) return;
    if (k === "metric") {
      if (!this.metrics.has(label)) this.metrics.set(label, { key: typeof raw.key === "string" ? raw.key : "", period: "day", line: this.n });
    } else if (k in this.ids) (this.ids[k as keyof typeof this.ids]).add(label);
  }

  /** The checks a schema cannot make: counts, labels, references, documents by their own formats, and ranges. */
  private meaning(k: WorkspaceExportKind, r: WorkspaceExportRecord, at: (path: string, message: string) => void) {
    // A label is new, and each reference names a record already read.
    const fresh = (kind: keyof typeof this.ids, label: string, path = "id") => {
      if (this.ids[kind].has(label)) at(path, `“${label}” is the label of another ${kind} of this file: every label is used once.`);
      this.ids[kind].add(label);
    };
    const known = (kind: keyof typeof this.ids | "metric", label: string, path: string) => {
      const found = kind === "metric" ? this.metrics.has(label) : this.ids[kind].has(label);
      if (!found) at(path, `names “${label}”, which is no ${kind} listed before this record.`);
    };
    const doc = (path: string, what: string, bytes: number, value: unknown) => {
      const size = new TextEncoder().encode(JSON.stringify(value)).length;
      if (size > bytes) at(path, `is ${size.toLocaleString("en")} bytes; at most ${bytes.toLocaleString("en")} are allowed for one ${what}.`);
      return size <= bytes;
    };
    const merge = (path: string, res: { ok: true } | { ok: false; problems: Problem[] }) => void (!res.ok && res.problems.forEach((p) => at(under(path, p).path, p.message)));
    const distinct = (path: string, list: string[], what: string) => void (new Set(list).size !== list.length && at(path, `names a ${what} twice.`));

    switch (r.kind) {
      case "header": {
        this.header = r;
        if (!realInstant(r.exportedAt)) at("exportedAt", "is not a real moment between the years 1900 and 2200.");
        if (r.workspace.timeZone !== undefined && !zoneOk(r.workspace.timeZone)) at("workspace.timeZone", `“${r.workspace.timeZone}” is not a time zone this Ziffr knows.`);
        return;
      }
      case "group":
        return fresh("group", r.id);
      case "theme": {
        fresh("theme", r.id);
        if (doc("theme", "Theme", THEME_FILE_LIMITS.bytes, r.theme)) merge("theme", checkThemeFileValue(r.theme, new Map(), "standalone"));
        return;
      }
      case "person": {
        fresh("person", r.id);
        const email = r.email.toLowerCase();
        if (this.emails.has(email)) at("email", "is the address of another person of this file: every address is used once.");
        this.emails.add(email);
        r.groups?.forEach((g, i) => known("group", g, `groups[${i}]`));
        distinct("groups", r.groups ?? [], "Group");
        return;
      }
      case "metric": {
        if (this.metrics.has(r.id)) at("id", `“${r.id}” is the label of another metric of this file: every label is used once.`);
        if (this.metricKeys.has(r.key)) at("key", `“${r.key}” is the key of the Metric on line ${this.metricKeys.get(r.key)} already: every Metric needs a key of its own.`);
        this.metricKeys.set(r.key, this.n);
        const sound = doc("metric", "Metric", METRIC_FILE_LIMITS.bytes, r.metric);
        const res = sound ? checkMetricFileValue(r.metric) : undefined;
        if (res) merge("metric", res);
        const m = res && res.ok ? res.value : (r.metric as MetricFile);
        this.metrics.set(r.id, { key: r.key, period: m.period, line: this.n });
        this.metricEntries.set(r.id, { entry: { key: r.key, name: m.name, period: m.period, aggregation: m.aggregation, derived: m.formula !== undefined }, formula: m.formula, line: this.n });
        if (r.owner !== undefined) known("person", r.owner, "owner");
        r.submitters?.forEach((p, i) => known("person", p, `submitters[${i}]`));
        distinct("submitters", r.submitters ?? [], "person");
        distinct("tags", r.tags ?? [], "Tag");
        return;
      }
      case "dashboard": {
        fresh("dashboard", r.id);
        if (doc("dashboard", "dashboard", DASHBOARD_TEMPLATE_LIMITS.bytes, r.dashboard)) {
          const res = checkDashboardTemplateFileValue(r.dashboard);
          // Outside a Pack nothing can be named: a suggested entry or a View Design key has nothing to point to.
          merge("dashboard", res.ok ? refusedOutsidePack(res, Object.values(dashboardTemplateReferences(res.value)).flat(), new Map()) : res);
          this.slots(r.slots, res.ok ? res.value.slots : undefined, at, known);
        }
        return;
      }
      case "deck": {
        fresh("deck", r.id);
        if (doc("deck", "deck", DECK_TEMPLATE_LIMITS.bytes, r.deck)) {
          const res = checkDeckTemplateFileValue(r.deck);
          const refs = res.ok ? Object.values(deckTemplateReferences(res.value)).flat() : [];
          merge("deck", res.ok ? refusedOutsidePack(res, refs, new Map()) : res);
          this.slots(r.slots, res.ok ? res.value.slots : undefined, at, known);
        }
        if (r.theme !== undefined) known("theme", r.theme, "theme");
        return;
      }
      case "workflow": {
        fresh("workflow", r.id);
        if (doc("workflow", "Workflow", WORKFLOW_TEMPLATE_LIMITS.bytes, r.workflow)) merge("workflow", checkWorkflowTemplateFileValue(r.workflow));
        r.metrics.forEach((m, i) => known("metric", m, `metrics[${i}]`));
        distinct("metrics", r.metrics, "Metric");
        return;
      }
      case "share": {
        known(r.of.kind, r.of.id, "of.id");
        known(r.with.kind, r.with.id, "with.id");
        const key = `${r.of.kind}:${r.of.id}>${r.with.kind}:${r.with.id}`;
        if (this.shares.has(key)) at("with", "is shared with already: a Share is listed once.");
        this.shares.add(key);
        return;
      }
      case "target": {
        const m = this.metricOf(r.metric, "metric", at);
        this.period(r.period, "period", m, at);
        this.rising("target", r.metric, r.period, at);
        if (r.min === undefined && r.max === undefined) at("", "needs “min”, “max” or both: a Target Range has an end.");
        if (r.min !== undefined && r.max !== undefined && r.min > r.max) at("min", "is above max: the lower end of a Target Range comes first.");
        for (const f of ["min", "max"] as const) if (r[f] !== undefined && !decimalsOk(r[f]!, L.decimals)) at(f, `has more than ${L.decimals} decimals.`);
        return;
      }
      case "projection": {
        const m = this.metricOf(r.metric, "metric", at);
        this.period(r.period, "period", m, at);
        this.rising("projection", r.metric, r.period, at);
        if (!decimalsOk(r.value, L.decimals)) at("value", `has more than ${L.decimals} decimals.`);
        return;
      }
      case "value": {
        const m = this.metricOf(r.metric, "metric", at);
        this.period(r.period, "period", m, at);
        if (!decimalsOk(r.value, L.decimals)) at("value", `has more than ${L.decimals} decimals.`);
        if (r.recordedAt !== undefined && !realInstant(r.recordedAt)) at("recordedAt", "is not a real moment between the years 1900 and 2200.");
        r.breakdown?.forEach((b, i) => {
          if (!decimalsOk(b.value, L.decimals)) at(`breakdown[${i}].value`, `has more than ${L.decimals} decimals.`);
        });
        if (r.breakdown) distinct("breakdown", r.breakdown.map((b) => b.label), "label");
        return;
      }
      case "end": {
        this.ended = true;
        this.declared = r.counts;
        return;
      }
    }
  }

  /** The Slots of a dashboard or deck are filled: one list of Metrics each, one Metric unless the Slot takes several. */
  private slots(filled: string[][], template: { multiple?: boolean }[] | undefined, at: (path: string, message: string) => void, known: (kind: "metric", label: string, path: string) => void) {
    if (template && filled.length !== template.length) at("slots", `has ${filled.length} entries but the template has ${template.length} Slots: each Slot is filled.`);
    filled.forEach((list, i) => {
      list.forEach((m, j) => known("metric", m, `slots[${i}][${j}]`));
      if (new Set(list).size !== list.length) at(`slots[${i}]`, "names a Metric twice.");
      if (template?.[i] && !template[i].multiple && list.length !== 1) at(`slots[${i}]`, "fills a Slot that takes one Metric with " + list.length + ".");
    });
  }

  /** Targets and projections are listed by Metric label and then period, each pair once. */
  private rising(kind: "target" | "projection", metric: string, period: string, at: (path: string, message: string) => void) {
    const key = `${metric}\u0000${period}`;
    if (key <= this.last[kind]) at("period", `comes at or before the ${kind} before it: list ${kind}s by Metric label and then period, each once.`);
    else this.last[kind] = key;
  }

  /** The Metric a record names, when it was listed. */
  private metricOf(label: string, path: string, at: (path: string, message: string) => void): MetricInfo | undefined {
    const m = this.metrics.get(label);
    if (!m) at(path, `names “${label}”, which is no metric listed before this record.`);
    return m;
  }

  /** A period start is a real day, in range, and starts a period of its Metric's length. */
  private period(text: string, path: string, metric: MetricInfo | undefined, at: (path: string, message: string) => void) {
    const day = realDay(text);
    if (!day) return at(path, `“${text}” is not a real day between the years ${L.firstYear} and ${L.lastYear}.`);
    if (metric && !startsPeriod(day, metric.period, this.header?.workspace.yearStart ?? 1)) at(path, `“${text}” does not start a ${metric.period}${metric.period === "week" ? ": weeks start on a Monday" : `: a ${metric.period} starts on the first day of its ${metric.period}`}.`);
  }
}

/** Checks a whole Workspace Export given as text (a small file, a test or a command): every line, then the whole. It
 * stops after 50 problems. For a file that must be streamed, call `WorkspaceExportChecker` line by line instead. */
export function checkWorkspaceExport(text: string): WorkspaceExportCheck {
  if (new TextEncoder().encode(text).length > WORKSPACE_EXPORT_LIMITS.textBytes) return { ok: false, problems: [{ path: "", line: null, message: "The file is larger than a Workspace Export may be." }] };
  const checker = new WorkspaceExportChecker();
  const problems: Problem[] = [];
  const lines = text.replace(/^﻿/, "").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  for (const raw of lines) {
    const res = checker.line(raw.endsWith("\r") ? raw.slice(0, -1) : raw);
    if (!res.ok) problems.push(...res.problems);
    if (problems.length >= MAX_PROBLEMS) return { ok: false, problems: problems.slice(0, MAX_PROBLEMS) };
  }
  problems.push(...checker.finish());
  if (problems.length) return { ok: false, problems: problems.slice(0, MAX_PROBLEMS) };
  const header = checker.headerRecord!;
  return { ok: true, header, counts: { ...checker.recordCounts }, records: checker.lines };
}
