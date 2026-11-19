// Metrics created and changed by programs (spec 0003, ticket #211; GLOSSARY: Metric, Access Key, Target Range,
// Target Series, Projection). A key with metrics:write creates a Metric as its creator, through the web form's
// createMetric; one with metrics:edit changes a Metric's Polarity, Target Range and Attainment method, its Target Series and its
// Projections through the same core functions as the Metric's page, so every field is checked the same
// way: only the Metric's owner and its Editors change it, and only while the creator's role may create. Nothing else
// of a Metric is writable by a key: not its name or description (which other people's assistants read), not sharing,
// not Submitters beyond its creator, not a formula or a Catalog entry. Each change names the key: in the Metric's
// history, and in the note of each Target Series or Projection value.
import { assertScope, can, Forbidden, type Actor, type KeyActor } from "./actor";
import { toApi, type ApiMetric } from "./api";
import { db } from "./db";
import { createMetric, deleteMetric, metricEffects, removeSeriesRows, saveSeriesRows, TooManyMetrics, updateMetricDetails, type MetricEffects } from "./metrics";
import { yearStartFor } from "./fiscal-year";
import { withVersionNote } from "./versions";
import { setWorkflowCheck } from "./workflows";
import type { WorkflowConfig, WorkflowStep } from "./types";
import { isPeriodStart, periodStart } from "./periods";
import { normalizeMetric } from "./metric-row";
import { DEMO_WORKSPACE_ID } from "./team";
import { getMetrics, getSeriesValues } from "./workspace-data";
import { visibleMetricIds } from "./access";
import type { Metric } from "./types";

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
};

/** Creates a Metric owned by the key's creator (scope metrics:write) and returns it as programs see it. Refused when
 * the creator's current role may not create (Guests), and in the demo. */
export async function createMetricWithKey(actor: Actor | KeyActor, input: ApiMetricInput, effects: MetricEffects = metricEffects): Promise<ApiMetric> {
  assertScope(actor, "metrics:write");
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo has no Access Keys.");
  // The key's creator, with their role as it is now (actorForKey reads it on every call).
  const creator: Actor = { personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role };
  const keyName = actor.key ? await nameOf(actor) : null;
  const { id } = await createMetric(creator, {
    name: String(input?.name ?? ""),
    description: input.description, unit: input.unit, unitPosition: input.unit_position, format: input.format, decimals: input.decimals, period: input.period,
    submissionRule: input.submission_rule, polarity: input.polarity, aggregation: input.aggregation,
    targetMin: input.target_min, targetMax: input.target_max, attainmentMethod: input.attainment_method,
    // As in the form: every way Ziffr knows, the API among them, so the key can submit to it at once.
    sources: ["web_form", "mail", "slack", "telegram", "api"],
    submitters: input.submit ? [actor.personId] : [],
  }, {
    ...effects,
    recordCreated: (metricId, by) => effects.recordCreated(metricId, by, keyName ? `Created through the API (key “${keyName}”)` : "Created through the API"),
  }, { accessKeyId: actor.key ? Number(actor.key.id) : undefined });
  const { data } = await db().from("metrics").select("*").eq("id", id).eq("workspace_id", actor.workspaceId).single();
  return toApi(normalizeMetric(data) as Metric);
}

/** Deletes a Metric for a key with metrics:write, as its creator: only when they own it, with its exact name to
 * confirm, and never while anything uses it, exactly as in the app. The Audit Log names the key. */
export async function deleteMetricWithKey(actor: Actor | KeyActor, slug: string, confirmName: string): Promise<{ values: number }> {
  assertScope(actor, "metrics:write");
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo has no Access Keys.");
  const metrics = await getMetrics(actor.workspaceId);
  const m = metrics.find((x) => x.slug === String(slug));
  // A Metric that is missing, of another workspace or hidden from the creator is refused without a reason (404).
  if (!m || !(await visibleMetricIds(actor.workspaceId, actor.personId, metrics)).has(m.id)) throw new Forbidden();
  const creator: Actor = { personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role };
  return deleteMetric(creator, m.id as number, String(confirmName ?? ""), { accessKeyId: actor.key ? Number(actor.key.id) : undefined });
}

/** Thrown when a change to a Metric is refused for its content, such as a lower target above the upper one or a
 * Projection for a period that is over; nothing was changed. The API answers 422 with the message. */
export class MetricChangeRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricChangeRefused";
  }
}

/** What a program may change of a Metric's description (PATCH /metrics/{slug}): its Polarity, Target Range and
 * Attainment method. Each part left out stays. */
export type ApiMetricPatch = {
  polarity?: "higher" | "lower" | "target";
  target_min?: number | null;
  target_max?: number | null;
  attainment_method?: "ratio" | "distance" | null;
};

/** The Metric a key with metrics:edit is about to change, and its creator as a person's Actor. A Metric that is
 * missing, of another workspace or hidden from the creator is refused without a reason (404); a creator whose role may
 * no longer create (now a Guest) is refused with one. Whether they may change this Metric is the core's check after. */
async function changeableByKey(actor: Actor | KeyActor, slug: string): Promise<{ creator: Actor; metric: Metric }> {
  assertScope(actor, "metrics:edit");
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo has no Access Keys.");
  const metrics = await getMetrics(actor.workspaceId);
  const metric = metrics.find((x) => x.slug === String(slug));
  if (!metric || !(await visibleMetricIds(actor.workspaceId, actor.personId, metrics)).has(metric.id)) throw new Forbidden();
  const creator: Actor = { personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role };
  // As for creating: a key changes Metrics only while its creator's role may create, so a Guest's key never does.
  if (!can(creator, "create")) throw new Forbidden("The key's creator's role may not change Metrics.");
  return { creator, metric };
}

/** Changes a Metric's Polarity, Target Range or Attainment method for a key with metrics:edit, as its creator: only
 * when they own the Metric or are its Editor, as on its page. Its history names the key. Returns it as programs see it. */
export async function updateMetricWithKey(actor: Actor | KeyActor, slug: string, patch: ApiMetricPatch): Promise<ApiMetric> {
  const { creator, metric } = await changeableByKey(actor, slug);
  const p = patch ?? {};
  // The core checks this too, but as a plain error; said here so a program gets 422 with the reason.
  const lo = p.target_min !== undefined ? p.target_min : metric.target_min ?? null;
  const hi = p.target_max !== undefined ? p.target_max : metric.target_max ?? null;
  if (lo !== null && hi !== null && lo > hi) throw new MetricChangeRefused("The lower target is above the upper one.");
  for (const v of [p.target_min, p.target_max]) if (v !== undefined && v !== null && !inRange(v)) throw new MetricChangeRefused(`A target must be a number between -${SERIES_VALUE_MAX} and ${SERIES_VALUE_MAX}.`);
  // Only these parts, whatever else the patch holds: never a name, a description, a unit or a period.
  const details = { polarity: p.polarity, targetMin: p.target_min, targetMax: p.target_max, attainmentMethod: p.attainment_method };
  const keyName = actor.key ? await nameOf(actor) : null;
  await withVersionNote(keyName ? `Changed through the API (key “${keyName}”)` : "Changed through the API", () => updateMetricDetails(creator, metric.id as number, details));
  const { data } = await db().from("metrics").select("*").eq("id", metric.id).eq("workspace_id", actor.workspaceId).single();
  return toApi(normalizeMetric(data) as Metric);
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
  const saves = [...last].filter(([, v]) => v !== null).map(([period, value]) => ({ period, value: value as number }));
  const removes = [...last].filter(([, v]) => v === null).map(([period]) => period);
  const saved = saves.length ? (await saveSeriesRows(creator, metric.id as number, kind, saves, note)).saved : 0;
  const removed = removes.length ? (await removeSeriesRows(creator, metric.id as number, kind, removes)).removed : 0;
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
  const { data: wf } = await db().from("workflows").select("id, name, owner_id, config, updated_at").eq("id", workflowId).eq("workspace_id", actor.workspaceId).maybeSingle();
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
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo has no Access Keys.");
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
