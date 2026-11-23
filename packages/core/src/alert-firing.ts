// Firing Alerts (GLOSSARY: Alert, Delivery, Import, Due Date; spec 0032, ticket #374): after a value counts, or on the
// day after a Due Date, each Alert on the Metric is checked, and one that has become true sends one message through its
// person's Delivery Preference. The rules are alert-rules.ts; this reads the Metric as its page does, keeps each
// Alert's state, and sends. Never on a read, never for an Import, never to someone who cannot see the Metric.
// Security: an Alert message holds only its own Metric's name, period, value, target and change, and a link to the
// Metric's page; the person's sight of the Metric is checked when the Alert is looked at and again at the moment the
// Delivery is made (AGENTS.md rule 3), and a person without it is paused with no message at all. The state change is
// claimed in the database first, so two values at once send one message, and the daily limits are claimed there too.
import { format, parseISO } from "date-fns";
import { visibleMetricIds } from "./access";
import { effectiveLimit } from "./limits";
import { sendingLimit } from "./sending-limit";
import { alertHolds, alertStep, isPerPeriod, latestAndPrevious, valueCounts, validCondition, type AlertCondition, type AlertKind } from "./alert-rules";
import type { AlertDelivery } from "./alerts";
import { attainment, attainmentText, targetFor } from "./compare";
import { db } from "./db";
import { deliverAlert } from "./deliveries";
import { queueAlertFiredToPersonal } from "./webhook-events";
import { changePct } from "./exact";
import { formatChange, formatValue } from "./format";
import { formulaInputs } from "./formula";
import { openRows } from "./sealed-columns";
import { periodLabel, shiftPeriod, type YearStart } from "./periods";
import { yearStartFor } from "./fiscal-year";
import { DEMO_WORKSPACE_ID } from "./team";
import { attainmentMethodOf, numberStyleOf } from "./workspace-settings";
import { getMetrics, getSeriesOf, getSeriesValues } from "./workspace-data";
import type { AttainmentMethod } from "./attainment-method";
import type { NumberStyle } from "./number-style";
import type { Metric } from "./types";

/** The one last message of a person's day, once they have had their limit. */
export const ALERT_LIMIT_NOTE = "More Alerts fired today. Open Ziffr to see them.";

/** An Alert as the check reads it, its level opened. */
type Row = { id: number; person_id: string; metric_id: number; kind: AlertKind; level: string | null; delivery: AlertDelivery; include_unapproved: boolean; paused: "no_access" | null; state: "armed" | "fired"; fired_period: string | null; webhook_ids: string[] };
const COLUMNS = "id, person_id, metric_id, kind, level, delivery, include_unapproved, paused, state, fired_period, webhook_ids";

/** What every Alert on one Metric is checked against: the Metric's latest period as its page shows it. */
export type View = {
  /** The period the check is about. */
  period: string;
  value: string | null;
  previous: string | null;
  /** Whether the value waits for Approval or was sent back. */
  pending: boolean;
  target: { min: number | null; max: number | null; value: number | null };
  due?: string;
  today?: string;
};

/** What is shared by every check of one call. */
export type Ctx = { ws: string; metrics: Metric[]; style: NumberStyle; method: AttainmentMethod; seeing: Map<string, Set<number>> };

/** A number as plain decimal text ("12", "-0.5"), never an exponent: what the rules compare. */
function plain(n: number): string | null {
  if (!Number.isFinite(n)) return null;
  const t = String(n);
  return /e/i.test(t) ? n.toFixed(12).replace(/\.?0+$/, "") : t;
}

/** The Metrics a changed value reaches: the Metric itself and every Derived Metric computed from it, also through
 * another Derived Metric. */
function reached(metrics: readonly Metric[], id: number): Metric[] {
  const out = new Set<number>([id]);
  for (let grew = true; grew;) {
    grew = false;
    const slugs = new Set(metrics.filter((m) => out.has(m.id)).map((m) => m.slug));
    for (const m of metrics) if (m.formula && !out.has(m.id) && formulaInputs(m.formula).some((s) => slugs.has(s))) { out.add(m.id); grew = true; }
  }
  return metrics.filter((m) => out.has(m.id));
}

/** Checks the Alerts of a Metric (and of the Derived Metrics computed from it) after a value counted: recorded, approved,
 * corrected, or recomputed. Called once, from the core's one submit and approval path (workflow-engine.ts), whatever
 * the Source. `imported` is an Import: nothing fires, the Alerts are only brought up to date. `only` limits it to some
 * Alerts, for ones whose sight just came back. Never throws: a failing check must not fail the value that caused it. */
export async function checkAlerts(metricId: number, opts: { imported?: boolean; only?: number[] } = {}): Promise<void> {
  try {
    const { data: row } = await db().from("metrics").select("workspace_id").eq("id", metricId).maybeSingle();
    // Nothing is sent from the demo (spec 0032).
    if (!row || row.workspace_id === DEMO_WORKSPACE_ID) return;
    const ws = String(row.workspace_id);
    // The common case first, cheaply: a Workspace without Alerts has nothing to check.
    if (!(await db().from("alerts").select("id").eq("workspace_id", ws).limit(1)).data?.length) return;
    const metrics = await getMetrics(ws);
    const ctx: Ctx = { ws, metrics, style: await numberStyleOf(ws), method: await attainmentMethodOf(ws), seeing: new Map() };
    const hit = reached(metrics, metricId).filter((m) => !m.archived_at);
    if (!hit.length) return;
    let q = db().from("alerts").select(COLUMNS).eq("workspace_id", ws).in("metric_id", hit.map((m) => m.id)).eq("paused_by_person", false).neq("kind", "missing_after_due").or("paused.is.null,paused.eq.no_access");
    if (opts.only) q = q.in("id", opts.only);
    const { data } = await q;
    if (!data?.length) return;
    const alerts = (await openRows("alerts", ws, data)) as unknown as Row[];
    for (const m of hit) {
      const mine = alerts.filter((a) => a.metric_id === m.id);
      if (!mine.length) continue;
      const view = await latestView(ctx, m);
      if (view) for (const a of mine) await handle(ctx, m, a, view, !!opts.imported);
    }
  } catch (e) {
    console.error("Alerts could not be checked:", e instanceof Error ? e.message : e);
  }
}

/** The daily check of "not in by its Due Date" for one Metric's working period, which has no value: fires once per
 * period on the day after its Due Date (called from the Workflow run, which knows the period and the Due Date).
 * `today` and `due` are YYYY-MM-DD. Never throws. */
export async function checkMissingAlerts(ws: string, metricId: number, period: string, due: string, today: string): Promise<void> {
  try {
    if (ws === DEMO_WORKSPACE_ID || today <= due) return;
    const { data } = await db().from("alerts").select(COLUMNS).eq("workspace_id", ws).eq("metric_id", metricId).eq("kind", "missing_after_due").eq("paused_by_person", false).or("paused.is.null,paused.eq.no_access");
    if (!data?.length) return;
    const metrics = await getMetrics(ws);
    const m = metrics.find((x) => x.id === metricId);
    if (!m || m.archived_at || m.formula) return;
    const ctx: Ctx = { ws, metrics, style: await numberStyleOf(ws), method: await attainmentMethodOf(ws), seeing: new Map() };
    const view: View = { period, value: null, previous: null, pending: false, target: { min: null, max: null, value: null }, due, today };
    for (const a of (await openRows("alerts", ws, data)) as unknown as Row[]) await handle(ctx, m, a, view, false);
  } catch (e) {
    console.error("Alerts could not be checked:", e instanceof Error ? e.message : e);
  }
}

/** What one call shares: the Workspace's Metrics, number style and Attainment method, and who sees what (read lazily). */
export async function alertContext(ws: string): Promise<Ctx> {
  const metrics = await getMetrics(ws);
  return { ws, metrics, style: await numberStyleOf(ws), method: await attainmentMethodOf(ws), seeing: new Map() };
}

/** The Metric's latest period with a value, as an Alert sees it; null without a value. Only the Metric's own periods:
 * a Display Period changes how a chart groups, never what an Alert looks at. */
export async function latestView(ctx: Ctx, m: Metric): Promise<View | null> {
  const series = (await getSeriesOf(ctx.ws, ctx.metrics, [m.id]))[m.slug] ?? [];
  const found = latestAndPrevious(series.map((p) => ({ period: p.period, value: plain(p.value) })));
  if (!found) return null;
  const { latest } = found;
  // Only the period right before counts as "the period before" (the Unusual Value check reads it so).
  const before = shiftPeriod(latest.period, m.period, -1);
  return finishView(ctx, m, latest, found.previous?.period === before ? found.previous.value : null);
}

/** The Metric's value for one given period as an Alert sees it, or null when that period has no value any more. Used to
 * build a Webhook's message when it is sent, so what it says is the value as it counts then (a value sent back since is
 * not told); the period is the one a Tell step fired for, not the latest. */
export async function viewAt(ctx: Ctx, m: Metric, period: string): Promise<View | null> {
  const series = (await getSeriesOf(ctx.ws, ctx.metrics, [m.id]))[m.slug] ?? [];
  const points = series.map((p) => ({ period: p.period, value: plain(p.value) }));
  const at = points.find((p) => p.period === period);
  if (!at || at.value === null) return null;
  const before = shiftPeriod(period, m.period, -1);
  return finishView(ctx, m, at, points.find((p) => p.period === before)?.value ?? null);
}

/** What a view needs besides the value itself: whether it waits for Approval, and the target for its period. */
async function finishView(ctx: Ctx, m: Metric, latest: { period: string; value: string | null }, previous: string | null): Promise<View> {
  const inputs = [m.id, ...(m.formula ? ctx.metrics.filter((x) => formulaInputs(m.formula!).includes(x.slug)).map((x) => x.id) : [])];
  const [{ data: states }, { targets }] = await Promise.all([
    db().from("period_states").select("state").in("metric_id", inputs).eq("period_start", latest.period),
    getSeriesValues(ctx.ws, [m.id]),
  ]);
  // Waiting for Approval, or sent back: the value is not approved yet. No state at all (a Metric without a Workflow) counts.
  const pending = (states ?? []).some((s) => s.state === "approval" || s.state === "submitted");
  const t = targetFor(m, latest.period, targets[m.id]);
  return { period: latest.period, value: latest.value, previous, pending, target: { min: t.min === null ? null : Number(t.min), max: t.max === null ? null : Number(t.max), value: t.value === null ? null : Number(t.value) } };
}

/** The set of Metrics a person sees now, read once per call and person. */
async function seen(ctx: Ctx, person: string): Promise<Set<number>> {
  if (!ctx.seeing.has(person)) ctx.seeing.set(person, await visibleMetricIds(ctx.ws, person, ctx.metrics));
  return ctx.seeing.get(person)!;
}

/** Pauses an Alert whose person cannot see its Metric, with no message: it is only a bookkeeping state. */
async function pauseNoAccess(ws: string, a: Row) {
  if (a.paused === "no_access") return;
  await db().from("alerts").update({ paused: "no_access", no_access_since: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", a.id).eq("workspace_id", ws);
}

/** One Alert against one view: sight first, then the rules, then the claim and the message. */
async function handle(ctx: Ctx, m: Metric, a: Row, view: View, imported: boolean): Promise<void> {
  if (!validCondition(alertConditionOf(a))) return;
  // Without sight of the Metric the Alert says and sends nothing.
  if (!(await seen(ctx, a.person_id)).has(m.id)) return pauseNoAccess(ctx.ws, a);
  let silent = imported;
  if (a.paused === "no_access") {
    // Sight came back: the Alert resumes by being brought up to date silently, as after an Import.
    await db().from("alerts").update({ paused: null, no_access_since: null, updated_at: new Date().toISOString() }).eq("id", a.id).eq("workspace_id", ctx.ws);
    silent = true;
  }
  // A value that waits for Approval is not seen unless the person asked for it: nothing changes until it is approved.
  if (view.value !== null && !valueCounts(view.pending ? "pending" : "published", a.include_unapproved)) return;
  const c = alertConditionOf(a)!;
  const holds = alertHolds(c, { metric: m, workspaceMethod: ctx.method, value: view.value, previous: view.previous, target: view.target, today: view.today, dueDate: view.due });
  const was = { state: a.state, firedPeriod: a.fired_period };
  const step = alertStep(a.kind, was, holds, view.period, silent);
  if (step.fire) {
    // Claimed before it is sent: only the call that changed the row sends.
    const { data: claimed } = await db().rpc("claim_alert_fire", { p_id: a.id, p_ws: ctx.ws, p_period: view.period, p_per_period: isPerPeriod(a.kind) });
    if (claimed === true) await send(ctx, m, a, c, view);
  } else if (step.next.state !== was.state || step.next.firedPeriod !== was.firedPeriod) {
    await db().from("alerts").update({ state: step.next.state, fired_period: step.next.firedPeriod, updated_at: new Date().toISOString() }).eq("id", a.id).eq("workspace_id", ctx.ws).eq("state", was.state);
  }
}

/** The condition an Alert row holds, or null when it does not open. */
export function alertConditionOf(a: { kind: AlertKind; level: string | null }): AlertCondition | null {
  const c = a.kind === "at_or_above" || a.kind === "below" ? { kind: a.kind, value: a.level } : a.kind === "share_of_target" || a.kind === "changed_more" ? { kind: a.kind, share: a.level } : { kind: a.kind };
  return validCondition(c) ? c : null;
}

/** Sends the message of a fired Alert, if the person may still see the Metric and the day's limits allow. An Alert
 * over a limit has fired all the same: it shows as fired in the list, without a Delivery. */
async function send(ctx: Ctx, m: Metric, a: Row, c: AlertCondition, view: View): Promise<void> {
  // The moment of sending (AGENTS.md rule 3): sight is asked again, not taken from the earlier check, so a message
  // that leaves is always one the person could have opened.
  const sees = (await visibleMetricIds(ctx.ws, a.person_id, ctx.metrics)).has(m.id);
  if (!sees) return pauseNoAccess(ctx.ws, a);
  // The person's own Personal Webhooks named on the Alert hear the crossing too (spec 0037): their own count and caps, so
  // the day's Alert messages do not stand in their way. The send judges the Alert and the person's sight again.
  if (a.webhook_ids?.length && c.kind !== "missing_after_due") await queueAlertFiredToPersonal(ctx.ws, { id: a.id, personId: a.person_id, webhookIds: a.webhook_ids, metricId: m.id, period: view.period });
  const { data: claim } = await db().rpc("claim_alert_message", { p_ws: ctx.ws, p_person: a.person_id, p_day: new Date().toISOString().slice(0, 10), p_per_person: await effectiveLimit("alertMessagesPerPerson", ctx.ws, a.person_id), p_per_workspace: await sendingLimit("alertMessagesPerWorkspace") });
  if (claim !== "send" && claim !== "note") return;
  const yearStart = await yearStartFor(ctx.ws, m.period);
  const text = claim === "note" ? ALERT_LIMIT_NOTE : alertText(m, c, view, ctx, yearStart);
  // The daily note names no Metric and is not checked for sight when it is sent, so it links to the list only.
  const link = claim === "note" ? "/settings/alerts" : `/metrics/${encodeURIComponent(m.slug)}`;
  await deliverAlert(ctx.ws, { recipientId: a.person_id, subject: claim === "note" ? "More Alerts fired today" : `Alert: ${m.name}`, text, link, via: a.delivery === "usual" ? undefined : a.delivery, metricId: claim === "note" ? null : m.id, alertId: claim === "note" ? null : a.id });
}

/** "week of 9 Nov 2026" inside a sentence. */
const mid = (label: string) => label.replace(/^Week of/, "week of");

/** What an Alert's message says (spec 0032, "What an Alert message says"): the Metric's name, period, value, target and
 * change as its page shows them, in the Workspace's number style, nothing of any other Metric. Pure. */
export function alertText(m: Pick<Metric, "name" | "period" | "format" | "decimals" | "unit" | "unit_position" | "polarity" | "attainment_method">, c: AlertCondition, v: Pick<View, "period" | "value" | "previous" | "pending" | "target" | "due">, ctx: { style: NumberStyle; method: AttainmentMethod }, yearStart: YearStart): string {
  const at = (n: number | string | null) => formatValue(m, n === null ? null : Number(n), ctx.style);
  const when = mid(periodLabel(v.period, m.period, yearStart));
  const unapproved = v.pending ? " Not approved yet." : "";
  switch (c.kind) {
    case "missing_after_due":
      return `No value yet for ${m.name}, ${when}. It was due on ${v.due ? format(parseISO(v.due), "d MMMM") : "its Due Date"}.`;
    case "share_of_target": {
      const pct = attainment(m as Metric, Number(v.value), v.target, ctx.method);
      return `${m.name} reached ${pct === null ? c.share + " %" : attainmentText(pct, ctx.style)} of its target: ${at(v.value)}${v.target.value === null ? "" : ` of ${at(v.target.value)}`} for ${when}.${unapproved}`;
    }
    case "at_or_above": return `${m.name} reached ${at(c.value)}: ${at(v.value)} for ${when}.${unapproved}`;
    case "below": return `${m.name} fell below ${at(c.value)}: ${at(v.value)} for ${when}.${unapproved}`;
    case "changed_more": {
      const before = mid(periodLabel(shiftPeriod(v.period, m.period, -1), m.period, yearStart));
      const pct = v.previous === null || v.value === null ? null : changePct(Number(v.value), Number(v.previous));
      const how = pct === null || !Number.isFinite(pct) ? `changed from ${at(v.previous)} to ${at(v.value)}` : `${pct >= 0 ? "up" : "down"} ${formatChange(Math.abs(pct), ctx.style, { signed: false })}`;
      return `${m.name} changed more than ${formatChange(Number(c.share), ctx.style, { signed: false })}: ${how} on ${before}.${unapproved}`;
    }
  }
}
