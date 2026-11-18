// Creating Metrics and uploading their Target Series and Projections (GLOSSARY: Metric, Token, Target Series,
// Projection). Every function takes the Actor first and works only inside the actor's Workspace.
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { parseSeriesLine } from "./series-lines";
import { assertSeesMetrics } from "./sharing";
import type { Format, MetricDescription, Period, Polarity, SourceId, SubmissionRule } from "./types";
import { recordVersion } from "./versions";
import { deliverPrompt } from "./deliveries";
import { audit } from "./audit-log";
import { formulaInputs } from "./formula";
import { widgetMetricIds } from "./widget-metrics";
import { deckMetricIds } from "./visibility";
import { DEMO_WORKSPACE_ID } from "./team";
import { allRows } from "./workspace-data";
import { getShares } from "./access";
import { feedIdsAmong } from "./feed-people";
import { periodStart } from "./periods";
import { yearStartFor } from "./fiscal-year";

const FORMATS: Format[] = ["number", "currency", "percent"];
const PERIODS: Period[] = ["day", "week", "month", "quarter", "year"];
const RULES: SubmissionRule[] = ["reject", "overwrite", "add", "keep_both"];
const POLARITIES: Polarity[] = ["higher", "lower", "target"];
const AGGREGATIONS = ["sum", "average", "last", "none"];
const SOURCES: SourceId[] = ["slack", "mail", "web_form", "api", "telegram"];

/** A new Metric as described in the form, before it is checked. */
export type MetricInput = {
  name: string; description?: string; unit?: string; format?: string; decimals?: number; period?: string; submissionRule?: string;
  polarity?: string; aggregation?: string; targetMin?: number | null; targetMax?: number | null; sources?: string[]; submitters?: string[];
  fromCatalogId?: number | null;
  /** The Workflow its values take; must be one of the workspace's. */
  workflowId?: number | null;
  /** The Metric this one duplicates; the actor must see it. */
  duplicateOf?: number | null;
};

/** What creating a Metric sets off: its first version, and a first Prompt to each submitter. */
export type MetricEffects = {
  /** Records the first version of the Metric's description. */
  recordCreated: (metricId: number, by: string, message: string) => Promise<void>;
  /** Sends a submitter their first Prompt. */
  promptSubmitter: (metricId: number, submitterId: string, by: string) => Promise<void>;
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Refuses anyone who is neither a member nor a Contact of the actor's workspace (submitters and stand-ins). */
export async function assertSubmittersIn(actor: Actor, personIds: string[]) {
  const ids = [...new Set(personIds.map(String))];
  if (!ids.length) return;
  const [{ data: m }, { data: c }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).in("user_id", ids),
    db().from("contacts").select("person_id").eq("workspace_id", actor.workspaceId).in("person_id", ids),
  ]);
  const known = new Set([...(m ?? []).map((x) => x.user_id as string), ...(c ?? []).map((x) => x.person_id as string)]);
  if (!ids.every((id) => known.has(id))) throw new Forbidden("Submitters must be members or Contacts of this workspace.");
}

/** Metrics a Trial Workspace may hold (spec 0021). The trigger metrics_per_trial keeps the count and writes the same
 * number; a database test fails when the two differ. */
export const TRIAL_METRICS_MAX = 25;

/** Thrown when an Access Key created as many Metrics as it may in 24 hours (the database keeps the count). */
export class TooManyMetrics extends Error {
  constructor() {
    super("This key created as many Metrics as it may in 24 hours.");
    this.name = "TooManyMetrics";
  }
}

/** Creates a Metric owned by the actor, with a random Token and a first Prompt for each submitter. Guests create
 * nothing; every field is checked against what Ziffr knows, never passed through. `accessKeyId` names the key a
 * program created it with (spec 0003); the database then holds the key to its daily limit. */
export async function createMetric(actor: Actor, input: MetricInput, effects: MetricEffects = metricEffects, origin: { accessKeyId?: number } = {}): Promise<{ id: number; slug: string }> {
  assertCan(actor, "create");
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) throw new Error("Give the Metric a name.");
  const submitters = [...new Set((input.submitters ?? []).map(String))];
  await assertSubmittersIn(actor, submitters);
  const workflowId = numOrNull(input.workflowId);
  if (workflowId !== null && !(await db().from("workflows").select("id").eq("id", workflowId).eq("workspace_id", actor.workspaceId).maybeSingle()).data) throw new Forbidden();
  // A duplicate names its original in the first Version, so only someone who sees the original may claim it.
  const duplicateOf = numOrNull(input.duplicateOf);
  const original = duplicateOf === null ? null : await duplicable(actor, duplicateOf);
  let slug = slugify(name) || "metric";
  const { data: clash } = await db().from("metrics").select("id").eq("slug", slug).eq("workspace_id", actor.workspaceId);
  if (clash?.length) slug = `${slug}-${Date.now().toString(36)}`;
  const { data: metric, error } = await db().from("metrics").insert({
    slug, name, workspace_id: actor.workspaceId, owner_id: actor.personId,
    description: String(input.description ?? "").slice(0, 2000),
    unit: String(input.unit ?? "").slice(0, 20),
    format: pick(input.format, FORMATS, "number"),
    decimals: Math.min(6, Math.max(0, Math.round(Number(input.decimals) || 0))),
    period: pick(input.period, PERIODS, "month"),
    submission_rule: pick(input.submissionRule, RULES, "overwrite"),
    polarity: pick(input.polarity, POLARITIES, "higher"),
    aggregation: pick(input.aggregation, AGGREGATIONS, "sum"),
    target_min: numOrNull(input.targetMin), target_max: numOrNull(input.targetMax),
    sources: [...new Set((input.sources ?? []).filter((s): s is SourceId => SOURCES.includes(s as SourceId)))],
    from_catalog_id: original ? null : numOrNull(input.fromCatalogId),
    workflow_id: workflowId,
    access_key_id: Number.isInteger(origin.accessKeyId) ? origin.accessKeyId : null,
  }).select("id, slug, from_catalog_id").single();
  if (error?.code === "ZF429") throw new TooManyMetrics();
  if (error?.code === "ZF430") throw new Error(`A trial holds at most ${TRIAL_METRICS_MAX} Metrics. Delete one to make another.`);
  if (error || !metric) throw new Error("The Metric could not be created.");
  await effects.recordCreated(metric.id, actor.personId, original ? `Duplicated from “${original.name}”` : metric.from_catalog_id ? "Created from the Metric Catalog" : "Created");
  await audit(actor, { kind: "metric.created", object: { type: "metric", id: metric.id, name }, accessKeyId: Number.isInteger(origin.accessKeyId) ? origin.accessKeyId : null, details: { submitters: submitters.length, from_catalog: Boolean(metric.from_catalog_id), duplicated: Boolean(original) } });
  if (submitters.length) {
    // A Token code opens the submission form without signing in: random, never derived from names.
    await db().from("tokens").insert(submitters.map((s) => ({ code: `tk-${randomBytes(18).toString("base64url")}`, metric_id: metric.id, submitter_id: s })));
    // Every submitter gets a first Prompt, so the loop can continue right away.
    for (const s of submitters) await effects.promptSubmitter(metric.id, s, actor.personId);
  }
  return { id: metric.id, slug: metric.slug };
}

/** What a duplicate of a Metric starts from (GLOSSARY: Metric Description): its description, Workflow and Submitters. */
export type MetricDraft = MetricDescription & { original: string; workflow: { id: number; name: string } | null; submitters: string[]; duplicateOf: number };

/** The Metric to duplicate, if the actor may: someone who creates (not a Guest) and sees it. A Derived Metric's
 * formula cannot be copied into a plain Metric, so it is refused. */
async function duplicable(actor: Actor, metricId: number) {
  assertCan(actor, "create");
  const { data: m } = await db().from("metrics").select("*").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m) throw new Forbidden();
  await assertSeesMetrics(actor, [m.id]);
  if (m.formula) throw new Forbidden("A Derived Metric cannot be duplicated.");
  return m;
}

/** A Metric's description, Workflow and Submitters, prefilled for a duplicate the actor reviews before saving.
 * Never its values, Shares, Target Series, Projections or history: those stay with the original. */
export async function metricDraftFrom(actor: Actor, metricId: number): Promise<MetricDraft> {
  const m = await duplicable(actor, metricId);
  // Only the regular Submitters: a stand-in's Token covers one absence, not the Metric.
  const [{ data: tokens }, { data: workflow }] = await Promise.all([
    db().from("tokens").select("submitter_id").eq("metric_id", m.id).is("stands_in_for", null),
    m.workflow_id ? db().from("workflows").select("id, name").eq("id", m.workflow_id).eq("workspace_id", actor.workspaceId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // A Feed is not copied as a Submitter: it is the workspace's, chosen per Metric by its owner (spec 0012).
  const feeds = await feedIdsAmong((tokens ?? []).map((t) => t.submitter_id as string));
  return {
    original: m.name,
    name: `${m.name} (copy)`.slice(0, 120), description: m.description, unit: m.unit, format: m.format, decimals: m.decimals, period: m.period,
    submission_rule: m.submission_rule, polarity: m.polarity, aggregation: m.aggregation,
    target_min: m.target_min === null ? null : Number(m.target_min), target_max: m.target_max === null ? null : Number(m.target_max),
    sources: m.sources, workflow: workflow ? { id: workflow.id as number, name: workflow.name as string } : null, submitters: [...new Set((tokens ?? []).map((t) => t.submitter_id as string))].filter((s) => !feeds.has(s)), duplicateOf: m.id,
  };
}

/** The core's own effects of a new Metric. */
export const metricEffects: MetricEffects = {
  /** Records the description as the first version. */
  recordCreated: async (metricId, by, message) => { await recordVersion("metric", metricId, by, { message }); },
  /** Sends the first Prompt. */
  promptSubmitter: async (metricId, submitterId, by) => { await deliverPrompt({ metricId, submitterId, senderId: by }); },
};

/** Reading series lines is pure and lives in series-lines, so the browser can preview with the same rules. */
export { parseSeriesLine };

/** Why a Metric is not deleted: its name was not repeated, or something still uses it. Its message is for people. */
export class MetricKept extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricKept";
  }
}

/** Deletes a Metric with its values, Tokens, Prompts, Actions, targets and Locks, for its owner only. The owner types
 * its name to confirm. Refused while anything else uses it (a Derived Metric's formula, a widget, a deck, a View Link
 * that still works), so nothing people built breaks or silently shows less; in the demo too, which every visitor shares.
 * The Audit Log keeps who deleted it and its name. Returns how many values went with it. */
export async function deleteMetric(actor: Actor, metricId: number, confirmName: string, origin: { accessKeyId?: number } = {}): Promise<{ values: number }> {
  if (actor.key || !Number.isInteger(metricId)) throw new Forbidden();
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo's Metrics stay.");
  const ws = actor.workspaceId;
  const { data: m } = await db().from("metrics").select("id, slug, name, owner_id").eq("id", metricId).eq("workspace_id", ws).maybeSingle();
  if (!m || m.owner_id !== actor.personId) throw new Forbidden("Only the Metric's owner deletes it.");
  if (String(confirmName ?? "").trim() !== m.name) throw new MetricKept("Type the Metric's name to delete it.");
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: derived }, { data: widgets }, { data: decks }, { data: links }] = await Promise.all([
    db().from("metrics").select("name, formula").eq("workspace_id", ws).not("formula", "is", null),
    db().from("widgets").select("metric_ids, settings").eq("workspace_id", ws),
    db().from("decks").select("document").eq("workspace_id", ws),
    db().from("view_links").select("metric_ids").eq("workspace_id", ws).is("revoked_at", null).gte("expires_at", today),
  ]);
  // Names of what blocks it only where the owner may see them: Derived Metrics are named, other things only counted.
  const usedBy = (derived ?? []).filter((d) => formulaInputs(String(d.formula)).includes(m.slug)).map((d) => d.name as string);
  if (usedBy.length) throw new MetricKept(`Other Metrics are computed from it (${usedBy.length}). Change their formulas first.`);
  const inWidgets = (widgets ?? []).filter((w) => widgetMetricIds(w.metric_ids ?? [], w.settings).includes(metricId)).length;
  const inDecks = (decks ?? []).filter((d) => deckMetricIds(d.document).includes(metricId)).length;
  if (inWidgets || inDecks) throw new MetricKept(`It is shown in ${inWidgets} widget${inWidgets === 1 ? "" : "s"} and ${inDecks} deck${inDecks === 1 ? "" : "s"}. Take it out of them first.`);
  if ((links ?? []).some((l) => (l.metric_ids ?? []).map(Number).includes(metricId))) throw new MetricKept("A View Link that still works shows it. Revoke the link first.");
  const { count } = await db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("metric_id", metricId);
  // The intake log keeps what arrived, without the Metric it was for.
  await db().from("intake_log").update({ metric_id: null }).eq("workspace_id", ws).eq("metric_id", metricId);
  await db().from("shares").delete().eq("workspace_id", ws).eq("object_type", "metric").eq("object_id", metricId);
  await db().from("access_requests").delete().eq("workspace_id", ws).eq("object_type", "metric").eq("object_id", metricId);
  await removeValuesAndHistory(ws, metricId);
  const { data: gone, error } = await db().from("metrics").delete().eq("id", metricId).eq("workspace_id", ws).select("id");
  if (error || !gone?.length) throw new Error("The Metric could not be deleted.");
  await audit(actor, { kind: "metric.deleted", object: { type: "metric", id: metricId, name: m.name }, accessKeyId: Number.isInteger(origin.accessKeyId) ? origin.accessKeyId : null, details: { values: count ?? 0 } });
  return { values: count ?? 0 };
}

/** Removes a Metric's values, Breakdowns and their history, while the Metric still exists. Deleting the Metric first
 * would cascade to them, and the history triggers, which find a row's workspace through its Metric, would then file
 * that history under the default workspace (the demo). Here every row is removed explicitly, in its own workspace. */
async function removeValuesAndHistory(ws: string, metricId: number): Promise<void> {
  const live = await allRows<{ id: number }>((from, to) => db().from("observations").select("id").eq("workspace_id", ws).eq("metric_id", metricId).order("id").range(from, to));
  const replaced = await allRows<{ observation_id: number }>((from, to) => db().from("observation_history").select("observation_id").eq("workspace_id", ws).eq("metric_id", metricId).order("observation_id").range(from, to));
  const ids = [...new Set([...live.map((o) => o.id), ...replaced.map((o) => o.observation_id)])];
  const must = (r: { error: unknown }) => { if (r.error) throw new Error("The Metric could not be deleted."); };
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    // Breakdown rows first (their history is written with their value's workspace), then that history.
    must(await db().from("breakdown_rows").delete().eq("workspace_id", ws).in("observation_id", chunk));
    must(await db().from("breakdown_history").delete().eq("workspace_id", ws).in("observation_id", chunk));
  }
  must(await db().from("observations").delete().eq("workspace_id", ws).eq("metric_id", metricId));
  must(await db().from("observation_history").delete().eq("workspace_id", ws).eq("metric_id", metricId));
}

/** The Metric owner uploads a Target Series or Projection, one "period value" line each; lines that cannot be read
 * are skipped and counted. */
export async function uploadSeries(actor: Actor, metricId: number, kind: "target" | "projection", text: string, note: string) {
  const m = await seriesOwnerMetric(actor, metricId, kind);
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 2000);
  const ys = await yearStartFor(actor.workspaceId, m.period as Period);
  const read = lines.map((l) => parseSeriesLine(l, m.period as Period, ys)).filter((r): r is { period: string; value: number } => r !== null);
  const saved = await upsertSeries(metricId, kind, read, note);
  return { saved, skipped: lines.length - saved };
}

/** The Metric owner saves Target Series or Projection rows edited in a table, as period start and value. Rows with a
 * period or value that cannot be read are refused as a whole, since the table checked them already. */
export async function saveSeriesRows(actor: Actor, metricId: number, kind: "target" | "projection", rows: unknown, note: string) {
  const m = await seriesOwnerMetric(actor, metricId, kind);
  // Rows come from a browser: check the shape, the size and every value before anything is written.
  if (!Array.isArray(rows) || rows.length > 2000) throw new Error("Send at most 2,000 rows.");
  const ys = await yearStartFor(actor.workspaceId, m.period as Period);
  const read = rows.map((r) => {
    const period = typeof r?.period === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.period) ? r.period : null;
    const value = typeof r?.value === "number" && Number.isFinite(r.value) ? r.value : null;
    if (!period || value === null || Number.isNaN(new Date(`${period}T00:00:00`).getTime())) throw new Error("Every row needs a period and a number.");
    // A day inside the period counts as that period, as in pasted lines.
    return { period: periodStart(new Date(`${period}T00:00:00`), m.period as Period, ys), value };
  });
  return { saved: await upsertSeries(metricId, kind, read, note) };
}

/** The Metric owner removes Target Series or Projection values for some periods (period starts). Returns how many
 * were removed; a period without a value is left alone. */
export async function removeSeriesRows(actor: Actor, metricId: number, kind: "target" | "projection", periods: unknown) {
  await seriesOwnerMetric(actor, metricId, kind);
  // Periods come from a browser: only real days, at most 2,000; never a filter built from a string.
  if (!Array.isArray(periods) || periods.length > 2000) throw new Error("Send at most 2,000 periods.");
  const days = periods.map((p) => (typeof p === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p) && !Number.isNaN(Date.parse(`${p}T00:00:00Z`)) ? p : null));
  if (days.some((d) => d === null)) throw new Error("Every period must be a day.");
  if (!days.length) return { removed: 0 };
  const { data, error } = await db().from("series_values").delete().eq("metric_id", metricId).eq("kind", kind).in("period_start", days as string[]).select("id");
  if (error) throw new Error("The series could not be changed.");
  return { removed: data?.length ?? 0 };
}

/** The metric, when the actor owns it in their workspace; only its owner sets targets and projections. */
async function seriesOwnerMetric(actor: Actor, metricId: number, kind: string) {
  if (kind !== "target" && kind !== "projection") throw new Forbidden("Unknown series.");
  return editableMetric(actor, metricId, "targets and projections");
}

/** The Metric when the actor may change it (its targets, description and Sources): its owner, or a member it is
 * shared with as Editor, directly or through a Group. Never a Guest or a key. Deleting and sharing stay the owner's. */
export async function editableMetric(actor: Actor, metricId: number, what = "it") {
  if (actor.key || !Number.isInteger(metricId)) throw new Forbidden();
  const { data: m } = await db().from("metrics").select("*").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m) throw new Forbidden();
  if (m.owner_id === actor.personId) return m;
  const editor = actor.role !== "guest" && (await getShares(actor.workspaceId)).some((s) =>
    s.workspace_id === actor.workspaceId && s.object_type === "metric" && s.object_id === metricId && s.user_id === actor.personId && s.role === "editor");
  if (!editor) throw new Forbidden(`Only the Metric's owner and its Editors change ${what}.`);
  return m;
}

/** Writes rows, one value per period: a later row for the same period wins. Returns how many periods were saved. */
async function upsertSeries(metricId: number, kind: "target" | "projection", rows: { period: string; value: number }[], note: string) {
  const ok = [...new Map(rows.map((r) => [r.period, r])).values()];
  if (ok.length) {
    const { error } = await db().from("series_values").upsert(
      ok.map((r) => ({ metric_id: metricId, kind, period_start: r.period, value: r.value, note: String(note ?? "").slice(0, 120) || null })),
      { onConflict: "metric_id,kind,period_start" },
    );
    if (error) throw new Error("The series could not be saved.");
  }
  return ok.length;
}

/** The ways values of a Metric may arrive (its Sources), for its owner and its Editors: any of web form, email, Slack and the API (programs and Feeds), at least
 * one. A Derived Metric has none (it is computed). Values arriving another way are refused from then on. */
export async function setMetricSources(actor: Actor, metricId: number, sources: unknown): Promise<SourceId[]> {
  const m = await editableMetric(actor, metricId, "how its values arrive");
  if (m.formula) throw new Error("A Derived Metric is computed; values do not arrive for it.");
  // From a browser: only known Sources count, each once.
  const chosen = Array.isArray(sources) ? [...new Set(sources.filter((s): s is SourceId => SOURCES.includes(s as SourceId)))] : [];
  if (!chosen.length) throw new Error("Pick at least one way for values to arrive.");
  const { error } = await db().from("metrics").update({ sources: chosen }).eq("id", metricId).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The change could not be saved.");
  await recordVersion("metric", metricId, actor.personId, { message: "Changed how values arrive" });
  return chosen;
}

/** The parts of a Metric's description its owner may change later. Each one left out stays as it is. */
export type MetricDetails = {
  name?: string; description?: string; unit?: string; format?: string; decimals?: number; period?: string; submissionRule?: string;
  polarity?: string; aggregation?: string; targetMin?: number | null; targetMax?: number | null;
};

/** Changes a Metric's description, for its owner and its Editors: name, description, unit, format, decimals, Polarity, Submission
 * Rule, Aggregation, the target range, and the period while it has no values yet (later its values would sit in the
 * wrong periods). The slug stays, so links and programs keep finding it. Each change is a Version. */
export async function updateMetricDetails(actor: Actor, metricId: number, patch: MetricDetails): Promise<void> {
  const ws = actor.workspaceId;
  const m = await editableMetric(actor, metricId, "its description");
  const p = (patch && typeof patch === "object" ? patch : {}) as MetricDetails;
  const update: Record<string, unknown> = {};
  if (p.name !== undefined) {
    const name = String(p.name ?? "").trim().slice(0, 120);
    if (!name) throw new Error("Give the Metric a name.");
    update.name = name;
  }
  if (p.description !== undefined) update.description = String(p.description ?? "").slice(0, 2000);
  if (p.unit !== undefined) update.unit = String(p.unit ?? "").slice(0, 20);
  if (p.format !== undefined) update.format = pick(p.format, FORMATS, m.format);
  if (p.decimals !== undefined) update.decimals = Math.min(6, Math.max(0, Math.round(Number(p.decimals) || 0)));
  if (p.submissionRule !== undefined) update.submission_rule = pick(p.submissionRule, RULES, m.submission_rule);
  if (p.polarity !== undefined) update.polarity = pick(p.polarity, POLARITIES, m.polarity);
  if (p.aggregation !== undefined) update.aggregation = pick(p.aggregation, AGGREGATIONS, m.aggregation);
  if (p.targetMin !== undefined) update.target_min = numOrNull(p.targetMin);
  if (p.targetMax !== undefined) update.target_max = numOrNull(p.targetMax);
  const lo = (update.target_min ?? m.target_min) as number | null;
  const hi = (update.target_max ?? m.target_max) as number | null;
  if (lo !== null && hi !== null && Number(lo) > Number(hi)) throw new Error("The lower target is above the upper one.");
  if (p.period !== undefined && p.period !== m.period) {
    const period = pick(p.period, PERIODS, m.period);
    const [{ count }, { count: series }] = await Promise.all([
      db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("metric_id", metricId),
      // A Target Series or Projection is kept by period too: a month's target would not start a quarter.
      db().from("series_values").select("id", { count: "exact", head: true }).eq("metric_id", metricId),
    ]);
    if (count) throw new Error("The period cannot change once the Metric has values: they would sit in the wrong periods. Duplicate it instead.");
    if (series) throw new Error("The period cannot change while the Metric has targets or projections by period: remove them first.");
    update.period = period;
  }
  if (!Object.keys(update).length) return;
  const { error } = await db().from("metrics").update(update).eq("id", metricId).eq("workspace_id", ws);
  if (error) throw new Error("The change could not be saved.");
  await recordVersion("metric", metricId, actor.personId, { message: "Changed its description" });
}

/** Whether the actor may change the Metric (see editableMetric), for showing the controls; the core checks again. */
export async function canEditMetric(actor: Actor, metricId: number): Promise<boolean> {
  return editableMetric(actor, metricId).then(() => true, () => false);
}
