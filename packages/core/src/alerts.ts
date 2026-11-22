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
import { ALERTS_PER_METRIC } from "./alert-limits";
import { effectiveLimit } from "./limits";
import { sendingLimit } from "./sending-limit";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { openRows, reserveIds, sealRow } from "./sealed-columns";
import { attainmentMethodOf } from "./workspace-settings";
import { getMetrics } from "./workspace-data";
import { checkAlerts } from "./alert-firing";
import { listOwnPersonalWebhooks } from "./personal-webhooks";
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
export type AlertInput = { metricId: number; condition: AlertCondition; delivery?: AlertDelivery; includeUnapproved?: boolean; /** The person's own Personal Webhooks that also hear it (spec 0037); the web app only, never a key. */ webhookIds?: string[] };

/** One of a person's Alerts, with its Metric's name as the person sees it. */
export type MyAlert = {
  id: number;
  metric: { id: number; slug: string; name: string };
  condition: AlertCondition;
  delivery: AlertDelivery;
  includeUnapproved: boolean;
  /** The person's own Personal Webhooks that still exist and also hear this Alert (spec 0037). */
  webhookIds: string[];
  pausedByPerson: boolean;
  paused: AlertPause | null;
  state: "armed" | "fired";
  firedAt: string | null;
  createdAt: string;
};

/** What the database stores of an Alert, before it is opened. */
type Row = { id: number; metric_id: number; kind: AlertKind; level: string | null; delivery: AlertDelivery; include_unapproved: boolean; webhook_ids: string[]; paused_by_person: boolean; paused: AlertPause | null; state: "armed" | "fired"; fired_at: string | null; created_at: string };
const COLUMNS = "id, metric_id, kind, level, delivery, include_unapproved, webhook_ids, paused_by_person, paused, state, fired_at, created_at";

/** A refusal in Ziffr's words, written for the person who asked (a limit, a condition the Metric cannot give, a bad
 * choice). Callers show its message; any other Error is a fault and stays out of sight. */
export class AlertRefused extends Error {
  constructor(message: string) { super(message); this.name = "AlertRefused"; }
}

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
  if (!validCondition(c)) throw new AlertRefused("That is not a condition an Alert can wait for.");
  if (c.kind === "share_of_target") {
    const range = { min: metric.target_min ?? null, max: metric.target_max ?? null };
    const method = await attainmentMethodOf(actor.workspaceId);
    // A Target Series is used per period, so a Metric with one has a target for the latest period.
    const { count } = await db().from("series_values").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("metric_id", metric.id).eq("kind", "target");
    if (!targetAllowsShare(metric, range, method) && !count) throw new AlertRefused("This Metric has no target with a percentage, so an Alert on a share of target is not possible.");
  }
  if (c.kind === "missing_after_due") {
    const { data } = await db().from("metrics").select("workflow_id").eq("id", metric.id).eq("workspace_id", actor.workspaceId).maybeSingle();
    if (!data?.workflow_id) throw new AlertRefused("This Metric has no Workflow, so it has no Due Date for an Alert to wait for.");
  }
}

/** The delivery and option of a request, checked: anything else is refused. */
function checkOptions(delivery: unknown, include: unknown): { delivery: AlertDelivery; include: boolean } {
  const d = delivery === undefined ? "usual" : delivery;
  if (!ALERT_DELIVERIES.includes(d as AlertDelivery)) throw new AlertRefused("That is not a way an Alert can be delivered.");
  if (include !== undefined && typeof include !== "boolean") throw new AlertRefused("Include values not approved yet is on or off.");
  return { delivery: d as AlertDelivery, include: include === true };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Personal Webhooks one Alert may also send to. */
export const ALERT_WEBHOOKS_MAX = 3;
const NO_WEBHOOK = "That Webhook was not found.";
const MISSING_NO_WEBHOOK = "An Alert on a missing value has no value to send, so it cannot also go to a Webhook.";

/** The Personal Webhooks an Alert is to send to, checked: only the acting person's own, in this Workspace, each once. A
 * Webhook that is someone else's or not there is refused in the same words, so the answer tells nothing about it. Only a
 * signed-in person names one: a key never does (changing where data leaves is for the person at the page, spec 0037). */
async function checkedWebhooks(actor: Actor, raw: unknown): Promise<string[]> {
  if (actor.key) throw new Forbidden("A key cannot send an Alert to a Webhook.");
  if (!Array.isArray(raw) || raw.length > ALERT_WEBHOOKS_MAX) throw new AlertRefused(`An Alert can also send to at most ${ALERT_WEBHOOKS_MAX} Webhooks.`);
  const ids: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || !UUID.test(id)) throw new Forbidden(NO_WEBHOOK);
    if (!ids.includes(id.toLowerCase())) ids.push(id.toLowerCase());
  }
  if (!ids.length) return ids;
  const { data } = await db().from("webhooks").select("id").eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).in("id", ids);
  if ((data?.length ?? 0) !== ids.length) throw new Forbidden(NO_WEBHOOK);
  return ids;
}

/** The person's own Personal Webhooks an Alert may name, with whether each hears `alert.fired`: nothing while the
 * Workspace does not allow them, or for anyone who may not have one. Names and ids only, never an address or a secret. */
export async function alertWebhookChoices(actor: Actor): Promise<{ id: string; name: string; hearsAlerts: boolean }[]> {
  try {
    const { allowed, webhooks } = await listOwnPersonalWebhooks(actor);
    return allowed ? webhooks.map((w) => ({ id: w.id, name: w.name, hearsAlerts: w.events.includes("alert.fired") })) : [];
  } catch (e) {
    if (e instanceof Forbidden) return [];
    throw e;
  }
}

/** The words for each refusal of the limits, in numbers the person can act on. */
const limitWords = (perPerson: number): Record<string, string> => ({
  person_limit: `You already hold ${perPerson} Alerts in this Workspace, counting any on Metrics you can no longer see. Delete one to make another.`,
  metric_limit: `You already hold ${ALERTS_PER_METRIC} Alerts on this Metric. Change or delete one to make another.`,
});

/** Makes an Alert for the acting person on a Metric they may see; returns its id. The limits are checked in the
 * database under a lock, so Alerts made at once cannot pass them together. Never in the demo. */
export async function createAlert(actor: Actor, input: AlertInput): Promise<number> {
  refuseInDemo(actor);
  if (typeof input !== "object" || input === null) throw new AlertRefused("That is not an Alert.");
  const metric = await seen(actor, input.metricId);
  if (metric.archived_at) throw new AlertRefused("This Metric is archived. Bring it back to set an Alert on it.");
  const { delivery, include } = checkOptions(input.delivery, input.includeUnapproved);
  await checkPossible(actor, metric, input.condition);
  const { kind, level } = split(input.condition);
  const webhookIds = input.webhookIds === undefined ? [] : await checkedWebhooks(actor, input.webhookIds);
  if (webhookIds.length && kind === "missing_after_due") throw new AlertRefused(MISSING_NO_WEBHOOK);
  const [id] = await reserveIds("alerts", 1);
  const row = await sealRow("alerts", actor.workspaceId, { id, level });
  const [perWorkspace, perPerson] = await Promise.all([sendingLimit("alertsPerWorkspace"), effectiveLimit("alertsPerPerson", actor.workspaceId)]);
  const { data, error } = await db().rpc("create_alert", {
    p_id: id, p_ws: actor.workspaceId, p_person: actor.personId, p_metric: metric.id, p_kind: kind, p_level: row.level ?? null, p_delivery: delivery, p_include: include,
    p_per_person: perPerson, p_per_metric: ALERTS_PER_METRIC, p_per_workspace: perWorkspace,
  });
  if (error || typeof data !== "string") {
    console.error("create_alert failed:", error?.message ?? "no answer");
    throw new AlertRefused("The Alert could not be saved. Try again in a moment.");
  }
  if (data === "ok") {
    if (webhookIds.length) {
      const { error: nameError } = await db().from("alerts").update({ webhook_ids: webhookIds }).eq("id", id).eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
      // Never an Alert that sends less than was asked: without its Webhooks it is taken back.
      if (nameError) { await db().from("alerts").delete().eq("id", id).eq("workspace_id", actor.workspaceId); throw new AlertRefused("The Alert could not be saved. Try again in a moment."); }
    }
    return id;
  }
  if (data === "workspace_limit") throw new AlertRefused(`This Workspace already holds ${perWorkspace} Alerts, the most it may.`);
  const words = limitWords(perPerson);
  if (data in words) throw new AlertRefused(words[data]);
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
  // Only Webhooks that are still the person's own: one deleted since is not named.
  const named = [...new Set(opened.flatMap((r) => r.webhook_ids ?? []))];
  const own = new Set(named.length ? ((await db().from("webhooks").select("id").eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).in("id", named)).data ?? []).map((w) => String(w.id)) : []);
  const out: MyAlert[] = [];
  for (const r of opened) {
    const m = byId.get(Number(r.metric_id));
    const condition = join(r.kind, r.level);
    // Without sight, or a level that does not open, there is nothing to show.
    if (!m || !visible.has(m.id) || !condition) continue;
    out.push({ id: Number(r.id), metric: { id: m.id, slug: m.slug, name: m.name }, condition, delivery: r.delivery, includeUnapproved: r.include_unapproved, webhookIds: (r.webhook_ids ?? []).filter((w) => own.has(w)), pausedByPerson: r.paused_by_person, paused: r.paused, state: r.state, firedAt: r.fired_at, createdAt: r.created_at });
  }
  return out;
}

/** What the editor needs for one Metric before the person asks: which kinds the Metric can give (with the reason it
 * cannot) and how near the person is to the limits. Only for a Metric they see; counts are theirs alone. */
export type AlertChoices = {
  unavailable: Partial<Record<AlertKind, string>>;
  held: { person: number; metric: number; perPerson: number; perMetric: number };
  archived: boolean;
};

/** The kinds an Alert on this Metric can use and the limits, so the editor says so instead of offering what would be
 * refused. Needs sight of the Metric, answered like a Metric that is not there otherwise. */
export async function alertChoices(actor: Actor, metricId: number): Promise<AlertChoices> {
  const metric = await seen(actor, metricId);
  const unavailable: AlertChoices["unavailable"] = {};
  for (const c of [{ kind: "share_of_target", share: "80" }, { kind: "missing_after_due" }] as const) {
    try { await checkPossible(actor, metric, c); } catch (e) { if (e instanceof Forbidden) throw e; unavailable[c.kind] = (e as Error).message; }
  }
  // Counted as the database counts them, Alerts on Metrics the person can no longer see included.
  const mine = await db().from("alerts").select("metric_id").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
  const rows = mine.data ?? [];
  return { unavailable, held: { person: rows.length, metric: rows.filter((r) => Number(r.metric_id) === metric.id).length, perPerson: await effectiveLimit("alertsPerPerson", actor.workspaceId), perMetric: ALERTS_PER_METRIC }, archived: Boolean(metric.archived_at) };
}

/** What may be changed on an Alert: its condition, way of delivery, option, and whether it is paused. */
export type AlertChange = { condition?: AlertCondition; delivery?: AlertDelivery; includeUnapproved?: boolean; paused?: boolean; /** The person's own Personal Webhooks that also hear it (spec 0037); the web app only, never a key. */ webhookIds?: string[] };

/** Changes one of the acting person's own Alerts, while they still see its Metric. A new condition arms it again.
 * Pausing is the person's own switch, kept apart: resuming ends only that, and the system's pauses (no access,
 * archived, no target, no Workflow) neither undo it nor are undone by it. */
export async function updateAlert(actor: Actor, id: number, change: AlertChange): Promise<void> {
  refuseInDemo(actor);
  if (!Number.isInteger(id)) throw new Forbidden(NOT_FOUND);
  if (typeof change !== "object" || change === null) throw new AlertRefused("That is not a change to an Alert.");
  const { data } = await db().from("alerts").select("id, metric_id, kind, webhook_ids").eq("id", id).eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  if (!data) throw new Forbidden(NOT_FOUND);
  const metric = await seen(actor, Number(data.metric_id));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (change.delivery !== undefined || change.includeUnapproved !== undefined) {
    const o = checkOptions(change.delivery, change.includeUnapproved);
    if (change.delivery !== undefined) patch.delivery = o.delivery;
    if (change.includeUnapproved !== undefined) patch.include_unapproved = o.include;
  }
  if (change.paused !== undefined && typeof change.paused !== "boolean") throw new AlertRefused("An Alert is paused or not.");
  if (change.webhookIds !== undefined) patch.webhook_ids = await checkedWebhooks(actor, change.webhookIds);
  // The Webhooks it will have after this change: an Alert on a missing value has no value to send.
  const after = (patch.webhook_ids as string[] | undefined) ?? ((data.webhook_ids as string[] | null) ?? []);
  const kindAfter = change.condition !== undefined ? split(change.condition).kind : (data.kind as AlertKind);
  if (after.length && kindAfter === "missing_after_due") throw new AlertRefused(MISSING_NO_WEBHOOK);
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
    throw new AlertRefused("The Alert could not be saved. Try again in a moment.");
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
  if (error) throw new AlertRefused("The Alert could not be removed. Try again in a moment.");
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
  const back = new Map<number, number[]>();
  for (const r of rows) {
    const person = String(r.person_id);
    if (!seeing.has(person)) seeing.set(person, await visibleMetricIds(workspaceId, person, metrics));
    const m = byId.get(Number(r.metric_id));
    const sees = !!m && seeing.get(person)!.has(m.id);
    let patch: Record<string, unknown> | null = null;
    if (!sees && r.paused !== "no_access") { patch = { paused: "no_access", no_access_since: new Date().toISOString() }; paused++; }
    else if (sees && r.paused === "no_access") { patch = { paused: null, no_access_since: null }; resumed++; back.set(Number(r.metric_id), [...(back.get(Number(r.metric_id)) ?? []), Number(r.id)]); }
    else if (sees && m!.archived_at && r.paused === null) patch = { paused: "archived" };
    else if (sees && !m!.archived_at && r.paused === "archived") patch = { paused: null };
    if (patch) await db().from("alerts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", r.id).eq("workspace_id", workspaceId);
  }
  // Sight is back: the Alert is brought up to date without a message, as after an Import.
  for (const [metricId, ids] of back) await checkAlerts(metricId, { imported: true, only: ids });
  const { data: removed } = await db().rpc("remove_stale_alerts", { p_days: ALERT_NO_ACCESS_DAYS });
  return { paused, resumed, removed: typeof removed === "number" ? removed : 0 };
}
