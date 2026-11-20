// Alerts (GLOSSARY: Alert, Attainment, Due Date; spec 0032, ticket #373): a person's own standing request, on one
// Metric they may see, to be told when its latest value meets a condition. This module makes, lists, changes and
// removes them, Actor first, and keeps their bookkeeping (paused, no access); nothing fires here (ticket 3).
// Security: an Alert belongs to its person and nobody sets one for another; every read and change needs sight of the
// Metric at that moment (visibility.ts through visibleMetricIds), and a Metric the person cannot see is answered like
// one that does not exist, so an Alert never confirms that a Metric is there. The level is sealed with the Workspace
// Key (spec 0028); the limits are enforced in the database under a lock (create_alert).
import type { Actor } from "./actor";
import { Forbidden } from "./actor";
import { visibleMetricIds } from "./access";
import { validCondition, type AlertCondition, type AlertKind, targetAllowsShare } from "./alert-rules";
import { ALERTS_PER_METRIC, ALERTS_PER_PERSON, ALERTS_PER_WORKSPACE } from "./alert-limits";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { openRows, reserveIds, sealRow } from "./sealed-columns";
import { attainmentMethodOf } from "./workspace-settings";
import { getMetrics } from "./workspace-data";
import type { Metric } from "./types";

/** How long an Alert without sight of its Metric is kept before it is removed (owner decision, spec 0032). */
export const ALERT_NO_ACCESS_DAYS = 180;

/** The ways of delivery: the person's Delivery Preference ("usual") or one way picked for one Alert. */
export const ALERT_DELIVERIES = ["usual", "email", "slack", "telegram"] as const;
/** One way of delivery. */
export type AlertDelivery = (typeof ALERT_DELIVERIES)[number];

/** Why the system does not let an Alert fire; null while it does. The person's own pause is apart (`pausedByPerson`). */
export type AlertPause = "no_access" | "archived" | "no_target" | "no_workflow";

/** What a person says to make or change an Alert. */
export type AlertInput = { metricId: number; condition: AlertCondition; delivery?: AlertDelivery; includeUnapproved?: boolean };

/** One of a person's Alerts, with its Metric's name as the person sees it. */
export type MyAlert = {
  id: number;
  metric: { id: number; slug: string; name: string };
  condition: AlertCondition;
  delivery: AlertDelivery;
  includeUnapproved: boolean;
  pausedByPerson: boolean;
  paused: AlertPause | null;
  state: "armed" | "fired";
  firedAt: string | null;
  createdAt: string;
};

/** What the database stores of an Alert, before it is opened. */
type Row = { id: number; metric_id: number; kind: AlertKind; level: string | null; delivery: AlertDelivery; include_unapproved: boolean; paused_by_person: boolean; paused: AlertPause | null; state: "armed" | "fired"; fired_at: string | null; created_at: string };
const COLUMNS = "id, metric_id, kind, level, delivery, include_unapproved, paused_by_person, paused, state, fired_at, created_at";

/** The same words for a Metric that is not there and one the person may not see. */
const NOT_FOUND = "That Metric was not found.";

/** The condition's kind and its number as text (null for "missing_after_due"): what is stored. */
function split(c: AlertCondition): { kind: AlertKind; level: string | null } {
  if (c.kind === "at_or_above" || c.kind === "below") return { kind: c.kind, level: c.value };
  if (c.kind === "share_of_target" || c.kind === "changed_more") return { kind: c.kind, level: c.share };
  return { kind: c.kind, level: null };
}

/** The condition a stored kind and level make; null when the level is missing or does not open. */
function join(kind: AlertKind, level: string | null): AlertCondition | null {
  const c = kind === "at_or_above" || kind === "below" ? { kind, value: level } : kind === "share_of_target" || kind === "changed_more" ? { kind, share: level } : { kind };
  return validCondition(c) ? c : null;
}

/** The Metric as the person sees it, or the refusal that does not say whether it exists. */
async function seen(actor: Actor, metricId: unknown): Promise<Metric> {
  if (!Number.isInteger(metricId)) throw new Forbidden(NOT_FOUND);
  const metrics = await getMetrics(actor.workspaceId);
  const visible = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  const metric = metrics.find((m) => m.id === metricId);
  if (!metric || !visible.has(metric.id)) throw new Forbidden(NOT_FOUND);
  return metric;
}

/** Refuses a condition the Metric cannot give: a malformed one, a share of target without a target, "not in by its Due
 * Date" without a Workflow. Plain Errors in Ziffr's words, so a person reads why. */
async function checkPossible(actor: Actor, metric: Metric, c: AlertCondition): Promise<void> {
  if (!validCondition(c)) throw new Error("That is not a condition an Alert can wait for.");
  if (c.kind === "share_of_target") {
    const range = { min: metric.target_min ?? null, max: metric.target_max ?? null };
    const method = await attainmentMethodOf(actor.workspaceId);
    // A Target Series is used per period, so a Metric with one has a target for the latest period.
    const { count } = await db().from("series_values").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("metric_id", metric.id).eq("kind", "target");
    if (!targetAllowsShare(metric, range, method) && !count) throw new Error("This Metric has no target with a percentage, so an Alert on a share of target is not possible.");
  }
  if (c.kind === "missing_after_due") {
    const { data } = await db().from("metrics").select("workflow_id").eq("id", metric.id).eq("workspace_id", actor.workspaceId).maybeSingle();
    if (!data?.workflow_id) throw new Error("This Metric has no Workflow, so it has no Due Date for an Alert to wait for.");
  }
}

/** The delivery and option of a request, checked: anything else is refused. */
function checkOptions(delivery: unknown, include: unknown): { delivery: AlertDelivery; include: boolean } {
  const d = delivery === undefined ? "usual" : delivery;
  if (!ALERT_DELIVERIES.includes(d as AlertDelivery)) throw new Error("That is not a way an Alert can be delivered.");
  if (include !== undefined && typeof include !== "boolean") throw new Error("Include values not approved yet is on or off.");
  return { delivery: d as AlertDelivery, include: include === true };
}

/** The words for each refusal of the limits, in numbers the person can act on. */
const LIMIT_WORDS: Record<string, string> = {
  person_limit: `You already have ${ALERTS_PER_PERSON} Alerts in this Workspace. Delete one to make another.`,
  metric_limit: `You already have ${ALERTS_PER_METRIC} Alerts on this Metric. Change or delete one to make another.`,
  workspace_limit: `This Workspace already holds ${ALERTS_PER_WORKSPACE} Alerts, the most it may.`,
};

/** Makes an Alert for the acting person on a Metric they may see; returns its id. The limits are checked in the
 * database under a lock, so Alerts made at once cannot pass them together. Never in the demo. */
export async function createAlert(actor: Actor, input: AlertInput): Promise<number> {
  refuseInDemo(actor);
  if (typeof input !== "object" || input === null) throw new Error("That is not an Alert.");
  const metric = await seen(actor, input.metricId);
  if (metric.archived_at) throw new Error("This Metric is archived. Bring it back to set an Alert on it.");
  const { delivery, include } = checkOptions(input.delivery, input.includeUnapproved);
  await checkPossible(actor, metric, input.condition);
  const { kind, level } = split(input.condition);
  const [id] = await reserveIds("alerts", 1);
  const row = await sealRow("alerts", actor.workspaceId, { id, level });
  const { data, error } = await db().rpc("create_alert", {
    p_id: id, p_ws: actor.workspaceId, p_person: actor.personId, p_metric: metric.id, p_kind: kind, p_level: row.level ?? null, p_delivery: delivery, p_include: include,
    p_per_person: ALERTS_PER_PERSON, p_per_metric: ALERTS_PER_METRIC, p_per_workspace: ALERTS_PER_WORKSPACE,
  });
  if (error || typeof data !== "string") {
    console.error("create_alert failed:", error?.message ?? "no answer");
    throw new Error("The Alert could not be saved. Try again in a moment.");
  }
  if (data === "ok") return id;
  if (data in LIMIT_WORDS) throw new Error(LIMIT_WORDS[data]);
  throw new Forbidden(NOT_FOUND);
}

/** The acting person's own Alerts that they can still see, newest first; of one Metric when `metricId` is given.
 * An Alert whose Metric the person cannot see is left out, since its name would show that it still exists. */
export async function listMyAlerts(actor: Actor, metricId?: number): Promise<MyAlert[]> {
  if (metricId !== undefined && !Number.isInteger(metricId)) return [];
  let q = db().from("alerts").select(COLUMNS).eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).order("id", { ascending: false });
  if (metricId !== undefined) q = q.eq("metric_id", metricId);
  const { data } = await q;
  if (!data?.length) return [];
  const metrics = await getMetrics(actor.workspaceId);
  const visible = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const opened = await openRows("alerts", actor.workspaceId, data as Row[]);
  const out: MyAlert[] = [];
  for (const r of opened) {
    const m = byId.get(Number(r.metric_id));
    const condition = join(r.kind, r.level);
    // Without sight, or a level that does not open, there is nothing to show.
    if (!m || !visible.has(m.id) || !condition) continue;
    out.push({ id: Number(r.id), metric: { id: m.id, slug: m.slug, name: m.name }, condition, delivery: r.delivery, includeUnapproved: r.include_unapproved, pausedByPerson: r.paused_by_person, paused: r.paused, state: r.state, firedAt: r.fired_at, createdAt: r.created_at });
  }
  return out;
}

/** What may be changed on an Alert: its condition, way of delivery, option, and whether it is paused. */
export type AlertChange = { condition?: AlertCondition; delivery?: AlertDelivery; includeUnapproved?: boolean; paused?: boolean };

/** Changes one of the acting person's own Alerts, while they still see its Metric. A new condition arms it again.
 * Pausing is the person's own switch, kept apart: resuming ends only that, and the system's pauses (no access,
 * archived, no target, no Workflow) neither undo it nor are undone by it. */
export async function updateAlert(actor: Actor, id: number, change: AlertChange): Promise<void> {
  refuseInDemo(actor);
  if (!Number.isInteger(id)) throw new Forbidden(NOT_FOUND);
  if (typeof change !== "object" || change === null) throw new Error("That is not a change to an Alert.");
  const { data } = await db().from("alerts").select("id, metric_id").eq("id", id).eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  if (!data) throw new Forbidden(NOT_FOUND);
  const metric = await seen(actor, Number(data.metric_id));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (change.delivery !== undefined || change.includeUnapproved !== undefined) {
    const o = checkOptions(change.delivery, change.includeUnapproved);
    if (change.delivery !== undefined) patch.delivery = o.delivery;
    if (change.includeUnapproved !== undefined) patch.include_unapproved = o.include;
  }
  if (change.paused !== undefined && typeof change.paused !== "boolean") throw new Error("An Alert is paused or not.");
  if (change.paused !== undefined) patch.paused_by_person = change.paused;
  if (change.condition !== undefined) {
    await checkPossible(actor, metric, change.condition);
    const { kind, level } = split(change.condition);
    const row = await sealRow("alerts", actor.workspaceId, { id, level });
    // A condition the Metric can give ends the pauses that said it could not (no target, no Workflow); the person's stays.
    Object.assign(patch, { kind, level: row.level ?? null, state: "armed", fired_period: null, fired_at: null, ...(await clearsPause(actor, id)) });
  }
  const { error } = await db().from("alerts").update(patch).eq("id", id).eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
  if (error) {
    console.error("updateAlert failed:", error.message);
    throw new Error("The Alert could not be saved. Try again in a moment.");
  }
}

/** The pauses a new, possible condition ends: no target and no Workflow are about the old condition. */
async function clearsPause(actor: Actor, id: number): Promise<{ paused?: null }> {
  const { data } = await db().from("alerts").select("paused").eq("id", id).eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  return data?.paused === "no_target" || data?.paused === "no_workflow" ? { paused: null } : {};
}

/** Removes one of the acting person's own Alerts. Another person's, or one that is not there, is answered the same. */
export async function deleteAlert(actor: Actor, id: number): Promise<void> {
  refuseInDemo(actor);
  if (!Number.isInteger(id)) throw new Forbidden(NOT_FOUND);
  // Needs sight of the Metric like everything else, so success never says that a Metric the person lost is still there.
  const { data: own } = await db().from("alerts").select("metric_id").eq("id", id).eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  if (!own) throw new Forbidden(NOT_FOUND);
  await seen(actor, Number(own.metric_id));
  const { data, error } = await db().from("alerts").delete().eq("id", id).eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).select("id");
  if (error) throw new Error("The Alert could not be removed. Try again in a moment.");
  if (!data?.length) throw new Forbidden(NOT_FOUND);
}

/** The bookkeeping of a Workspace's Alerts, run by the system (the daily job), never for a person: an Alert whose
 * person no longer sees its Metric is paused as "no_access" with no message, and ends when sight returns; one on an
 * Archived Metric is paused as "archived" and resumes with it; Alerts (of any Workspace) without sight for over 180 days are removed.
 * Returns how many were paused, resumed and removed. Sends nothing. */
export async function refreshAlertSight(workspaceId: string): Promise<{ paused: number; resumed: number; removed: number }> {
  const { data } = await db().from("alerts").select("id, person_id, metric_id, paused, no_access_since").eq("workspace_id", workspaceId);
  const rows = data ?? [];
  const metrics = rows.length ? await getMetrics(workspaceId) : [];
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const seeing = new Map<string, Set<number>>();
  let paused = 0, resumed = 0;
  for (const r of rows) {
    const person = String(r.person_id);
    if (!seeing.has(person)) seeing.set(person, await visibleMetricIds(workspaceId, person, metrics));
    const m = byId.get(Number(r.metric_id));
    const sees = !!m && seeing.get(person)!.has(m.id);
    let patch: Record<string, unknown> | null = null;
    if (!sees && r.paused !== "no_access") { patch = { paused: "no_access", no_access_since: new Date().toISOString() }; paused++; }
    else if (sees && r.paused === "no_access") { patch = { paused: null, no_access_since: null }; resumed++; }
    else if (sees && m!.archived_at && r.paused === null) patch = { paused: "archived" };
    else if (sees && !m!.archived_at && r.paused === "archived") patch = { paused: null };
    if (patch) await db().from("alerts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", r.id).eq("workspace_id", workspaceId);
  }
  const { data: removed } = await db().rpc("remove_stale_alerts", { p_days: ALERT_NO_ACCESS_DAYS });
  return { paused, resumed, removed: typeof removed === "number" ? removed : 0 };
}
