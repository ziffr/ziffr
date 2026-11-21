// Sending to Webhooks (GLOSSARY: Webhook; spec 0034, ticket #400): the deliveries job takes the sends that are due,
// builds each message from the facts of that moment, signs it and posts it, and keeps the log. A send is never a
// Delivery and never in the Outbox. SECURITY: the only way out is `outboundRequest` (https, a checked and pinned
// address, no redirect, a deadline, a cut answer), judged again at every send; the message holds only what the Webhook may
// hear now (webhookMayHear: nothing, the structure, or all); the secret signs the timestamp and the body and never
// leaves; the answer's body is read to a small size, thrown away and never stored; the log holds only a status code and
// a word from a fixed list. A failing Webhook never fails the change that made the send: those rows were written after it.
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { deliverNotice, linkTo, refFor } from "./deliveries";
import { operatorPrivateHosts, outboundRequest, outboundUrlProblem } from "./outbound-request";
import { openNames, openRows } from "./sealed-columns";
import { metricSeenByEveryone, webhookMayHear } from "./visibility";
import { buildActionMessage, buildAlertFiredMessage, buildPingMessage, buildValueUnusualMessage, type ActionFacts, type MessageEnvelope, type PersonFacts, type WebhookMessage } from "./webhook-messages";
import { WEBHOOK_DAYS_FAILING_BEFORE_OFF, WEBHOOK_FAILURES_BEFORE_OFF, WEBHOOK_LOG_DAYS, WEBHOOK_MESSAGE_MAX_BYTES, WEBHOOK_RETRY_AFTER_MAX_MS, WEBHOOK_RETRY_WAITS_MS, WEBHOOK_SEND_CONCURRENCY, WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY } from "./webhook-limits";
import { maskedHost } from "./webhooks";
import { alertContext, viewAt } from "./alert-firing";
import { alertHolds } from "./alert-rules";
import { tellCondition, type TellStep } from "./tell-firing";
import { formatValue } from "./format";
import type { DoneReason } from "./webhook-events";

/** One row of `webhook_sends` as the job reads it. */
type Send = {
  id: string; workspace_id: string; webhook_id: string; type: string; action_id: number | null; thread_message_id: number | null; metric_id: number | null;
  period_start: string | null; workflow_id: number | null; tell_step_id: string | null; source_type: string; source_webhook_id: string | null; reason: DoneReason | null; attempts: number; created_at: string;
};

/** What became of one send, for the log and for the job's counts. */
type Outcome = { state: "delivered" | "failed" | "retrying" | "dropped" | "deferred"; code?: number; failure?: string; waitMs?: number };

/** The signature header for a body: `sha256=<hex>` of the HMAC-SHA256 of `<timestamp>.<body>` with each secret, the new
 * one first, comma-separated (during the 24 hours a replaced secret still signs, so a receiver switches without a gap). */
export function signWebhookBody(secrets: readonly string[], timestamp: number, body: string): string {
  return secrets.map((s) => `sha256=${createHmac("sha256", s).update(`${timestamp}.${body}`).digest("hex")}`).join(",");
}

/** Whether a request is signed by one of the secrets (a receiver's check, and the inbound route's later): the timestamp
 * within `windowSeconds` of now, and some signature in the header equal to the expected one, compared in constant time.
 * A missing, malformed or short signature is refused. */
export function verifyWebhookSignature(secrets: readonly string[], timestamp: string | null, body: string, header: string | null, nowSeconds = Math.floor(Date.now() / 1000), windowSeconds = 300): boolean {
  if (!timestamp || !header || !/^\d{1,12}$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > windowSeconds) return false;
  const given = header.split(",").map((h) => h.trim()).filter((h) => /^sha256=[0-9a-f]{64}$/.test(h));
  let ok = false;
  for (const secret of secrets) {
    const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`);
    for (const g of given) if (g.length === expected.length && timingSafeEqual(Buffer.from(g), expected)) ok = true;
  }
  return ok;
}

/** How long to wait before the next try after `attempts` tries, or null when the send has failed: the schedule, and a
 * `Retry-After` (seconds or a date) honoured up to an hour when it asks for longer than the schedule. */
export function retryWaitMs(attempts: number, retryAfter?: string, now = Date.now()): number | null {
  const base = WEBHOOK_RETRY_WAITS_MS[attempts - 1];
  if (base === undefined) return null;
  let asked = 0;
  if (retryAfter) {
    const seconds = /^\d{1,9}$/.test(retryAfter.trim()) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now;
    if (Number.isFinite(seconds) && seconds > 0) asked = Math.min(seconds, WEBHOOK_RETRY_AFTER_MAX_MS);
  }
  return Math.max(base, asked);
}

/** Whether the Metric is shared with the Everyone Group now: the Groups and the Metric's Shares, as stored. */
async function seenByEveryone(ws: string, metricId: number): Promise<boolean> {
  const [{ data: groups }, { data: shares }] = await Promise.all([
    db().from("groups").select("id, name, everyone").eq("workspace_id", ws).eq("everyone", true),
    db().from("shares").select("id, object_type, object_id, user_id, role, group_id").eq("workspace_id", ws).eq("object_type", "metric").eq("object_id", metricId).not("group_id", "is", null),
  ]);
  const inWs = <T extends object>(rows: T[] | null) => (rows ?? []).map((r) => ({ ...r, workspace_id: ws }));
  return metricSeenByEveryone(ws, metricId, inWs(groups as never[]).map((g) => ({ ...(g as object), members: [] })) as never, inWs(shares as never[]) as never);
}

/** An Approval or Self-check names the pending value and why it is unusual in its title, which `value.unusual` leaves out on purpose: a fixed title goes out instead. */
const systemTitle = (purpose: unknown) => purpose === "approval" ? "Approve a value" : purpose === "self_check" ? "Check a value" : null;

/** `alert.fired`, built now from what the Tell step says and the value as it counts now (spec 0034): null, so nothing is
 * sent, when the step is gone or no longer names this Webhook, when the value no longer counts (sent back, or waiting for
 * Approval: a Tell step never tells an unapproved value) or when the Metric is archived or Derived. */
async function alertFired(send: Send, env: Omit<MessageEnvelope, "replyText">, metric: { id: number; name: string }, period: string): Promise<{ full: WebhookMessage; redacted: null } | null> {
  const ws = send.workspace_id;
  if (send.workflow_id === null || !send.tell_step_id || !period) return null;
  const { data: wf } = await db().from("workflows").select("config, owner_id").eq("id", send.workflow_id).eq("workspace_id", ws).maybeSingle();
  // Only an Owner or Admin names a Webhook: a Workflow whose owner no longer is one tells none until someone who is saves it again.
  const { data: owner } = wf ? await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", wf.owner_id as string).maybeSingle() : { data: null };
  if (owner?.role !== "owner" && owner?.role !== "admin") return null;
  const step = ((wf?.config as { steps?: TellStep[] } | null)?.steps ?? []).find((s) => s.type === "tell" && s.id === send.tell_step_id);
  const c = step ? tellCondition(step) : null;
  if (!step || !c || c.kind === "missing_after_due" || !step.webhooks?.includes(send.webhook_id)) return null;
  const ctx = await alertContext(ws);
  const m = ctx.metrics.find((x) => x.id === metric.id);
  if (!m || m.archived_at || m.formula) return null;
  const view = await viewAt(ctx, m, period);
  if (!view || view.pending || view.value === null) return null;
  // The Metric must still be on the Workflow whose step fired, and the step's condition must still be true of that value:
  // a value corrected, or a level edited, since it was queued is not announced as a crossing.
  if ((await db().from("metrics").select("workflow_id").eq("id", m.id).eq("workspace_id", ws).maybeSingle()).data?.workflow_id !== send.workflow_id) return null;
  if (!alertHolds(c, { metric: m, workspaceMethod: ctx.method, value: view.value, previous: view.previous, target: view.target })) return null;
  const at = (n: number | string | null) => (n === null ? null : formatValue(m, Number(n), ctx.style));
  const level = c.kind === "at_or_above" || c.kind === "below" ? c.value : c.share;
  return { full: buildAlertFiredMessage({ metric, period, value: at(view.value) ?? "", target: at(view.target.value), condition: { kind: c.kind, level }, link: linkTo(`/metrics/${metric.id}`) }, env), redacted: null };
}

/** The message for one send as the Webhook may hear it now, or null when it may hear nothing (or the thing is gone). */
async function buildMessage(send: Send, webhookName: string): Promise<{ full: WebhookMessage; redacted: WebhookMessage | null } | null> {
  const eventId = `evt_${send.id.replace(/-/g, "")}`;
  const createdAt = new Date(send.created_at).toISOString();
  if (send.type === "ping") { const m = buildPingMessage(webhookName, { eventId, createdAt }); return { full: m, redacted: null }; }
  const ws = send.workspace_id;
  const source = send.source_type === "webhook" && send.source_webhook_id ? { type: "webhook" as const, webhookId: send.source_webhook_id } : { type: send.source_type as Exclude<MessageEnvelope["source"]["type"], "webhook"> };
  const env: Omit<MessageEnvelope, "replyText"> = { eventId, createdAt, workspaceId: ws, source, reason: send.reason, externalIds: [] };
  let metricId = send.metric_id;
  let action: Record<string, unknown> | null = null;
  if (send.action_id !== null) {
    const { data } = await db().from("actions").select("id, kind, status, purpose, question, due_date, metric_id, period_start, asker_id, assignee_id, read_group_id, updated_at, workspace_id").eq("id", send.action_id).eq("workspace_id", ws).maybeSingle();
    if (!data) return null;
    [action] = await openRows("actions", ws, [data as Record<string, unknown>]);
    metricId = action.metric_id as number;
  }
  if (metricId === null) return null;
  const { data: metric } = await db().from("metrics").select("id, name").eq("id", metricId).eq("workspace_id", ws).maybeSingle();
  if (!metric) return null;
  const everyone = await seenByEveryone(ws, metric.id as number);
  const hearing = webhookMayHear(ws, send.type, { workspace_id: ws, metricSeenByEveryone: everyone, readGroupId: (action?.read_group_id as number | null | undefined) ?? null });
  if (hearing === "none") return null;
  const metricFacts = { id: metric.id as number, name: String(metric.name) };
  const period = String(send.period_start ?? action?.period_start ?? "");
  if (!action && send.type === "alert.fired") return alertFired(send, env, metricFacts, period);
  if (!action) {
    const link = linkTo(`/metrics/${metric.id}`);
    if (send.type === "value.unusual") return { full: buildValueUnusualMessage({ metric: metricFacts, period, link }, env), redacted: null };
    // `value.recorded` is not queued yet (it needs the value at the moment it counts); none is sent without one.
    return null;
  }
  const ids = [String(action.asker_id), String(action.assignee_id)];
  const [{ data: profiles }, { data: contacts }, reply] = await Promise.all([
    db().from("profiles").select("id, name, email").in("id", ids),
    db().from("contacts").select("person_id, email").eq("workspace_id", ws).in("person_id", ids),
    send.thread_message_id !== null ? db().from("thread_messages").select("id, body").eq("id", send.thread_message_id).eq("action_id", send.action_id as number).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const people = await openNames(ws, profiles ?? []);
  const [contactRows] = [await openRows("contacts", ws, (contacts ?? []) as Record<string, unknown>[])];
  const who = (id: string): PersonFacts => {
    const p = people.find((x) => x.id === id);
    const c = contactRows.find((x) => x.person_id === id);
    return { id, name: String(p?.name ?? ""), email: (c?.email as string | null | undefined) ?? ((p as { email?: string | null } | undefined)?.email ?? null) };
  };
  const [openedReply] = reply.data ? await openRows("thread_messages", ws, [reply.data as Record<string, unknown>]) : [];
  const facts: ActionFacts = {
    ref: refFor(action.id as number), kind: action.kind as ActionFacts["kind"], status: action.status as ActionFacts["status"], title: systemTitle(action.purpose) ?? String(action.question ?? ""), due: (action.due_date as string | null) ?? null,
    metric: metricFacts, period, assignee: who(String(action.assignee_id)), askerName: who(String(action.asker_id)).name, link: linkTo(`/actions/${action.id}`), updatedAt: new Date(String(action.updated_at)).toISOString(),
  };
  const withReply = { ...env, replyText: typeof openedReply?.body === "string" ? openedReply.body : null };
  const type = send.type as "action.created" | "action.updated" | "action.answered" | "action.done";
  return { full: buildActionMessage(type, hearing, facts, withReply), redacted: buildActionMessage(type, "redacted", facts, withReply) };
}

/** Tells every Owner that a Webhook was switched off and why, once, through their own Connector. The address is masked
 * as everywhere a notice leaves as email. */
async function tellOwnersSwitchedOff(ws: string, name: string, address: string, reason: "failing" | "gone"): Promise<void> {
  try {
    const { data } = await db().from("memberships").select("user_id").eq("workspace_id", ws).eq("role", "owner");
    const why = reason === "gone" ? "its address answered that it is gone (410)" : `it kept failing: ${WEBHOOK_FAILURES_BEFORE_OFF} sends in a row, or no success for ${WEBHOOK_DAYS_FAILING_BEFORE_OFF} days`;
    for (const o of data ?? []) await deliverNotice(ws, { recipientId: String(o.user_id), senderId: null, subject: `Webhook switched off: ${name}`, text: `The Webhook "${name}" (${address}) was switched off because ${why}. Nothing more is sent to it until you switch it on again; nothing is resent then.`, link: "/settings/webhooks" });
  } catch (e) {
    console.error("Webhooks: could not tell the Owners:", (e as Error).message);
  }
}

/** One send: the Webhook's current state, the message, the signed request, and the answer judged. */
async function sendOne(send: Send, dayCount: Map<string, number>): Promise<Outcome> {
  const ws = send.workspace_id;
  const { data } = await db().from("webhooks").select("id, name, url, secret, secret_previous, secret_previous_until, events, disabled_at").eq("id", send.webhook_id).eq("workspace_id", ws).maybeSingle();
  if (!data || data.disabled_at || (send.type !== "ping" && !((data.events as string[]) ?? []).includes(send.type))) return { state: "dropped" };
  const used = dayCount.get(ws) ?? 0;
  if (used >= WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY) return { state: "deferred" };
  const [hook] = await openRows("webhooks", ws, [data as Record<string, unknown>]);
  const url = typeof hook.url === "string" ? hook.url : "";
  const secret = typeof hook.secret === "string" && hook.secret.startsWith("whsec_") ? hook.secret : null;
  if (!secret) return { state: "failed", failure: "key" };
  const built = await buildMessage(send, String(hook.name));
  if (!built) return { state: "dropped" };
  let body = JSON.stringify(built.full);
  if (Buffer.byteLength(body) > WEBHOOK_MESSAGE_MAX_BYTES && built.redacted) body = JSON.stringify(built.redacted);
  if (Buffer.byteLength(body) > WEBHOOK_MESSAGE_MAX_BYTES) return { state: "failed", failure: "too_big" };
  // The address is judged again here, as when it was saved; `outboundRequest` judges every address it connects to.
  const privateHosts = operatorPrivateHosts();
  if (outboundUrlProblem(url, { privateHosts })) return { state: "failed", failure: "refused" };
  const secrets = [secret];
  if (hook.secret_previous_until && new Date(String(hook.secret_previous_until)).getTime() > Date.now() && typeof hook.secret_previous === "string" && hook.secret_previous.startsWith("whsec_")) secrets.push(hook.secret_previous);
  const timestamp = Math.floor(Date.now() / 1000);
  dayCount.set(ws, used + 1);
  try {
    const res = await outboundRequest(new URL(url), {
      method: "POST", body, maxBytes: 64 * 1024, privateHosts,
      headers: { "content-type": "application/json", "x-ziffr-timestamp": String(timestamp), "x-ziffr-signature": signWebhookBody(secrets, timestamp, body), "x-ziffr-event": send.type, "x-ziffr-delivery": built.full.id },
    });
    if (res.status >= 200 && res.status < 300) return { state: "delivered", code: res.status };
    if (res.status === 410) return { state: "failed", code: 410, failure: "gone" };
    if (res.status === 408 || res.status === 429 || res.status >= 500) {
      const waitMs = retryWaitMs(send.attempts + 1, res.retryAfter);
      return waitMs === null ? { state: "failed", code: res.status, failure: "status" } : { state: "retrying", code: res.status, failure: "status", waitMs };
    }
    return { state: "failed", code: res.status, failure: "status" };
  } catch (e) {
    const message = (e as Error).message;
    // A name that turned private (or never was allowed) is refused for good; any other trouble is the network's, tried again.
    if (/private address|https only|bad header/.test(message)) return { state: "failed", failure: "refused" };
    const waitMs = retryWaitMs(send.attempts + 1);
    const failure = message === "timeout" ? "timeout" : "network";
    return waitMs === null ? { state: "failed", failure } : { state: "retrying", failure, waitMs };
  }
}

/** Starts of the current UTC day, for the daily cap. */
const dayStart = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

/** One claimed send, sent and written into its row; a send that breaks is a network failure, never an exception. */
async function attemptSend(send: Send, dayCount: Map<string, number>): Promise<Outcome> {
  let outcome: Outcome;
  try { outcome = await sendOne(send, dayCount); } catch (e) { console.error("Webhooks: a send broke:", (e as Error).message); outcome = { state: "retrying", failure: "network", waitMs: retryWaitMs(send.attempts + 1) ?? undefined }; if (outcome.waitMs === undefined) outcome = { state: "failed", failure: "network" }; }
  await settle(send, outcome);
  return outcome;
}

/** Sends one queued message of one Workspace now, for the Webhooks page's test and Send again: claimed by the same
 * conditional update as the job's, so it is sent once, and no other Workspace's sends are touched. */
export async function sendWebhookNow(workspaceId: string, sendId: string): Promise<void> {
  const { data } = await db().from("webhook_sends").update({ state: "sending", claimed_at: new Date().toISOString() }).eq("id", sendId).eq("workspace_id", workspaceId).eq("state", "queued").select("*").maybeSingle();
  if (!data) return;
  const send = data as Send;
  const { count } = await db().from("webhook_sends").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("last_attempt_at", dayStart().toISOString());
  await attemptSend(send, new Map([[workspaceId, count ?? 0]]));
}

/** Sends the Webhook messages that are due, for the deliveries job: at most `limit`, each claimed once by a conditional
 * update, at most a few at a time (WEBHOOK_SEND_CONCURRENCY). Answers only counts. */
export async function sendWaitingWebhooks(limit = 50): Promise<{ sent: number; failed: number }> {
  // The log is kept 14 days.
  await db().from("webhook_sends").delete().in("state", ["delivered", "failed", "dropped"]).lt("created_at", new Date(Date.now() - WEBHOOK_LOG_DAYS * 86_400_000).toISOString());
  const { data: claimed, error } = await db().rpc("claim_webhook_sends", { p_limit: limit });
  if (error || !Array.isArray(claimed) || !claimed.length) return { sent: 0, failed: 0 };
  const sends = claimed as Send[];
  const dayCount = new Map<string, number>();
  for (const ws of new Set(sends.map((s) => s.workspace_id))) {
    const { count } = await db().from("webhook_sends").select("id", { count: "exact", head: true }).eq("workspace_id", ws).gte("last_attempt_at", dayStart().toISOString());
    dayCount.set(ws, count ?? 0);
  }
  let sent = 0;
  let failed = 0;
  const queue = [...sends];
  const worker = async () => {
    for (let send = queue.shift(); send; send = queue.shift()) {
      const outcome = await attemptSend(send, dayCount);
      if (outcome.state === "delivered") sent++;
      else if (outcome.state === "failed" || outcome.state === "retrying") failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(WEBHOOK_SEND_CONCURRENCY, sends.length) }, worker));
  return { sent, failed };
}

/** Writes what became of a send into its row, and what it means for the Webhook: a success clears its failures, a
 * failure counts towards switching it off (and tells the Owners once, when this call is the one that did). */
async function settle(send: Send, o: Outcome): Promise<void> {
  const now = new Date();
  const base = { attempts: send.attempts + (o.state === "dropped" || o.state === "deferred" ? 0 : 1), status_code: o.code ?? null, failure: o.failure ?? null, last_attempt_at: now.toISOString() };
  if (o.state === "dropped") await db().from("webhook_sends").update({ state: "dropped", claimed_at: null }).eq("id", send.id);
  else if (o.state === "deferred") await db().from("webhook_sends").update({ state: "queued", claimed_at: null, next_attempt_at: new Date(dayStart().getTime() + 86_400_000).toISOString() }).eq("id", send.id);
  else if (o.state === "delivered") await db().from("webhook_sends").update({ ...base, state: "delivered", delivered_at: now.toISOString(), claimed_at: null }).eq("id", send.id);
  else if (o.state === "retrying") await db().from("webhook_sends").update({ ...base, state: "retrying", claimed_at: null, next_attempt_at: new Date(now.getTime() + (o.waitMs ?? 0)).toISOString() }).eq("id", send.id);
  else await db().from("webhook_sends").update({ ...base, state: "failed", claimed_at: null }).eq("id", send.id);
  if (o.state === "dropped" || o.state === "deferred") return;
  if (o.state === "delivered") {
    await db().from("webhooks").update({ failing_since: null, failure_count: 0 }).eq("id", send.webhook_id).eq("workspace_id", send.workspace_id).or("failing_since.not.is.null,failure_count.gt.0");
    return;
  }
  // A refused address or a missing key is the Webhook's own state, not the receiver's failing: it fails the send and counts the same.
  let off: "failing" | "gone" | null = null;
  if (o.failure === "gone") { const { data } = await db().rpc("switch_off_webhook_gone", { p_id: send.webhook_id }); if (data === true) off = "gone"; }
  else {
    const { data } = await db().rpc("note_webhook_failure", { p_id: send.webhook_id, p_final: o.state === "failed", p_max: WEBHOOK_FAILURES_BEFORE_OFF, p_days: WEBHOOK_DAYS_FAILING_BEFORE_OFF });
    if (data === true) off = "failing";
  }
  if (off) {
    const { data } = await db().from("webhooks").select("name, url").eq("id", send.webhook_id).eq("workspace_id", send.workspace_id).maybeSingle();
    if (data) {
      const [opened] = await openRows("webhooks", send.workspace_id, [data as Record<string, unknown>]);
      await tellOwnersSwitchedOff(send.workspace_id, String(data.name), maskedHost(String(opened.url ?? "")), off);
    }
  }
}
