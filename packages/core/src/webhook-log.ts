// The log of a Webhook and its test and resend (GLOSSARY: Webhook; spec 0034, ticket #401). The log is the Webhook's
// own sends, kept 14 days (webhook-send.ts): what was sent when, how it ended, never a body or an address. Only
// Owners and Admins read it, and the Metric of a send is named by its number only: an Admin sees what was sent, not
// what a Metric is called. A test is a `ping` with nothing of the Workspace in it, at most one a minute; a resend
// puts a failed send back in the queue under the same event id, so the receiver can recognise it.
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { refFor } from "./deliveries";
import { audit } from "./audit-log";
import { webhookRules } from "./webhook-trial";
import { sendWebhookNow } from "./webhook-send";
import { daysNow } from "./keep-days";

/** One send as the page lists it. */
export type WebhookLogEntry = {
  id: string;
  type: string;
  /** The Action's reference, or "Metric 12", or null (a test). */
  about: string | null;
  at: string;
  state: "queued" | "sending" | "retrying" | "delivered" | "failed" | "dropped";
  statusCode: number | null;
  /** A word from a fixed list (timeout, network, refused, too_big, status, gone, key), never an answer. */
  failure: string | null;
  attempts: number;
};

/** The same words for a Webhook or send that is not there and one of another Workspace. */
const NOT_FOUND = "That Webhook was not found.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Refuses anyone but a signed-in Owner or Admin, and the demo. */
function assertReadsWebhookLog(actor: Actor): void {
  if (actor.key) throw new Forbidden("A key cannot manage Webhooks.");
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins manage Webhooks.");
  refuseInDemo(actor);
}

/** A trial whose Webhooks are switched off by the operator, or that has ended, sends nothing, whatever it holds. */
async function assertMaySend(actor: Actor): Promise<void> {
  const rules = await webhookRules(actor.workspaceId);
  if (!rules.allowed) throw new Forbidden(rules.why ?? "Webhooks are not possible here.");
}

/** The Webhook's id if it is one of this Workspace's, else the refusal that does not say whether it exists. */
async function ownWebhook(actor: Actor, id: unknown): Promise<{ id: string; name: string; disabled: boolean }> {
  if (typeof id !== "string" || !UUID.test(id)) throw new Forbidden(NOT_FOUND);
  const { data } = await db().from("webhooks").select("id, name, disabled_at").eq("id", id.toLowerCase()).eq("workspace_id", actor.workspaceId).is("owner_id", null).maybeSingle();
  if (!data) throw new Forbidden(NOT_FOUND);
  return { id: String(data.id), name: String(data.name), disabled: !!data.disabled_at };
}

/** The last sends of one Webhook, newest first, from the days the log is kept (14 unless set; Owners and Admins). */
export async function webhookLog(actor: Actor, webhookId: string, limit = 50): Promise<WebhookLogEntry[]> {
  assertReadsWebhookLog(actor);
  const hook = await ownWebhook(actor, webhookId);
  const n = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 50;
  const since = new Date(Date.now() - (await daysNow("ZIFFR_KEEP_WEBHOOK_LOG_DAYS")) * 86_400_000).toISOString();
  const { data } = await db().from("webhook_sends").select("id, type, action_id, metric_id, created_at, state, status_code, failure, attempts").eq("webhook_id", hook.id).eq("workspace_id", actor.workspaceId).gte("created_at", since).order("created_at", { ascending: false }).limit(n);
  return (data ?? []).map((r) => ({
    id: String(r.id), type: String(r.type), at: String(r.created_at), state: r.state as WebhookLogEntry["state"], statusCode: (r.status_code as number | null) ?? null,
    failure: (r.failure as string | null) ?? null, attempts: Number(r.attempts),
    about: r.action_id !== null ? refFor(Number(r.action_id)) : r.metric_id !== null ? `Metric ${r.metric_id}` : null,
  }));
}

/** Queues a `ping` for a Webhook and sends it now, at most one a minute per Webhook (a Workspace's or a Personal one: the caller has checked who may). */
export async function queueTestPing(workspaceId: string, webhookId: string): Promise<void> {
  const wait = "A test was sent a moment ago. Wait a minute before sending another.";
  const recent = () => db().from("webhook_sends").select("id").eq("webhook_id", webhookId).eq("type", "ping").gte("created_at", new Date(Date.now() - 60_000).toISOString()).order("created_at").order("id").limit(1);
  if ((await recent()).data?.length) throw new Error(wait);
  const { data: made, error } = await db().from("webhook_sends").insert({ workspace_id: workspaceId, webhook_id: webhookId, type: "ping", source_type: "app" }).select("id").single();
  if (error || !made) throw new Error("The test could not be queued. Try again in a moment.");
  // Two tests at the same moment both got here: the earlier one stands, the other is taken back.
  if ((await recent()).data?.[0]?.id !== made.id) {
    await db().from("webhook_sends").delete().eq("id", made.id);
    throw new Error(wait);
  }
  // Sent now, this one only, so the log answers at once; the job would send it within minutes otherwise.
  await sendWebhookNow(workspaceId, String(made.id));
}

/** Sends a `ping` to a Webhook now (Owners and Admins), at most once a minute per Webhook; the log shows what came
 * back. It holds the Webhook's name and nothing of the Workspace. A switched-off Webhook gets none. */
export async function sendTestWebhook(actor: Actor, webhookId: string): Promise<void> {
  assertReadsWebhookLog(actor);
  await assertMaySend(actor);
  const hook = await ownWebhook(actor, webhookId);
  if (hook.disabled) throw new Forbidden("Switch the Webhook on to send a test.");
  await queueTestPing(actor.workspaceId, hook.id);
}

/** Puts a failed send of this Workspace's Webhook back in the queue (Owners and Admins): it goes out again with the
 * same event id, as a message built from the facts of that moment. A send that did not fail, or a switched-off Webhook,
 * is refused. */
export async function resendWebhookSend(actor: Actor, sendId: string): Promise<void> {
  assertReadsWebhookLog(actor);
  if (typeof sendId !== "string" || !UUID.test(sendId)) throw new Forbidden(NOT_FOUND);
  await assertMaySend(actor);
  const { data: send } = await db().from("webhook_sends").select("id, webhook_id, state, last_attempt_at").eq("id", sendId.toLowerCase()).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!send) throw new Forbidden(NOT_FOUND);
  const hook = await ownWebhook(actor, String(send.webhook_id));
  if (hook.disabled) throw new Forbidden("Switch the Webhook on to send again.");
  // A send that was tried a moment ago waits: one request per send and minute, however often the button is pressed.
  if (send.last_attempt_at && Date.now() - new Date(String(send.last_attempt_at)).getTime() < 60_000) throw new Error("That send was tried a moment ago. Wait a minute before sending it again.");
  const { data: changed, error } = await db().from("webhook_sends").update({ state: "queued", attempts: 0, failure: null, status_code: null, next_attempt_at: new Date().toISOString(), claimed_at: null })
    .eq("id", String(send.id)).eq("workspace_id", actor.workspaceId).eq("state", "failed").select("id");
  if (error) throw new Error("The send could not be queued. Try again in a moment.");
  if (!changed?.length) throw new Error("Only a send that failed can be sent again.");
  await audit(actor, { kind: "webhook.resent", object: { type: "webhook", id: hook.id, name: hook.name }, details: {} });
  await sendWebhookNow(actor.workspaceId, String(send.id));
}
