// The First Metric step of the Setup Guide (spec 0052, ticket 9; GLOSSARY: Setup Guide, Prompt, Submitter, Quiet Hours,
// Source, Test Metric). One Metric is tried both ways: Ziffr asks the viewer for it where they chose to be asked (out),
// and a value comes back through the form link, a paste or an answer to the Prompt (in). The step ticks from state
// (first-metric-loop.ts, read by setup-guide.ts too); this file reads what the step shows, asks, and answers the polling.
// Visibility is the product: only Owners and Admins have the step; everything returned is the viewer's own Delivery, own
// address, own form code and own value, plus the Metric they may see. Nothing of anyone else is returned, and the demo
// and a Guest are refused. A form code goes to the browser only once the viewer has asked.
import { Forbidden, type Actor } from "./actor";
import { addSubmitters } from "./metrics";
import { askMeNowBy, canAskNow, shownReason, type AskNowResult } from "./ask-now";
import { CONNECTORS } from "./connectors/index";
import type { ConnectorId } from "./connectors/types";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { holdFor, quietHours } from "./quiet-hours";
import { loopOf, IN_SOURCES } from "./first-metric-loop";
import { formatValue } from "./format";
import { yearStartOf } from "./fiscal-year";
import { periodLabel } from "./periods";
import { openNames, openOne, openRows } from "./sealed-columns";
import { recordOwnValue } from "./record-own-value";
import { canSee } from "./sharing";
import { setSetupFirstMetric, startSetupGuide } from "./setup-guide";
import { DEMO_WORKSPACE_ID } from "./team";
import { trialEndsAt } from "./trials";
import { whatWorksHere } from "./what-works-here";
import { numberStyleOf } from "./workspace-settings";
import { workspaceClock } from "./workspace-clock";
import { getMetrics } from "./workspace-data";
import { cooldownWords, didntArrive, loopWorks, quietAfter, quietBefore, quietUntilWords, whatToLookFor, type Check } from "./first-metric-words";
import { waysInAndOut } from "./ways-in-and-out";

/** How many Metrics "Another Metric" lists at most. */
const MAX_CHOICES = 50;
/** How long Ask me now makes a Metric wait before asking again, in milliseconds (the claim is made in the database). */
const COOLDOWN_MS = 10 * 60_000;

/** The Metric the step tries, as the viewer may see it. */
export type FirstMetricShown = {
  id: number; name: string; unit: string; slug: string;
  /** The Metric's owner is the viewer. */
  mine: boolean;
  /** The viewer is one of its Submitters themselves (Ask me now needs both). */
  submitting: boolean;
  /** The owner's name when someone else owns it, so the step can say who. */
  ownerName: string | null;
  /** Whether Ask me now is possible for the viewer: they own it and submit it. */
  canAsk: boolean;
};

/** A Prompt that was asked for, by which way and what became of it. */
export type FirstMetricAsked = { connector: ConnectorId; label: string; state: "sent" | "queued" | "outbox" | "failed"; held: boolean; note: string | null; at: string; look: string };

/** The value that came in, in the words of the Workspace. */
export type ArrivedValue = { value: string; period: string; source: string; at: string };

/** What the step shows the viewer. */
export type FirstMetricStep = {
  metric: FirstMetricShown | null;
  /** The Metrics the viewer owns and may try instead. */
  choices: { id: number; name: string }[];
  trial: boolean;
  /** The ways the viewer will be asked by, in their order (empty: the first way that reaches them). */
  ways: { connector: ConnectorId; label: string }[];
  asked: FirstMetricAsked[];
  /** The viewer's own form link code for the Metric, once they have asked; never before. */
  formCode: string | null;
  /** The words before asking while in Quiet Hours, or null. */
  quietBefore: string | null;
  /** The time Ask me now may be pressed again, as words, or null when it may be pressed now. */
  cooldown: string | null;
  out: boolean;
  in: boolean;
  value: ArrivedValue | null;
  /** "MRR for November 2026: 48,200 EUR, by email reply. The loop works." once both halves happened, else null. */
  works: string | null;
  checks: Check[];
};

/** What the polling reads: only the viewer's own state, never values of others. */
export type FirstMetricProgress = { out: boolean; in: boolean; value: ArrivedValue | null; works: string | null };

function assertStep(actor: Actor): void {
  if (actor.key) throw new Forbidden();
  refuseInDemo(actor);
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins try the First Metric.");
}

async function guideRow(actor: Actor): Promise<{ firstMetricId: number | null; startedAt: string } | null> {
  const { data } = await db().from("setup_guides").select("first_metric_id, started_at").eq("workspace_id", actor.workspaceId).maybeSingle();
  return data ? { firstMetricId: (data.first_metric_id as number | null) ?? null, startedAt: data.started_at as string } : null;
}

/** In a trial the Test Metric is the First Metric until the person picks another: written once, when the guide has none. */
async function adoptTestMetric(actor: Actor): Promise<void> {
  if (!(await trialEndsAt(actor.workspaceId))) return;
  const { data: ws } = await db().from("workspaces").select("trial_test_metric_id").eq("id", actor.workspaceId).single();
  const id = ws?.trial_test_metric_id as number | null | undefined;
  if (!id) return;
  await startSetupGuide(actor);
  await db().from("setup_guides").update({ first_metric_id: id, updated_at: new Date().toISOString() }).eq("workspace_id", actor.workspaceId).is("first_metric_id", null);
}

async function shownMetric(actor: Actor, id: number | null): Promise<FirstMetricShown | null> {
  if (id === null || !(await canSee(actor, "metric", id))) return null;
  const { data } = await db().from("metrics").select("id, name, unit, slug, owner_id, formula, archived_at").eq("id", id).eq("workspace_id", actor.workspaceId).is("archived_at", null).maybeSingle();
  const m = await openOne("metrics", actor.workspaceId, data);
  if (!m) return null;
  const mine = m.owner_id === actor.personId;
  let ownerName: string | null = null;
  if (!mine) {
    const { data: o } = await db().from("profiles").select("id, name").eq("id", m.owner_id as string).maybeSingle();
    ownerName = ((await openNames(actor.workspaceId, o ? [o] : []))[0]?.name as string | undefined) ?? null;
  }
  const submitting = Boolean(m.formula) ? false : Boolean((await db().from("tokens").select("id").eq("metric_id", id).eq("submitter_id", actor.personId).is("stands_in_for", null).maybeSingle()).data);
  return { id, name: m.name as string, unit: (m.unit as string | null) ?? "", slug: m.slug as string, mine, submitting, ownerName, canAsk: await canAskNow(actor, id) };
}

// The viewer's newest Prompts for the Metric, one per way, and what became of each. Their own rows only.
async function askedFor(actor: Actor, metric: FirstMetricShown, ctx: { email: string | null; repliesByEmail: boolean }): Promise<FirstMetricAsked[]> {
  const { data: prompts } = await db().from("prompts").select("id").eq("workspace_id", actor.workspaceId).eq("metric_id", metric.id).eq("submitter_id", actor.personId).order("id", { ascending: false }).limit(10);
  const ids = (prompts ?? []).map((p) => p.id as number);
  if (!ids.length) return [];
  const { data } = await db().from("deliveries").select("connector, mail_state, last_error, not_before, created_at").eq("workspace_id", actor.workspaceId).eq("recipient_id", actor.personId).eq("kind", "prompt").in("prompt_id", ids).order("id", { ascending: false }).limit(10);
  const seen = new Set<string>();
  const out: FirstMetricAsked[] = [];
  for (const d of data ?? []) {
    const connector = d.connector as ConnectorId;
    if (seen.has(connector) || !CONNECTORS[connector]) continue;
    seen.add(connector);
    const state = (["sent", "queued", "outbox", "failed"].includes(d.mail_state as string) ? d.mail_state : "outbox") as FirstMetricAsked["state"];
    const held = state === "queued" && Boolean(d.not_before) && new Date(d.not_before as string).getTime() > Date.now();
    out.push({ connector, label: CONNECTORS[connector].label, state, held, note: shownReason(d.last_error as string | null), at: d.created_at as string, look: whatToLookFor(connector, { metric: metric.name, ...ctx }) });
  }
  return out;
}

// The latest value the viewer submitted for the Metric through a Source since the guide began, in the Workspace's words.
async function arrivedValue(actor: Actor, metricId: number, since: string): Promise<{ arrived: ArrivedValue; metricName: string } | null> {
  const { data: o } = await db().from("observations").select("id, value, value_sealed, period_start, source, created_at").eq("workspace_id", actor.workspaceId).eq("metric_id", metricId).eq("submitter_id", actor.personId).in("source", [...IN_SOURCES]).gte("created_at", since).order("id", { ascending: false }).limit(1).maybeSingle();
  if (!o) return null;
  const [opened] = await openRows("observations", actor.workspaceId, [o as Record<string, unknown>]);
  // A value that does not open reads as none yet, never as 0.
  if (typeof opened?.value !== "number") return null;
  const { data: mrow } = await db().from("metrics").select("*").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  const m = await openOne("metrics", actor.workspaceId, mrow);
  if (!m) return null;
  const ys = m.period === "quarter" || m.period === "year" ? await yearStartOf(actor.workspaceId) : 1;
  const style = await numberStyleOf(actor.workspaceId);
  return { arrived: { value: formatValue(m as never, opened.value, style), period: periodLabel(o.period_start as string, m.period as never, ys as never), source: o.source as string, at: o.created_at as string }, metricName: m.name as string };
}

/** The step for the actor (an Owner or Admin): the Metric, who may ask, where the Prompt went, what to look for, the
 * Quiet Hours and the wait before asking again, and the value once it came. In a trial the Test Metric is the Metric
 * until another is picked. */
export async function firstMetricStep(actor: Actor): Promise<FirstMetricStep> {
  assertStep(actor);
  await startSetupGuide(actor);
  await adoptTestMetric(actor);
  const guide = await guideRow(actor);
  const ws = actor.workspaceId;
  const metric = await shownMetric(actor, guide?.firstMetricId ?? null);
  const [trial, clock, quiet, here, wi, me, metrics] = await Promise.all([
    trialEndsAt(ws), workspaceClock(actor), quietHours(actor), whatWorksHere(actor), waysInAndOut(actor),
    db().from("profiles").select("email").eq("id", actor.personId).single(),
    getMetrics(ws),
  ]);
  const state = (w: string) => here.find((x) => x.way === w)?.state;
  const email = (me.data?.email as string | null) ?? null;
  const repliesByEmail = state("email-replies") === "real";
  const rule = quiet.mine ?? quiet.workspace;
  const zone = rule?.timeZone ?? quiet.workspaceTimeZone ?? clock.timeZone;
  const now = new Date();
  const hold = metric ? await holdFor(ws, actor.personId, "prompt", now) : null;
  const heldUntil = hold ? quietUntilWords(hold, now, zone) : null;
  const claim = metric ? (await db().from("ask_now_claims").select("asked_at").eq("metric_id", metric.id).maybeSingle()).data : null;
  const againAt = claim ? new Date(new Date(claim.asked_at as string).getTime() + COOLDOWN_MS) : null;
  const asked = metric ? await askedFor(actor, metric, { email, repliesByEmail }) : [];
  const loop = metric && guide ? await loopOf(ws, actor.personId, metric.id, guide.startedAt) : { promptOut: false, valueIn: false };
  const got = metric && guide && loop.valueIn ? await arrivedValue(actor, metric.id, guide.startedAt) : null;
  const formCode = metric && asked.length ? ((await db().from("tokens").select("code").eq("metric_id", metric.id).eq("submitter_id", actor.personId).is("stands_in_for", null).maybeSingle()).data?.code as string | undefined) ?? null : null;
  const choices = metrics.filter((m) => m.owner_id === actor.personId && !m.formula && !m.archived_at).slice(0, MAX_CHOICES).map((m) => ({ id: m.id, name: m.name }));
  const ways = wi.askedBy.map((c) => ({ connector: c as ConnectorId, label: CONNECTORS[c as ConnectorId].label }));
  const wentBy = asked.length ? asked.map((a) => a.connector) : ways.map((w) => w.connector);
  return {
    metric, choices, trial: Boolean(trial), ways, asked, formCode,
    quietBefore: heldUntil ? quietBefore(heldUntil) : null,
    cooldown: againAt && againAt.getTime() > now.getTime() ? cooldownWords(againAt.toISOString(), now, zone) : null,
    out: loop.promptOut, in: loop.valueIn,
    value: got?.arrived ?? null,
    works: got && loop.promptOut ? loopWorks({ metric: got.metricName, period: got.arrived.period, value: got.arrived.value, source: got.arrived.source }) : null,
    checks: didntArrive({ ways: wentBy.length ? wentBy : ["email"], mailReal: state("email") === "real", quietUntil: heldUntil, repliesByEmail, email }),
  };
}

/** The polling read: whether the viewer was asked and whether a value of theirs came in, since the guide began, for the
 * guide's Metric. Only the viewer's own rows; cheap enough to ask every few seconds. */
export async function setupFirstValue(actor: Actor): Promise<FirstMetricProgress> {
  // The demo has no guide: nothing to read, and nothing to leak.
  if (actor.workspaceId === DEMO_WORKSPACE_ID && !actor.key) return { out: false, in: false, value: null, works: null };
  assertStep(actor);
  const guide = await guideRow(actor);
  if (!guide?.firstMetricId || !(await canSee(actor, "metric", guide.firstMetricId))) return { out: false, in: false, value: null, works: null };
  const loop = await loopOf(actor.workspaceId, actor.personId, guide.firstMetricId, guide.startedAt);
  const got = loop.valueIn ? await arrivedValue(actor, guide.firstMetricId, guide.startedAt) : null;
  return { out: loop.promptOut, in: loop.valueIn, value: got?.arrived ?? null, works: got && loop.promptOut ? loopWorks({ metric: got.metricName, period: got.arrived.period, value: got.arrived.value, source: got.arrived.source }) : null };
}

/** What asking gave: one result per way, whether the Prompt waits for the viewer's Quiet Hours, and their own form link
 * code (the one every Prompt to them carries). */
export type FirstMetricAsk = { results: (AskNowResult & { look: string })[]; held: string | null; formCode: string | null };

/** Ask me now for the guide's Metric, by the viewer's own chosen ways (the first way that reaches them when they chose
 * none). Only when they own and submit it; the ten minutes between asks of Ask me now apply. */
export async function askForFirstMetric(actor: Actor): Promise<FirstMetricAsk> {
  assertStep(actor);
  const guide = await guideRow(actor);
  if (!guide?.firstMetricId) throw new Error("Choose a Metric to try first.");
  const id = guide.firstMetricId;
  const wi = await waysInAndOut(actor);
  const now = new Date();
  const [{ data: me }, here, quiet, clock] = await Promise.all([db().from("profiles").select("email").eq("id", actor.personId).single(), whatWorksHere(actor), quietHours(actor), workspaceClock(actor)]);
  const results = await askMeNowBy(actor, id, wi.askedBy as ConnectorId[]);
  const metric = await shownMetric(actor, id);
  const name = metric?.name ?? "it";
  const hold = await holdFor(actor.workspaceId, actor.personId, "prompt", now);
  const zone = (quiet.mine ?? quiet.workspace)?.timeZone ?? quiet.workspaceTimeZone ?? clock.timeZone;
  const { data: token } = await db().from("tokens").select("code").eq("metric_id", id).eq("submitter_id", actor.personId).is("stands_in_for", null).maybeSingle();
  return {
    results: results.map((r) => ({ ...r, look: whatToLookFor(r.connector, { metric: name, email: (me?.email as string | null) ?? null, repliesByEmail: here.find((x) => x.way === "email-replies")?.state === "real" }) })),
    held: hold ? quietAfter(quietUntilWords(hold, now, zone)) : null,
    // The viewer's own code, and only when at least one way was really asked.
    formCode: results.some((r) => r.state !== "failed") ? ((token?.code as string | undefined) ?? null) : null,
  };
}

/** "Ask me for it": the viewer, who owns the guide's Metric but does not submit it, becomes one of its Submitters through
 * the one operation that adds Submitters (audited and versioned as any change of Submitters). Refused for a Metric
 * someone else owns. */
export async function askMeForFirstMetric(actor: Actor): Promise<void> {
  assertStep(actor);
  const guide = await guideRow(actor);
  if (!guide?.firstMetricId) throw new Error("Choose a Metric to try first.");
  const { data: m } = await db().from("metrics").select("owner_id").eq("id", guide.firstMetricId).eq("workspace_id", actor.workspaceId).is("archived_at", null).maybeSingle();
  if (!m || m.owner_id !== actor.personId) throw new Forbidden("Only a Metric’s owner can ask to be asked for it.");
  await addSubmitters(actor, guide.firstMetricId, [actor.personId]);
}

/** Picks another Metric to try: one the viewer owns and may ask for (not Derived, not archived). */
export async function pickFirstMetric(actor: Actor, metricId: unknown): Promise<void> {
  assertStep(actor);
  if (typeof metricId !== "number" || !Number.isSafeInteger(metricId) || metricId <= 0) throw new Forbidden();
  const { data: m } = await db().from("metrics").select("owner_id, formula, archived_at").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || m.owner_id !== actor.personId || m.formula || m.archived_at) throw new Forbidden("Pick one of your own Metrics that takes values.");
  await setSetupFirstMetric(actor, metricId);
}

/** Sends a value for the guide's Metric from the step, through the web form's own intake (the viewer's own Token, the
 * Submission Rule, Locks and Retention all apply). The Metric is the guide's, never one a browser names; the answer is
 * the intake's own words. */
export async function sendFirstMetricValue(actor: Actor, text: string): Promise<{ ok: boolean; detail: string }> {
  assertStep(actor);
  const guide = await guideRow(actor);
  if (!guide?.firstMetricId) throw new Error("Choose a Metric to try first.");
  const r = await recordOwnValue(actor, guide.firstMetricId, { value: String(text ?? "") });
  return { ok: r.ok, detail: r.detail };
}
