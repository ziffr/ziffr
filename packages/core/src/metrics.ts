// Creating Metrics and uploading their Target Series and Projections (GLOSSARY: Metric, Token, Target Series,
// Projection). Every function takes the Actor first and works only inside the actor's Workspace.
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { periodStart } from "./format";
import { parseSeriesLine } from "./series-lines";
import { assertSeesMetrics } from "./sharing";
import type { Format, MetricDescription, Period, Polarity, SourceId, SubmissionRule } from "./types";
import { recordVersion } from "./versions";
import { deliverPrompt } from "./deliveries";
import { audit } from "./audit-log";

const FORMATS: Format[] = ["number", "currency", "percent"];
const PERIODS: Period[] = ["day", "week", "month"];
const RULES: SubmissionRule[] = ["reject", "overwrite", "add", "keep_both"];
const POLARITIES: Polarity[] = ["higher", "lower", "target"];
const AGGREGATIONS = ["sum", "average", "last", "none"];
const SOURCES: SourceId[] = ["slack", "mail", "web_form"];

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
  return {
    original: m.name,
    name: `${m.name} (copy)`.slice(0, 120), description: m.description, unit: m.unit, format: m.format, decimals: m.decimals, period: m.period,
    submission_rule: m.submission_rule, polarity: m.polarity, aggregation: m.aggregation,
    target_min: m.target_min === null ? null : Number(m.target_min), target_max: m.target_max === null ? null : Number(m.target_max),
    sources: m.sources, workflow: workflow ? { id: workflow.id as number, name: workflow.name as string } : null, submitters: [...new Set((tokens ?? []).map((t) => t.submitter_id as string))], duplicateOf: m.id,
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

/** The Metric owner uploads a Target Series or Projection, one "period value" line each; lines that cannot be read
 * are skipped and counted. */
export async function uploadSeries(actor: Actor, metricId: number, kind: "target" | "projection", text: string, note: string) {
  const m = await seriesOwnerMetric(actor, metricId, kind);
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 2000);
  const read = lines.map((l) => parseSeriesLine(l, m.period as Period)).filter((r): r is { period: string; value: number } => r !== null);
  const saved = await upsertSeries(metricId, kind, read, note);
  return { saved, skipped: lines.length - saved };
}

/** The Metric owner saves Target Series or Projection rows edited in a table, as period start and value. Rows with a
 * period or value that cannot be read are refused as a whole, since the table checked them already. */
export async function saveSeriesRows(actor: Actor, metricId: number, kind: "target" | "projection", rows: unknown, note: string) {
  const m = await seriesOwnerMetric(actor, metricId, kind);
  // Rows come from a browser: check the shape, the size and every value before anything is written.
  if (!Array.isArray(rows) || rows.length > 2000) throw new Error("Send at most 2,000 rows.");
  const read = rows.map((r) => {
    const period = typeof r?.period === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.period) ? r.period : null;
    const value = typeof r?.value === "number" && Number.isFinite(r.value) ? r.value : null;
    if (!period || value === null || Number.isNaN(new Date(`${period}T00:00:00`).getTime())) throw new Error("Every row needs a period and a number.");
    // A day inside the period counts as that period, as in pasted lines.
    return { period: periodStart(new Date(`${period}T00:00:00`), m.period as Period), value };
  });
  return { saved: await upsertSeries(metricId, kind, read, note) };
}

/** The metric, when the actor owns it in their workspace; only its owner sets targets and projections. */
async function seriesOwnerMetric(actor: Actor, metricId: number, kind: string) {
  if (kind !== "target" && kind !== "projection") throw new Forbidden("Unknown series.");
  const { data: m } = await db().from("metrics").select("owner_id, period").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || m.owner_id !== actor.personId) throw new Forbidden("Only the metric owner can upload targets and projections.");
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
