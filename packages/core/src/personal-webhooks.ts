// Personal Webhooks (GLOSSARY: Personal Webhook; spec 0037, ticket #641): an https address that one person adds for
// themselves in one Workspace, once an Owner or Admin allows it. This module is the switch, the person's own operations
// (add, change, replace the secret, test, switch off, delete), the Admins' list and removal, and the end of a person's
// Webhooks when they leave. Nothing is heard here beyond the test `ping`: what a Personal Webhook may hear is ticket 2.
// SECURITY: only a signed-in Owner, Admin or Member acts, never an Access Key, a Guest or a Contact, never the demo
// and never a Trial Workspace (until spec 0037's ticket 6); there is no API or MCP route to any of this, because
// changing where data leaves is exactly what a prompt-injected assistant would be asked to do. The address and secret
// are sealed and checked exactly as a Workspace Webhook's (webhooks.ts shares the code, there is no second copy of the
// rules); a person reaches only their own rows, and a row of someone else or another Workspace is answered like one
// that is not there. Admins read the list with masked addresses and the log's statuses, never what was sent.
import { randomUUID } from "node:crypto";
import { Forbidden, type Actor } from "./actor";
import { audit, recordAudit } from "./audit-log";
import { db } from "./db";
import { deliverNotice, refFor } from "./deliveries";
import { refuseInDemo } from "./demo";
import { PERSONAL_WEBHOOK_ROLES, personalWebhooksAllowed } from "./personal-webhook-state";
import { openNames, openRows, sealRow } from "./sealed-columns";
import { webhookRules } from "./webhook-trial";
import { PERSONAL_WEBHOOKS_PER_PERSON, WEBHOOK_SECRET_OVERLAP_HOURS } from "./webhook-limits";
import { type WebhookInfo } from "./webhooks";
import { checkedAddress, cleanEvents, cleanName, maskAddress, maskedHost, newSecret, WEBHOOK_COLUMNS } from "./webhooks";
import { sendWebhookNow } from "./webhook-send";
import { daysNow } from "./keep-days";
import type { WebhookLogEntry } from "./webhook-log";

const NOT_FOUND = "That Webhook was not found.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = `${WEBHOOK_COLUMNS}, owner_id`;

/** A Personal Webhook as its person reads it: the address masked, never the secret. `paused` when the Workspace's switch is off. */
export type PersonalWebhookInfo = WebhookInfo & { paused: boolean };

/** A Personal Webhook as an Owner or Admin reads it: whose it is, the address masked, and when it last sent. */
export type PersonalWebhookAdminInfo = WebhookInfo & { ownerId: string; ownerName: string; lastSendAt: string | null };

/** Refuses anyone but a signed-in Owner, Admin or Member who still is one (judged in the database, not by the role the Actor claims), and the demo. */
async function assertOwnsPersonal(actor: Actor): Promise<void> {
  if (actor.key) throw new Forbidden("A key cannot manage Webhooks.");
  refuseInDemo(actor);
  const { data } = await db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle();
  if (!(PERSONAL_WEBHOOK_ROLES as readonly string[]).includes(String(data?.role)) || !(PERSONAL_WEBHOOK_ROLES as readonly string[]).includes(actor.role)) throw new Forbidden("Only Owners, Admins and Members have their own Webhooks.");
}

/** Refuses anyone but a signed-in Owner or Admin, and the demo. */
function assertAdmin(actor: Actor): void {
  if (actor.key) throw new Forbidden("A key cannot manage Webhooks.");
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins manage Webhooks.");
  refuseInDemo(actor);
}

/** The rules of the Workspace's Webhooks (trial limits, no private hosts in a trial, the operator's switch), refusing where none are allowed. */
async function rulesOrRefuse(workspaceId: string) {
  const rules = await webhookRules(workspaceId);
  if (!rules.allowed) throw new Forbidden(rules.why ?? "Webhooks are not possible here.");
  return rules;
}

const OFF = "Your Workspace does not allow personal Webhooks; ask an Owner or Admin.";

/** The actor's own Personal Webhook with this id, its address opened and masked for the Audit Log, or the refusal that does not say whether it exists. */
async function findOwn(actor: Actor, id: unknown): Promise<{ row: Record<string, unknown>; address: string }> {
  if (typeof id !== "string" || !UUID.test(id)) throw new Forbidden(NOT_FOUND);
  const { data } = await db().from("webhooks").select(COLUMNS).eq("id", id.toLowerCase()).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).maybeSingle();
  if (!data) throw new Forbidden(NOT_FOUND);
  const [row] = await openRows("webhooks", actor.workspaceId, [data as Record<string, unknown>]);
  return { row, address: maskedHost(String(row.url ?? "")) };
}

function info(r: Record<string, unknown>, now: number): WebhookInfo {
  return {
    id: String(r.id), name: String(r.name), address: maskAddress(String(r.url ?? "")), events: (r.events as WebhookInfo["events"]) ?? [],
    enabled: !r.disabled_at, disabledReason: (r.disabled_reason as WebhookInfo["disabledReason"]) ?? null, disabledAt: (r.disabled_at as string | null) ?? null,
    replacingSecret: !!r.secret_previous_until && new Date(String(r.secret_previous_until)).getTime() > now, createdAt: String(r.created_at),
  };
}

/** Switches the Workspace's "People may add their own Webhooks" (Owners and Admins). Off pauses every Personal Webhook:
 * what waits to be sent is dropped (events in that time are dropped, nothing is queued for later) and each person's
 * page says why; on again resumes them. Both are in the Audit Log. */
export async function setPersonalWebhooksAllowed(actor: Actor, allowed: boolean): Promise<void> {
  assertAdmin(actor);
  if (typeof allowed !== "boolean") throw new Error("People may add their own Webhooks, or may not.");
  const before = await personalWebhooksAllowed(actor.workspaceId);
  const { error } = await db().from("workspaces").update({ personal_webhooks_allowed: allowed }).eq("id", actor.workspaceId);
  if (error) throw new Error("The setting could not be saved. Try again in a moment.");
  if (before === allowed) return;
  if (!allowed) {
    const { data: hooks } = await db().from("webhooks").select("id").eq("workspace_id", actor.workspaceId).not("owner_id", "is", null);
    const ids = (hooks ?? []).map((h) => String(h.id));
    if (ids.length) await db().from("webhook_sends").update({ state: "dropped", claimed_at: null }).eq("workspace_id", actor.workspaceId).in("webhook_id", ids).in("state", ["queued", "retrying"]);
  }
  await audit(actor, { kind: allowed ? "workspace.personal_webhooks_allowed" : "workspace.personal_webhooks_refused", object: { type: "workspace", id: actor.workspaceId } });
}

/** Adds a Personal Webhook for the actor and returns its id and secret, shown this once. The limit and the switch are checked in the database under a lock. */
export async function createPersonalWebhook(actor: Actor, input: { name: string; url: string; events?: string[] }): Promise<{ id: string; secret: string }> {
  await assertOwnsPersonal(actor);
  if (typeof input !== "object" || input === null) throw new Error("That is not a Webhook.");
  if (!(await personalWebhooksAllowed(actor.workspaceId))) throw new Forbidden(OFF);
  const rules = await rulesOrRefuse(actor.workspaceId);
  const name = cleanName(input.name);
  const events = cleanEvents(input.events ?? []);
  const url = await checkedAddress(input.url, rules.privateHosts);
  const id = randomUUID();
  const secret = newSecret();
  const sealed = await sealRow("webhooks", actor.workspaceId, { id, url, secret });
  const { data, error } = await db().rpc("create_personal_webhook", { p_id: id, p_ws: actor.workspaceId, p_owner: actor.personId, p_name: name, p_url: sealed.url, p_secret: sealed.secret, p_events: events, p_max: PERSONAL_WEBHOOKS_PER_PERSON, p_trial_max: rules.trial ? rules.maxWebhooks : null });
  if (error || typeof data !== "string") {
    console.error("create_personal_webhook failed:", error?.message ?? "no answer");
    throw new Error("The Webhook could not be saved. Try again in a moment.");
  }
  if (data === "off") throw new Forbidden(OFF);
  if (data === "role") throw new Forbidden("Only Owners, Admins and Members have their own Webhooks.");
  if (data === "trial_limit") throw new Error(`This trial already has ${rules.maxWebhooks} Webhooks, the most it may. Delete one to add another.`);
  if (data === "limit") throw new Error(`You already have ${PERSONAL_WEBHOOKS_PER_PERSON} Webhooks here, the most you may. Delete one to add another.`);
  await audit(actor, { kind: "webhook.personal_added", object: { type: "webhook", id, name }, details: { address: maskedHost(url), events } });
  return { id, secret };
}

/** The actor's own Personal Webhooks in this Workspace, newest first, the address masked and no secret. Empty, naming none, while the Workspace does not allow them. */
export async function listOwnPersonalWebhooks(actor: Actor): Promise<{ allowed: boolean; webhooks: PersonalWebhookInfo[] }> {
  await assertOwnsPersonal(actor);
  const allowed = await personalWebhooksAllowed(actor.workspaceId);
  // Without the switch the page names none: they are paused, and each says nothing about where it points.
  if (!allowed) return { allowed, webhooks: [] };
  const { data } = await db().from("webhooks").select(COLUMNS).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).order("created_at", { ascending: false });
  const rows = await openRows("webhooks", actor.workspaceId, (data ?? []) as Record<string, unknown>[]);
  const now = Date.now();
  return { allowed, webhooks: rows.map((r) => ({ ...info(r, now), paused: !allowed })) };
}

/** Changes the actor's own Webhook's name, events or address. */
export async function updatePersonalWebhook(actor: Actor, id: string, change: { name?: string; events?: string[]; url?: string }): Promise<void> {
  await assertOwnsPersonal(actor);
  if (typeof change !== "object" || change === null) throw new Error("That is not a change to a Webhook.");
  const { row, address } = await findOwn(actor, id);
  const rules = change.url !== undefined ? await rulesOrRefuse(actor.workspaceId) : null;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (change.name !== undefined) patch.name = cleanName(change.name);
  if (change.events !== undefined) patch.events = cleanEvents(change.events);
  if (change.url !== undefined) patch.url = (await sealRow("webhooks", actor.workspaceId, { id: String(row.id), url: await checkedAddress(change.url, rules?.privateHosts ?? []) })).url;
  const { data: changed, error } = await db().from("webhooks").update(patch).eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).select("id");
  if (error) throw new Error("The Webhook could not be saved. Try again in a moment.");
  if (!changed?.length) throw new Forbidden(NOT_FOUND);
  const newAddress = change.url !== undefined ? maskedHost(String((await openRows("webhooks", actor.workspaceId, [{ id: String(row.id), url: patch.url }]))[0]?.url ?? "")) : address;
  await audit(actor, { kind: "webhook.personal_changed", object: { type: "webhook", id: String(row.id), name: String(patch.name ?? row.name) }, details: { address: newAddress, ...(patch.events ? { events: patch.events as string[] } : {}), ...(patch.name ? { from: String(row.name) } : {}), ...(change.url !== undefined ? { address_changed: true } : {}) } });
}

/** Replaces the actor's own Webhook's secret and returns the new one, shown this once; the old one still signs beside it for 24 hours, as for a Workspace Webhook. */
export async function replacePersonalWebhookSecret(actor: Actor, id: string): Promise<{ secret: string }> {
  await assertOwnsPersonal(actor);
  const { row, address } = await findOwn(actor, id);
  const { data } = await db().from("webhooks").select("secret").eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).maybeSingle();
  const [current] = await openRows("webhooks", actor.workspaceId, data ? [{ id: String(row.id), secret: data.secret as string }] : []);
  const old = typeof current?.secret === "string" && current.secret.startsWith("whsec_") ? current.secret : null;
  const secret = newSecret();
  const sealed = await sealRow("webhooks", actor.workspaceId, { id: String(row.id), secret, secret_previous: old });
  const until = new Date(Date.now() + WEBHOOK_SECRET_OVERLAP_HOURS * 3_600_000).toISOString();
  const { data: updated, error } = await db().from("webhooks").update({ secret: sealed.secret, secret_previous: old ? sealed.secret_previous : null, secret_previous_until: old ? until : null, updated_at: new Date().toISOString() }).eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).eq("secret", String(data?.secret)).select("id");
  if (error) throw new Error("The secret could not be replaced. Try again in a moment.");
  if (!updated?.length) throw new Error("The Webhook changed at the same moment. Look at it again and replace the secret once more.");
  await audit(actor, { kind: "webhook.personal_secret_replaced", object: { type: "webhook", id: String(row.id), name: String(row.name) }, details: { address } });
  return { secret };
}

/** Switches the actor's own Webhook on or off. Off keeps it and drops what waits; on again resends nothing, and needs the Workspace's switch on. */
export async function setPersonalWebhookEnabled(actor: Actor, id: string, enabled: boolean): Promise<void> {
  await assertOwnsPersonal(actor);
  if (typeof enabled !== "boolean") throw new Error("A Webhook is switched on or off.");
  const { row, address } = await findOwn(actor, id);
  if (!!row.disabled_at === !enabled) return;
  if (enabled && !(await personalWebhooksAllowed(actor.workspaceId))) throw new Forbidden(OFF);
  const patch = enabled ? { disabled_at: null, disabled_reason: null, failing_since: null, failure_count: 0 } : { disabled_at: new Date().toISOString(), disabled_reason: "owner" };
  const { data: changed, error } = await db().from("webhooks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).select("id");
  if (error) throw new Error("The Webhook could not be saved. Try again in a moment.");
  if (!changed?.length) throw new Forbidden(NOT_FOUND);
  if (!enabled) await db().from("webhook_sends").update({ state: "dropped", claimed_at: null }).eq("webhook_id", String(row.id)).eq("workspace_id", actor.workspaceId).in("state", ["queued", "retrying"]);
  await audit(actor, { kind: enabled ? "webhook.personal_switched_on" : "webhook.personal_switched_off", object: { type: "webhook", id: String(row.id), name: String(row.name) }, details: { address } });
}

/** Deletes the actor's own Webhook: nothing more is sent to it. Allowed also while the Workspace's switch is off. */
export async function deletePersonalWebhook(actor: Actor, id: string): Promise<void> {
  await assertOwnsPersonal(actor);
  const { row, address } = await findOwn(actor, id);
  const { data, error } = await db().from("webhooks").delete().eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).select("id");
  if (error) throw new Error("The Webhook could not be removed. Try again in a moment.");
  if (!data?.length) throw new Forbidden(NOT_FOUND);
  await audit(actor, { kind: "webhook.personal_deleted", object: { type: "webhook", id: String(row.id), name: String(row.name) }, details: { address } });
}

/** Sends a `ping` to the actor's own Webhook now, at most once a minute per Webhook. It holds the Webhook's name and nothing of the Workspace. */
export async function sendTestPersonalWebhook(actor: Actor, id: string): Promise<void> {
  await assertOwnsPersonal(actor);
  if (!(await personalWebhooksAllowed(actor.workspaceId))) throw new Forbidden(OFF);
  await rulesOrRefuse(actor.workspaceId);
  const { row } = await findOwn(actor, id);
  if (row.disabled_at) throw new Forbidden("Switch the Webhook on to send a test.");
  const wait = "A test was sent a moment ago. Wait a minute before sending another.";
  const recent = () => db().from("webhook_sends").select("id").eq("webhook_id", String(row.id)).eq("type", "ping").gte("created_at", new Date(Date.now() - 60_000).toISOString()).order("created_at").order("id").limit(1);
  if ((await recent()).data?.length) throw new Error(wait);
  const { data: made, error } = await db().from("webhook_sends").insert({ workspace_id: actor.workspaceId, webhook_id: String(row.id), type: "ping", source_type: "app" }).select("id").single();
  if (error || !made) throw new Error("The test could not be queued. Try again in a moment.");
  if ((await recent()).data?.[0]?.id !== made.id) {
    await db().from("webhook_sends").delete().eq("id", made.id);
    throw new Error(wait);
  }
  await sendWebhookNow(actor.workspaceId, String(made.id));
}

/** The log of one Webhook's sends, newest first, for the days it is kept. `about` (what a send was about) is for the person only: Admins read statuses and times. */
async function logOf(workspaceId: string, webhookId: string, limit: number, withAbout: boolean): Promise<WebhookLogEntry[]> {
  const n = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 50;
  const since = new Date(Date.now() - (await daysNow("ZIFFR_KEEP_WEBHOOK_LOG_DAYS")) * 86_400_000).toISOString();
  const { data } = await db().from("webhook_sends").select("id, type, action_id, metric_id, created_at, state, status_code, failure, attempts").eq("webhook_id", webhookId).eq("workspace_id", workspaceId).gte("created_at", since).order("created_at", { ascending: false }).limit(n);
  return (data ?? []).map((r) => ({
    id: String(r.id), type: String(r.type), at: String(r.created_at), state: r.state as WebhookLogEntry["state"], statusCode: (r.status_code as number | null) ?? null,
    failure: (r.failure as string | null) ?? null, attempts: Number(r.attempts),
    about: withAbout ? (r.action_id !== null ? refFor(Number(r.action_id)) : r.metric_id !== null ? `Metric ${r.metric_id}` : null) : null,
  }));
}

/** The log of the actor's own Webhook. */
export async function ownPersonalWebhookLog(actor: Actor, id: string, limit = 50): Promise<WebhookLogEntry[]> {
  await assertOwnsPersonal(actor);
  const { row } = await findOwn(actor, id);
  return logOf(actor.workspaceId, String(row.id), limit, true);
}

/** Every Personal Webhook of the Workspace for Owners and Admins: whose, the name, the address masked, the events, the state and the last send. No secret, no message. */
export async function listPersonalWebhooksForAdmin(actor: Actor): Promise<PersonalWebhookAdminInfo[]> {
  assertAdmin(actor);
  const { data } = await db().from("webhooks").select(COLUMNS).eq("workspace_id", actor.workspaceId).not("owner_id", "is", null).order("created_at", { ascending: false });
  const rows = await openRows("webhooks", actor.workspaceId, (data ?? []) as Record<string, unknown>[]);
  if (!rows.length) return [];
  const ownerIds = [...new Set(rows.map((r) => String(r.owner_id)))];
  const [{ data: people }, { data: sends }] = await Promise.all([
    db().from("profiles").select("id, name").in("id", ownerIds),
    db().from("webhook_sends").select("webhook_id, last_attempt_at").eq("workspace_id", actor.workspaceId).in("webhook_id", rows.map((r) => String(r.id))).not("last_attempt_at", "is", null).order("last_attempt_at", { ascending: false }).limit(1000),
  ]);
  const names = new Map((await openNames(actor.workspaceId, people ?? [])).map((p) => [String(p.id), String(p.name ?? "")]));
  const last = new Map<string, string>();
  for (const s of sends ?? []) if (!last.has(String(s.webhook_id))) last.set(String(s.webhook_id), String(s.last_attempt_at));
  const now = Date.now();
  return rows.map((r) => ({ ...info(r, now), ownerId: String(r.owner_id), ownerName: names.get(String(r.owner_id)) ?? "", lastSendAt: last.get(String(r.id)) ?? null }));
}

/** The statuses and times of one Personal Webhook's sends, for Owners and Admins: never what was sent. */
export async function personalWebhookLogForAdmin(actor: Actor, id: string, limit = 50): Promise<WebhookLogEntry[]> {
  assertAdmin(actor);
  if (typeof id !== "string" || !UUID.test(id)) throw new Forbidden(NOT_FOUND);
  const { data } = await db().from("webhooks").select("id").eq("id", id.toLowerCase()).eq("workspace_id", actor.workspaceId).not("owner_id", "is", null).maybeSingle();
  if (!data) throw new Forbidden(NOT_FOUND);
  return logOf(actor.workspaceId, String(data.id), limit, false);
}

/** Removes someone's Personal Webhook (Owners and Admins). Its person is told through their Delivery Preference, naming who removed it, and the Audit Log has it. */
export async function removePersonalWebhook(actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  if (typeof id !== "string" || !UUID.test(id)) throw new Forbidden(NOT_FOUND);
  const { data } = await db().from("webhooks").select(COLUMNS).eq("id", id.toLowerCase()).eq("workspace_id", actor.workspaceId).not("owner_id", "is", null).maybeSingle();
  if (!data) throw new Forbidden(NOT_FOUND);
  const [row] = await openRows("webhooks", actor.workspaceId, [data as Record<string, unknown>]);
  const { data: gone, error } = await db().from("webhooks").delete().eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).not("owner_id", "is", null).select("id");
  if (error) throw new Error("The Webhook could not be removed. Try again in a moment.");
  if (!gone?.length) throw new Forbidden(NOT_FOUND);
  const address = maskedHost(String(row.url ?? ""));
  const owner = String(row.owner_id);
  await audit(actor, { kind: "webhook.personal_removed", object: { type: "webhook", id: String(row.id), name: String(row.name) }, details: { address, owner_id: owner } });
  const { data: me } = await db().from("profiles").select("id, name").eq("id", actor.personId).maybeSingle();
  const by = String((me ? (await openNames(actor.workspaceId, [me]))[0].name : null) ?? "An Admin");
  try {
    await deliverNotice(actor.workspaceId, { recipientId: owner, senderId: actor.personId, subject: `Your Webhook was removed: ${String(row.name)}`, text: `${by} removed your Webhook "${String(row.name)}" (${address}). Nothing more is sent to it.`, link: "/settings" });
  } catch (e) {
    console.error("Personal Webhooks: could not tell the person:", (e as Error).message);
  }
}

/** A Personal Webhook that is about to end with its person's place in the Workspace: read before the change, since the database removes the row with it. */
export type EndingPersonalWebhook = { id: string; name: string; address: string };

/** The Personal Webhooks a person holds in the Workspace, read before they leave or become a Guest, to record their end afterwards. */
export async function personalWebhooksOf(workspaceId: string, personId: string): Promise<EndingPersonalWebhook[]> {
  const { data } = await db().from("webhooks").select("id, name, url").eq("workspace_id", workspaceId).eq("owner_id", personId);
  const rows = await openRows("webhooks", workspaceId, (data ?? []) as Record<string, unknown>[]);
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), address: maskedHost(String(r.url ?? "")) }));
}

/** Records in the Audit Log that these Personal Webhooks ended with their person's place in the Workspace, with the reason
 * (the database has removed the rows). `by` is who made the change. Best effort, as every Audit Log entry. */
export async function recordPersonalWebhooksEnded(workspaceId: string, personId: string, ended: EndingPersonalWebhook[], reason: "left" | "guest", by: string | null): Promise<void> {
  for (const w of ended) await recordAudit(workspaceId, by, { kind: "webhook.personal_ended", object: { type: "webhook", id: w.id, name: w.name }, details: { address: w.address, owner_id: personId, reason } });
}
