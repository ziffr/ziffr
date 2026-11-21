// Metrics created and changed by programs (spec 0003, ticket #211; GLOSSARY: Metric, Access Key, Target Range,
// Target Series, Projection). A key with metrics:write creates a Metric as its creator, through the web form's
// createMetric; one with metrics:edit changes a Metric's description (name, description, unit, format, period while it
// has no values, Submission Rule, Polarity, Target Range, Attainment method), its Sources, its Workflow, its Target
// Series and its Projections through the same core functions as the Metric's page, so every field is checked the same
// way: only the Metric's owner and its Editors change it (only its owner its Workflow), and only while the creator's
// role may create. Not writable by a key: sharing, Submitters beyond those named at creation, or a Catalog entry. A formula only for
// a Derived Metric (ticket #619): made with it, changed by its owner and Editors, same checks. Each change names the key: in the Metric's history, and in the note of each Target Series or Projection value.
import { openWorkflowRow } from "./workflow-rows";
import { assertScope, can, Forbidden, Refused, type Actor, type KeyActor } from "./actor";
import { createDerivedMetric, setMetricFormula } from "./derived-metrics";
import { describeMetric, toApi, type ApiMetric, type ApiMetricDetail } from "./api";
import { checkWorkflowChoice, type WorkflowRef } from "./api-metric-workflow";
import { db } from "./db";
import { openOne } from "./sealed-columns";
import { addSubmitters, assertSubmittersIn, createMetric, deleteMetric, editableMetric, metricEffects, removeSubmitters, sealedSeriesSaves, setMetricSources, SUBMITTERS_PER_CHANGE, TooManyMetrics, updateMetricDetails, type MetricEffects } from "./metrics";
import { addFeedToMetric, removeFeedFromMetric } from "./feeds";
import { archiveMetric, restoreMetric } from "./archived-metrics";
import { yearStartFor } from "./fiscal-year";
import { withVersionNote } from "./versions";
import { setMetricWorkflow, setWorkflowCheck } from "./workflows";
import { audit, auditedAsKey } from "./audit-log";
import type { WorkflowConfig, WorkflowStep } from "./types";
import { isPeriodStart, periodStart } from "./periods";
import { normalizeMetric } from "./metric-row";
import { getMetrics, getSeriesValues } from "./workspace-data";
import { peopleFor, visibleMetricIds } from "./access";
import type { Metric, SourceId } from "./types";

/** Metrics one key may create in any 24 hours; the database enforces it (migration 20261116090000). */
export const METRICS_PER_DAY = 50;

export { TooManyMetrics };

/** What a program sends to create a Metric: the description as programs read it, and whether the key's creator
 * submits its values (they get a Token, so a key that may submit values can do so at once). */
export type ApiMetricInput = {
  name: string;
  description?: string;
  unit?: string;
  unit_position?: string;
  format?: string;
  decimals?: number;
  period?: string;
  submission_rule?: string;
  polarity?: string;
  aggregation?: string;
  target_min?: number | null;
  target_max?: number | null;
  attainment_method?: string | null;
  submit?: boolean;
  /** Its Sources; left out, every one, as in the form. */
  sources?: string[];
  /** Who submits: ids of people, Contacts or Feeds (list_people, list_feeds). Needs metrics:edit as well, since each
   * gets a first Prompt. */
  submitters?: string[];
  /** One of the creator's own Workflows, by id or exact name, so the Metric is asked for on its schedule at once. Needs
   * metrics:edit as well; null or left out: none. */
  workflow?: WorkflowRef | null;
  /** Makes a Derived Metric instead: computed from other Metrics the key's creator sees, such as "{revenue} / {orders}"
   * or "change({odometer}) / 7" (this period minus the previous one). It takes no values, Sources, Submitters or
   * Workflow; the period is its inputs' own unless given. Needs metrics:read as well. */
  formula?: string;
};

/** First Prompts a key may set off for one person in 24 hours, over all Metrics: a Submitter added through a key is
 * asked at once only within this, so a looping program cannot flood anyone (from Ziffr's own address, with a Metric
 * name the program chose). Beyond it they are still a Submitter, asked when their Workflow next asks. */
export const FIRST_PROMPTS_PER_PERSON_PER_DAY = 5;

/** The first Prompt for a Submitter a key added: only when the database grants a claim (claim_first_prompt), which
 * is refused when this person was asked for this Metric in the last 24 hours (adding and removing them again asks
 * nobody twice) or was claimed FIRST_PROMPTS_PER_PERSON_PER_DAY times in this workspace. Check and reservation are one
 * step under a lock, so parallel calls cannot each pass. */
function keyPrompts(workspaceId: string, effects: MetricEffects): MetricEffects["promptSubmitter"] {
  return async (metricId, submitterId, by) => {
    const { data, error } = await db().rpc("claim_first_prompt", { p_workspace: workspaceId, p_submitter: submitterId, p_metric: metricId, p_limit: FIRST_PROMPTS_PER_PERSON_PER_DAY });
    if (error) throw new Error("The first Prompt could not be checked.");
    return data === true ? effects.promptSubmitter(metricId, submitterId, by) : false;
  };
}

/** Every Source a Metric may have, in the order the app shows them. */
export const SOURCE_IDS: SourceId[] = ["web_form", "mail", "slack", "telegram", "api"];

/** Sources a program sent: known ones, each once, at least one. */
function sourcesFrom(sources: unknown): SourceId[] {
  const chosen = Array.isArray(sources) ? [...new Set(sources.filter((s): s is SourceId => SOURCE_IDS.includes(s as SourceId)))] : [];
  if (!chosen.length || chosen.length !== new Set(sources as unknown[]).size) throw new MetricChangeRefused(`Name 1 to ${SOURCE_IDS.length} Sources from ${SOURCE_IDS.join(", ")}.`);
  return chosen;
}

/** Submitter ids split into the workspace's live Feeds and people, checked before anything changes: people must be
 * Members, Guests or Contacts of the workspace, and an id that is neither is refused without saying which it is not. */
async function splitSubmitters(creator: Actor, ids: unknown): Promise<{ people: string[]; feeds: string[] }> {
  if (!Array.isArray(ids) || ids.length > SUBMITTERS_PER_CHANGE || !ids.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64)) {
    throw new MetricChangeRefused(`Name at most ${SUBMITTERS_PER_CHANGE} Submitters by their ids.`);
  }
  const wanted = [...new Set(ids as string[])];
  if (!wanted.length) return { people: [], feeds: [] };
  const { data } = await db().from("feeds").select("person_id").eq("workspace_id", creator.workspaceId).is("deleted_at", null).in("person_id", wanted);
  const feedIds = new Set((data ?? []).map((f) => f.person_id as string));
  const people = wanted.filter((id) => !feedIds.has(id));
  try {
    await assertSubmittersIn(creator, people);
  } catch {
    throw new MetricChangeRefused("Submitters must be people, Contacts or Feeds of this workspace, by the ids list_people and list_feeds give.");
  }
  return { people, feeds: [...feedIds] };
}

/** Creates a Metric owned by the key's creator (scope metrics:write) and returns it as programs see it. Refused when
 * the creator's current role may not create (Guests), and in the demo. With `submitters`, the key needs metrics:edit
 * too: each one gets a first Prompt, so naming others reaches people. Everything is checked before the Metric exists. */
export async function createMetricWithKey(actor: Actor | KeyActor, input: ApiMetricInput, effects: MetricEffects = metricEffects): Promise<ApiMetricDetail> {
  assertScope(actor, "metrics:write");
  // The key's creator, with their role as it is now (actorForKey reads it on every call).
  const creator: Actor = { personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role };
  if (input.formula !== undefined) return createDerivedWithKey(actor, creator, input, effects);
  const sources = input.sources === undefined ? SOURCE_IDS : sourcesFrom(input.sources);
  const named = input.submitters ?? [];
  if (named.length) assertScope(actor, "metrics:edit");
  const { people, feeds } = await splitSubmitters(creator, named);
  // Checked before anything exists, so a Workflow the key may not use leaves no Metric behind.
  const workflow = input.workflow === undefined || input.workflow === null ? null : await checkWorkflowChoice(actor, creator, { id: 0, owner_id: creator.personId, formula: null }, input.workflow);
  const keyName = actor.key ? await nameOf(actor) : null;
  const { id } = await createMetric(creator, {
    name: String(input?.name ?? ""),
    description: input.description, unit: input.unit, unitPosition: input.unit_position, format: input.format, decimals: input.decimals, period: input.period,
    submissionRule: input.submission_rule, polarity: input.polarity, aggregation: input.aggregation,
    targetMin: input.target_min, targetMax: input.target_max, attainmentMethod: input.attainment_method,
    // Left out, as in the form: every way Ziffr knows, the API among them, so the key can submit to it at once.
    sources,
    submitters: [...new Set([...(input.submit ? [actor.personId] : []), ...people])],
  }, {
    ...effects,
    promptSubmitter: keyPrompts(actor.workspaceId, effects),
    recordCreated: (metricId, by) => effects.recordCreated(metricId, by, keyName ? `Created through the API (key “${keyName}”)` : "Created through the API"),
  }, { accessKeyId: actor.key ? Number(actor.key.id) : undefined });
  // A Feed is added as on the Metric's page, which turns the API Source on, since a Feed sends nothing else.
  for (const f of feeds) await addFeedToMetric(creator, id, f);
  if (workflow?.id != null) await asKey(actor, () => setMetricWorkflow(creator, id, workflow.id, { from: null }));
  const data = await openOne("metrics", actor.workspaceId, (await db().from("metrics").select("*").eq("id", id).eq("workspace_id", actor.workspaceId).single()).data);
  return describeMetric(actor, normalizeMetric(data as Metric) as Metric);
}

/** A Derived Metric for a key (scope metrics:write and metrics:read: it is made from what the creator sees, and
 * answering whether an input exists would otherwise tell a key that cannot read). What a Derived Metric does not take is
 * refused rather than ignored, so a program never believes it set a Submitter or a Workflow. */
async function createDerivedWithKey(actor: Actor | KeyActor, creator: Actor, input: ApiMetricInput, effects: MetricEffects): Promise<ApiMetricDetail> {
  assertScope(actor, "metrics:read");
  if (input.submit || input.submitters?.length || input.workflow != null || input.sources !== undefined || input.aggregation !== undefined || input.submission_rule !== undefined) {
    throw new MetricChangeRefused("A Derived Metric is computed from other Metrics: it takes no values, so no submit, submitters, sources, aggregation, submission_rule or workflow.");
  }
  const keyName = actor.key ? await nameOf(actor) : null;
  const made = await createDerivedMetric(creator, {
    name: String(input?.name ?? ""), formula: input.formula as string, description: input.description, unit: input.unit, unitPosition: input.unit_position, format: input.format,
    decimals: input.decimals, period: input.period, polarity: input.polarity, targetMin: input.target_min, targetMax: input.target_max, attainmentMethod: input.attainment_method,
  }, { ...effects, recordCreated: (metricId, by) => effects.recordCreated(metricId, by, keyName ? `Created through the API (key “${keyName}”)` : "Created through the API") }, { accessKeyId: actor.key ? Number(actor.key.id) : undefined })
    .catch((e) => { throw e instanceof Refused ? new MetricChangeRefused(e.message) : e; });
  const data = await openOne("metrics", actor.workspaceId, (await db().from("metrics").select("*").eq("id", made.id).eq("workspace_id", actor.workspaceId).single()).data);
  return { ...(await describeMetric(actor, normalizeMetric(data as Metric) as Metric)), defaults: made.defaults };
}

/** Deletes a Metric for a key with metrics:write, as its creator: only when they own it, with its exact name to
 * confirm, and never while anything uses it, exactly as in the app. The Audit Log names the key. */
export async function deleteMetricWithKey(actor: Actor | KeyActor, slug: string, confirmName: string): Promise<{ values: number }> {
  const { m, creator, origin } = await writableByKey(actor, slug);
  return deleteMetric(creator, m.id, String(confirmName ?? ""), origin);
}

/** The Metric with this slug for a key with metrics:write, the key's creator as the Actor the app's functions take,
 * and the key as the origin the Audit Log names. Never in the demo, which has no Access Keys. */
async function writableByKey(actor: Actor | KeyActor, slug: string) {
  assertScope(actor, "metrics:write");
  const metrics = await getMetrics(actor.workspaceId);
  const m = metrics.find((x) => x.slug === String(slug));
  // A Metric that is missing, of another workspace or hidden from the creator is refused without a reason (404).
  if (!m || !(await visibleMetricIds(actor.workspaceId, actor.personId, metrics)).has(m.id)) throw new Forbidden();
  const creator: Actor = { personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role };
  return { m, creator, origin: { accessKeyId: actor.key ? Number(actor.key.id) : undefined } };
}

/** Archives a Metric (scope metrics:write) as the key's creator, or with `restore` brings it back (GLOSSARY: Archived
 * Metric): only when they see it and are an Owner, an Admin or its Metric Owner, as in the app. The Audit Log names
 * the key. Answers the Metric as it is now. */
export async function setMetricArchivedWithKey(actor: Actor | KeyActor, slug: string, archived: boolean): Promise<ApiMetric> {
  const { m, creator, origin } = await writableByKey(actor, slug);
  if (archived) await archiveMetric(creator, m.id, origin);
  else await restoreMetric(creator, m.id, origin);
  const data = await openOne("metrics", actor.workspaceId, (await db().from("metrics").select("*").eq("id", m.id).eq("workspace_id", actor.workspaceId).single()).data);
  return toApi(normalizeMetric(data as Metric), data);
}

/** Thrown when a change to a Metric is refused for its content, such as a lower target above the upper one or a
 * Projection for a period that is over; nothing was changed. The API answers 422 with the message. */
export class MetricChangeRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricChangeRefused";
  }
}

/** What a program may change of a Metric (PATCH /metrics/{slug}): its description, Sources and Workflow. Each part
 * left out stays. */
export type ApiMetricPatch = {
  name?: string;
  description?: string;
  unit?: string;
  format?: "number" | "currency" | "percent";
  /** Only while the Metric has no values and no targets or projections by period (the core says so otherwise). */
  period?: "day" | "week" | "month" | "quarter" | "year";
  submission_rule?: "reject" | "overwrite" | "add" | "keep_both";
  /** Its Sources, all of them: the ones left out are turned off. */
  sources?: string[];
  polarity?: "higher" | "lower" | "target";
  target_min?: number | null;
  target_max?: number | null;
  attainment_method?: "ratio" | "distance" | null;
  /** One of the creator's own Workflows by id or exact name, or null for none; only the Metric's owner. */
  workflow?: WorkflowRef | null;
  /** A Derived Metric's new formula, checked as when creating one (needs metrics:read as well). */
  formula?: string;
};

const FORMAT_WORDS = ["number", "currency", "percent"];
const PERIOD_WORDS = ["day", "week", "month", "quarter", "year"];
const RULE_WORDS = ["reject", "overwrite", "add", "keep_both"];
const POLARITY_WORDS = ["higher", "lower", "target"];

/** The words of the patch checked again where the core takes them (the API's schema checked them first): the core's
 * own cleaning would keep the old value for an unknown word without saying so, a program is told instead. */
function assertPatchWords(p: ApiMetricPatch): void {
  const text = (v: unknown, max: number, label: string, required = false) => {
    if (v === undefined) return;
    if (typeof v !== "string" || v.length > max || (required && !v.trim())) throw new MetricChangeRefused(`${label} must be text of at most ${max} characters${required ? ", not empty" : ""}.`);
  };
  text(p.name, 120, "The name", true);
  text(p.description, 2000, "The description");
  text(p.unit, 20, "The unit");
  const word = (v: unknown, words: string[], label: string) => {
    if (v !== undefined && !words.includes(v as string)) throw new MetricChangeRefused(`${label} must be one of ${words.join(", ")}.`);
  };
  word(p.format, FORMAT_WORDS, "The format");
  word(p.period, PERIOD_WORDS, "The period");
  word(p.submission_rule, RULE_WORDS, "The submission rule");
  word(p.polarity, POLARITY_WORDS, "The polarity");
}

/** The Metric a key with metrics:edit is about to change, and its creator as a person's Actor. A Metric that is
 * missing, of another workspace or hidden from the creator is refused without a reason (404); a creator whose role may
 * no longer create (now a Guest) is refused with one. Whether they may change this Metric is the core's check after. */
async function changeableByKey(actor: Actor | KeyActor, slug: string): Promise<{ creator: Actor; metric: Metric }> {
  assertScope(actor, "metrics:edit");
  const metrics = await getMetrics(actor.workspaceId);
  const metric = metrics.find((x) => x.slug === String(slug));
  if (!metric || !(await visibleMetricIds(actor.workspaceId, actor.personId, metrics)).has(metric.id)) throw new Forbidden();
  const creator: Actor = { personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role };
  // As for creating: a key changes Metrics only while its creator's role may create, so a Guest's key never does.
  if (!can(creator, "create")) throw new Forbidden("The key's creator's role may not change Metrics.");
  return { creator, metric };
}

/** Changes a Metric for a key with metrics:edit, as its creator: its description (name, description, unit, format,
 * Submission Rule, Polarity, Target Range, Attainment method, and the period while it has no values), its Sources and,
 * for its owner, its Workflow, as the Metric's page and the Workflow dropdown do. Everything is checked before the
 * first change. Its history names the key. Returns it as programs see it. */
export async function updateMetricWithKey(actor: Actor | KeyActor, slug: string, patch: ApiMetricPatch): Promise<ApiMetricDetail> {
  const { creator, metric } = await changeableByKey(actor, slug);
  const p = patch ?? {};
  assertPatchWords(p);
  if (p.formula !== undefined) assertScope(actor, "metrics:read");
  // The core checks this too, but as a plain error; said here so a program gets 422 with the reason.
  const lo = p.target_min !== undefined ? p.target_min : metric.target_min ?? null;
  const hi = p.target_max !== undefined ? p.target_max : metric.target_max ?? null;
  if (lo !== null && hi !== null && lo > hi) throw new MetricChangeRefused("The lower target is above the upper one.");
  for (const v of [p.target_min, p.target_max]) if (v !== undefined && v !== null && !inRange(v)) throw new MetricChangeRefused(`A target must be a number between -${SERIES_VALUE_MAX} and ${SERIES_VALUE_MAX}.`);
  // Only these parts, whatever else the patch holds: never the unit's side, the decimals or the Aggregation.
  const details = {
    name: p.name, description: p.description, unit: p.unit, format: p.format, period: p.period, submissionRule: p.submission_rule,
    polarity: p.polarity, targetMin: p.target_min, targetMax: p.target_max, attainmentMethod: p.attainment_method,
  };
  const sources = p.sources === undefined ? undefined : sourcesFrom(p.sources);
  if (sources && metric.formula) throw new MetricChangeRefused("A Derived Metric is computed; values do not arrive for it.");
  const workflow = p.workflow === undefined ? undefined : await checkWorkflowChoice(actor, creator, metric, p.workflow);
  const keyName = actor.key ? await nameOf(actor) : null;
  await asKey(actor, () => withVersionNote(keyName ? `Changed through the API (key “${keyName}”)` : "Changed through the API", async () => {
    if (p.formula !== undefined) await setMetricFormula(creator, metric.id as number, p.formula, { accessKeyId: actor.key ? Number(actor.key.id) : undefined }).catch((e) => { throw e instanceof Refused ? new MetricChangeRefused(e.message) : e; });
    // The editor's own refusals (a period that has values, a Retention that would not fit) are plain errors: said as 422.
    await updateMetricDetails(creator, metric.id as number, details).catch(refusedWithReason);
    // A key's change of what a Metric is called or says is read by other people and their assistants: the Audit Log names
    // the key and the fields (never the words, which are sealed).
    const fields = (["name", "description", "unit", "format", "period", "submission_rule"] as const).filter((f) => p[f] !== undefined);
    if (fields.length && actor.key) await audit(creator, { kind: "metric.details_changed", object: { type: "metric", id: metric.id as number, name: metric.name }, details: { fields } });
    if (sources) await setMetricSources(creator, metric.id as number, sources);
    if (workflow !== undefined) await setMetricWorkflow(creator, metric.id as number, workflow.id, { from: workflow.from });
  }));
  const data = await openOne("metrics", actor.workspaceId, (await db().from("metrics").select("*").eq("id", metric.id).eq("workspace_id", actor.workspaceId).single()).data);
  return describeMetric(actor, normalizeMetric(data as Metric) as Metric);
}

/** Runs work so that every Audit Log event it records names the key, as for a person's own change through a key. */
const asKey = <T>(actor: Actor | KeyActor, work: () => Promise<T>): Promise<T> => (actor.key ? auditedAsKey(Number(actor.key.id), work) : work());

/** The editor's plain refusals become MetricChangeRefused (422); a fault, a Forbidden or any other error stays itself.
 * Only sentences of Ziffr's own (they end in a full stop): a library's plain Error, such as a failed decryption, never
 * reaches a program as words. */
function refusedWithReason(e: unknown): never {
  if (e instanceof Error && e.constructor === Error && /[.!?]$/.test(e.message) && !/could not be saved/.test(e.message)) throw new MetricChangeRefused(e.message);
  throw e;
}

/** Which series of a Metric: its Target Series or its Projections. */
export type SeriesKind = "target" | "projection";

/** Most items one call may set or remove, as for a Feed's batch. */
export const SERIES_ITEMS_MAX = 500;

/** The largest target or Projection a program may set, either way: far beyond any real figure, and well inside what
 * the database keeps exactly. */
export const SERIES_VALUE_MAX = 1e15;

const inRange = (v: number) => Number.isFinite(v) && Math.abs(v) <= SERIES_VALUE_MAX;

/** One period's value in a Target Series or Projections, as programs see it. */
export type ApiSeriesValue = { period: string; value: number };

/** A visible Metric's Target Series or Projections, oldest first (scope metrics:read). Only periods and values: never
 * the note the person who set them wrote. */
export async function listSeriesWithKey(actor: Actor | KeyActor, slug: string, kind: SeriesKind): Promise<ApiSeriesValue[]> {
  assertScope(actor, "metrics:read");
  const metrics = await getMetrics(actor.workspaceId);
  const metric = metrics.find((x) => x.slug === String(slug));
  if (!metric || !(await visibleMetricIds(actor.workspaceId, actor.personId, metrics)).has(metric.id)) throw new Forbidden();
  const { targets, projections } = await getSeriesValues(actor.workspaceId, [metric.id as number]);
  return ((kind === "target" ? targets : projections)[metric.id as number] ?? []).map((p) => ({ period: p.period, value: p.value }));
}

/** Sets or removes values of a Metric's Target Series or Projections for a key with metrics:edit, as its creator:
 * a number sets the period's value, null removes it. Each period must be a period's first day; a Projection only for
 * the current period or a later one, since it is a value for a period not over yet. Every item is checked before
 * anything is written, so a refused item writes none; a later item for the same period wins. Only the Metric's owner and its Editors, as on its page. */
export async function setSeriesWithKey(actor: Actor | KeyActor, slug: string, kind: SeriesKind, items: { period: string; value: number | null }[]): Promise<{ saved: number; removed: number }> {
  if (kind !== "target" && kind !== "projection") throw new Forbidden("Unknown series.");
  const { creator, metric } = await changeableByKey(actor, slug);
  if (!Array.isArray(items) || items.length < 1 || items.length > SERIES_ITEMS_MAX) throw new MetricChangeRefused(`Send 1 to ${SERIES_ITEMS_MAX} items.`);
  const span = metric.period;
  const ys = await yearStartFor(actor.workspaceId, span);
  const now = periodStart(new Date(), span, ys);
  const last = new Map<string, number | null>();
  for (const it of items) {
    const period = typeof it?.period === "string" ? it.period : "";
    const value = it?.value === null ? null : typeof it?.value === "number" && inRange(it.value) ? it.value : undefined;
    const shown = period.slice(0, 20) || "A period";
    if (!isPeriodStart(period, span, ys) || period < "1900-01-01" || period > "2199-12-31") throw new MetricChangeRefused(`${shown} is not the first day of one of this Metric's periods (${span}) between 1900 and 2199.`);
    if (value === undefined) throw new MetricChangeRefused(`The value for ${period} must be a number between -${SERIES_VALUE_MAX} and ${SERIES_VALUE_MAX}, or null to remove it.`);
    if (kind === "projection" && period < now) throw new MetricChangeRefused(`${period} is over: a Projection is for the current period or a later one.`);
    last.set(period, value);
  }
  const keyName = actor.key ? await nameOf(actor) : null;
  const note = keyName ? `Through the API (key “${keyName}”)` : "Through the API";
  const saves = await sealedSeriesSaves(actor.workspaceId, metric.id as number, kind, [...last].filter(([, v]) => v !== null).map(([period, value]) => ({ period, value: value as number })));
  const removes = [...last].filter(([, v]) => v === null).map(([period]) => period);
  // The same right as on the Metric's page; then saves and removals are one database call, so a failure in either
  // leaves nothing written (ticket #215).
  await editableMetric(creator, metric.id as number, "targets and projections");
  const { data, error } = await db().rpc("set_series_values", { p_metric: metric.id, p_kind: kind, p_saves: saves, p_removes: removes, p_note: note });
  if (error) throw new Error("The series could not be saved.");
  const row = (Array.isArray(data) ? data[0] : data) as { saved: number; removed: number } | null;
  const saved = Number(row?.saved ?? 0);
  const removed = Number(row?.removed ?? 0);
  return { saved, removed };
}

/** A Metric's Unusual Value check as programs see it: the Workflow whose check step it is, and the step. The
 * Workflow may be shared by several Metrics, so its name, whether the key's creator owns it (only its owner changes
 * it) and how many Metrics the creator sees that use it are said; nothing else of the Workflow. */
export type ApiUnusualValueCheck = {
  workflow: { name: string; yours: boolean; metrics: number } | null;
  check: { change_pct: number; outside_target: boolean } | null;
};

type CheckStep = Extract<WorkflowStep, { type: "check" }>;

/** The Workflow of a visible Metric with its check step, and what programs may see of it. */
async function checkOf(actor: Actor | KeyActor, slug: string) {
  const metrics = await getMetrics(actor.workspaceId);
  const metric = metrics.find((x) => x.slug === String(slug));
  const visible = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  if (!metric || !visible.has(metric.id)) throw new Forbidden();
  const { data: row } = await db().from("metrics").select("workflow_id").eq("id", metric.id).eq("workspace_id", actor.workspaceId).single();
  const workflowId = (row?.workflow_id as number | null) ?? null;
  if (workflowId === null) return { metric, wf: null, answer: { workflow: null, check: null } as ApiUnusualValueCheck };
  const wf = await openWorkflowRow(actor.workspaceId, (await db().from("workflows").select("id, name, owner_id, config, updated_at").eq("id", workflowId).eq("workspace_id", actor.workspaceId).maybeSingle()).data);
  if (!wf) return { metric, wf: null, answer: { workflow: null, check: null } as ApiUnusualValueCheck };
  const { data: users } = await db().from("metrics").select("id").eq("workspace_id", actor.workspaceId).eq("workflow_id", workflowId);
  const config = wf.config as WorkflowConfig;
  const step = (config?.steps ?? []).find((x): x is CheckStep => x.type === "check") ?? null;
  return {
    metric, wf: wf as { id: number; name: string; owner_id: string; config: WorkflowConfig; updated_at: string },
    answer: {
      // Counted among the Metrics the creator sees, so a program learns nothing of hidden ones.
      workflow: { name: wf.name as string, yours: wf.owner_id === actor.personId, metrics: (users ?? []).filter((u) => visible.has(u.id as number)).length },
      check: step ? { change_pct: step.changePct, outside_target: step.outsideTarget } : null,
    } as ApiUnusualValueCheck,
  };
}

/** A visible Metric's Unusual Value check (scope metrics:read): what makes a value unusual in its Workflow. */
export async function unusualValueCheckWithKey(actor: Actor | KeyActor, slug: string): Promise<ApiUnusualValueCheck> {
  assertScope(actor, "metrics:read");
  return (await checkOf(actor, slug)).answer;
}

/** Changes the Unusual Value check of a Metric's Workflow for a key with metrics:edit, as its creator: the change in
 * per cent beyond which a value is unusual (1 to 1,000), and whether a value outside the Target Range is too. It
 * changes the Workflow, so every Metric that shares it; only the Workflow's owner may, while their role may create.
 * A Workflow without a check step gets none here: steps are added in Ziffr. The Workflow's history names the key. */
export async function setUnusualValueCheckWithKey(actor: Actor | KeyActor, slug: string, change: { change_pct?: number; outside_target?: boolean }): Promise<ApiUnusualValueCheck> {
  assertScope(actor, "metrics:edit");
  const { wf } = await checkOf(actor, slug);
  const creator: Actor = { personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role };
  if (!can(creator, "create")) throw new Forbidden("The key's creator's role may not change Metrics.");
  if (!wf) throw new MetricChangeRefused("This Metric has no Workflow, so nothing checks its values. Give it one in Ziffr.");
  if (wf.owner_id !== actor.personId) throw new Forbidden(`Only the owner of the Workflow “${wf.name}” changes its check.`);
  const steps = wf.config?.steps ?? [];
  if (!steps.some((x) => x.type === "check")) throw new MetricChangeRefused(`The Workflow “${wf.name}” has no check step. Add one in Ziffr.`);
  const pct = change?.change_pct;
  if (pct !== undefined && !(Number.isInteger(pct) && pct >= 1 && pct <= 1000)) throw new MetricChangeRefused("The change must be a whole per cent from 1 to 1,000.");
  const keyName = actor.key ? await nameOf(actor) : null;
  // Only the check step is written, the rest of the Workflow as stored; the core checks ownership again, and refuses
  // when the Workflow changed since it was read here.
  const done = await withVersionNote(keyName ? `Changed through the API (key “${keyName}”)` : "Changed through the API",
    () => setWorkflowCheck(creator, wf.id, { changePct: pct, outsideTarget: change?.outside_target }, wf.updated_at));
  if (!done) throw new MetricChangeRefused(`The Workflow “${wf.name}” changed meanwhile. Read its check again and retry.`);
  return (await checkOf(actor, slug)).answer;
}

/** One of a Metric's Submitters as programs see it: id, name and kind; never contact details. */
export type ApiSubmitter = { id: string; name: string; kind: "person" | "contact" | "feed" };

/** Who submits to a visible Metric (scope metrics:read), as its page shows them: not their stand-ins. */
export async function listSubmittersWithKey(actor: Actor | KeyActor, slug: string): Promise<ApiSubmitter[]> {
  assertScope(actor, "metrics:read");
  const metrics = await getMetrics(actor.workspaceId);
  const metric = metrics.find((x) => x.slug === String(slug));
  if (!metric || !(await visibleMetricIds(actor.workspaceId, actor.personId, metrics)).has(metric.id)) throw new Forbidden();
  const { data: tokens } = await db().from("tokens").select("submitter_id").eq("metric_id", metric.id).eq("workspace_id", actor.workspaceId).is("stands_in_for", null);
  const ids = [...new Set((tokens ?? []).map((t) => t.submitter_id as string))];
  if (!ids.length) return [];
  // Loaded without contact details, so none can reach a program.
  // A Guest is shown no Submitter but themselves (peopleFor), and no Feed.
  const [people, { data: feeds }] = await Promise.all([peopleFor(actor), actor.role === "guest" ? Promise.resolve({ data: [] }) : db().from("feeds").select("person_id, name").eq("workspace_id", actor.workspaceId).in("person_id", ids)]);
  const feedName = new Map((feeds ?? []).map((f) => [f.person_id as string, f.name as string]));
  const person = new Map(people.map((p) => [p.id, p]));
  return ids.flatMap((id): ApiSubmitter[] => {
    if (feedName.has(id)) return [{ id, name: feedName.get(id)!, kind: "feed" }];
    const p = person.get(id);
    // Someone no longer in the workspace is left out, as on the Metric's page.
    return p ? [{ id, name: p.name, kind: p.contact ? "contact" : "person" }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Adds and removes Submitters of a Metric for a key with metrics:edit, as its creator: only when they own the Metric
 * or are its Editor, as on its page. People and Contacts get a Token and a first Prompt; a Feed is added as on the
 * Metric's page, turning the API Source on. At most SUBMITTERS_PER_CHANGE each way, all checked first. */
export async function setSubmittersWithKey(actor: Actor | KeyActor, slug: string, change: { add?: string[]; remove?: string[] }, effects: MetricEffects = metricEffects): Promise<{ submitters: ApiSubmitter[]; added: number; removed: number }> {
  const { creator, metric } = await changeableByKey(actor, slug);
  const add = await splitSubmitters(creator, change?.add ?? []);
  const rm = Array.isArray(change?.remove) ? change.remove : [];
  if (rm.length > SUBMITTERS_PER_CHANGE || !rm.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64)) throw new MetricChangeRefused(`Name at most ${SUBMITTERS_PER_CHANGE} Submitters to remove.`);
  if (!add.people.length && !add.feeds.length && !rm.length) throw new MetricChangeRefused("Name Submitters to add or remove.");
  if (metric.formula && (add.people.length || add.feeds.length)) throw new MetricChangeRefused("A Derived Metric is computed; it takes no values.");
  // Only Feeds that submit to it now: removing one that does not changes nothing and counts nothing.
  const current = new Set((await listSubmittersWithKey(creator, slug)).filter((x) => x.kind === "feed").map((x) => x.id));
  const rmFeeds = new Set(rm.filter((x) => current.has(x)));
  const keyName = actor.key ? await nameOf(actor) : null;
  let added = 0; let removed = 0;
  await withVersionNote(keyName ? `Changed through the API (key “${keyName}”)` : "Changed through the API", async () => {
    const id = metric.id as number;
    // Additions first: they are what can still fail (a Feed deleted meanwhile), and then nothing was removed yet.
    if (add.people.length) added += (await addSubmitters(creator, id, add.people, { ...effects, promptSubmitter: keyPrompts(actor.workspaceId, effects) })).length;
    for (const f of add.feeds) { await addFeedToMetric(creator, id, f); added++; }
    const rmPeople = [...new Set(rm.filter((x) => !rmFeeds.has(x)))];
    if (rmPeople.length) removed += (await removeSubmitters(creator, id, rmPeople)).length;
    for (const f of rmFeeds) { await removeFeedFromMetric(creator, id, f); removed++; }
  });
  return { submitters: await listSubmittersWithKey(creator, slug), added, removed };
}

/** The workspace's live Feeds by id and name, for naming one as a Submitter (scope metrics:edit): what the Metric page
 * offers anyone who may change a Metric, nothing more, and nothing for a Guest's key. */
export async function listFeedsWithKey(actor: Actor | KeyActor): Promise<{ id: string; name: string }[]> {
  assertScope(actor, "metrics:edit");
  if (actor.role === "guest") return [];
  const { data } = await db().from("feeds").select("person_id, name").eq("workspace_id", actor.workspaceId).is("deleted_at", null).order("name");
  return (data ?? []).map((f) => ({ id: f.person_id as string, name: f.name as string }));
}

async function nameOf(actor: KeyActor): Promise<string | null> {
  const { data } = await db().from("access_keys").select("name").eq("id", Number(actor.key.id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/** Whether the key may create another Metric now; if not, the seconds until it may. Counted from the Metrics the key
 * created in the last 24 hours. This answers early and says when to retry; the database's trigger is what holds the
 * limit, also for parallel calls (createMetricWithKey then throws TooManyMetrics). */
export async function admitMetric(actor: KeyActor): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await db().from("metrics").select("created_at").eq("workspace_id", actor.workspaceId).eq("access_key_id", Number(actor.key.id))
    .gt("created_at", since).order("created_at", { ascending: false }).limit(METRICS_PER_DAY);
  const rows = data ?? [];
  if (rows.length < METRICS_PER_DAY) return { ok: true };
  // The oldest of the newest 50 leaves the window first.
  const oldest = new Date(rows[rows.length - 1].created_at).getTime();
  return { ok: false, retryAfter: Math.max(1, Math.ceil((oldest + 86_400_000 - Date.now()) / 1000)) };
}
