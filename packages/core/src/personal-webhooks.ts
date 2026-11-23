// Personal Webhooks (GLOSSARY: Personal Webhook; spec 0037, ticket #641): an https address that one person adds for
// themselves in one Workspace, once an Owner or Admin allows it. This module is the switch, the person's own operations
// (add, change, replace the secret, test, switch off, delete), the Admins' list and removal, and the end of a person's
// Webhooks when they leave. Nothing is heard here beyond the test `ping`: what a Personal Webhook may hear is ticket 2.
// SECURITY: only a signed-in Owner, Admin or Member acts, never an Access Key, a Guest or a Contact, never the demo
// and in a Trial Workspace only within its trial rules (webhook-trial.ts); there is no API or MCP route to any of this, because
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
import { PERSONAL_WEBHOOKS_PER_PERSON } from "./webhook-limits";
import { type WebhookInfo } from "./webhooks";
import { assertManagesWebhooks, checkedAddress, cleanEvents, cleanName, findWebhook, maskedHost, newSecret, rotateSecret, switchWebhook, WEBHOOK_COLUMNS, webhookInfo } from "./webhooks";
import { daysNow } from "./keep-days";
import { readableActions, visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { checkedPickedMetrics } from "./personal-webhook-hearing";
import { queueTestPing, type WebhookLogEntry } from "./webhook-log";

const NOT_FOUND = "That Webhook was not found.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = `${WEBHOOK_COLUMNS}, owner_id, metric_ids`;

/** A Personal Webhook as its person reads it: the address masked, never the secret. `paused` when the Workspace's switch is off. */
export type PersonalWebhookInfo = WebhookInfo & { paused: boolean; /** The picked Metrics the person sees now (spec 0037). */ metricIds: number[]; /** How many more were picked that they no longer see: counted, never named or numbered. */ hiddenMetrics: number };

/** A Personal Webhook as an Owner or Admin reads it: whose it is, the address masked, and when it last sent. */
export type PersonalWebhookAdminInfo = WebhookInfo & { ownerId: string; ownerName: string; lastSendAt: string | null };

/** Refuses anyone but a signed-in Owner, Admin or Member who still is one (judged in the database, not by the role the Actor claims), and the demo. */
async function assertOwnsPersonal(actor: Actor): Promise<void> {
  if (actor.key) throw new Forbidden("A key cannot manage Webhooks.");
  refuseInDemo(actor);
  const { data } = await db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle();
  if (!(PERSONAL_WEBHOOK_ROLES as readonly string[]).includes(String(data?.role)) || !(PERSONAL_WEBHOOK_ROLES as readonly string[]).includes(actor.role)) throw new Forbidden("Only Owners, Admins and Members have their own Webhooks.");
}

/** Refuses anyone but an Owner or Admin who still is one, judged in the database and not by the role the Actor claims, and the demo. */
async function assertAdminNow(actor: Actor): Promise<void> {
  assertManagesWebhooks(actor);
  const { data } = await db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle();
  if (data?.role !== "owner" && data?.role !== "admin") throw new Forbidden("Only Owners and Admins manage Webhooks.");
}

/** The rules of the Workspace's Webhooks (trial limits, no private hosts in a trial, the operator's switch), refusing where none are allowed. */
async function rulesOrRefuse(workspaceId: string) {
  const rules = await webhookRules(workspaceId);
  if (!rules.allowed) throw new Forbidden(rules.why ?? "Webhooks are not possible here.");
  return rules;
}

const OFF = "Your Workspace does not allow personal Webhooks; ask an Owner or Admin.";

/** The actor's own Personal Webhook with this id: another person's, a Workspace Webhook and another Workspace's answer like one that is not there. */
const findOwn = (actor: Actor, id: unknown) => findWebhook(actor, id, actor.personId);

/** Switches the Workspace's "People may add their own Webhooks" (Owners and Admins). Off pauses every Personal Webhook:
 * what waits to be sent is dropped (events in that time are dropped, nothing is queued for later) and each person's
 * page says why; on again resumes them. Both are in the Audit Log. */
export async function setPersonalWebhooksAllowed(actor: Actor, allowed: boolean): Promise<void> {
  await assertAdminNow(actor);
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
export async function createPersonalWebhook(actor: Actor, input: { name: string; url: string; events?: string[]; metricIds?: number[] }): Promise<{ id: string; secret: string }> {
  await assertOwnsPersonal(actor);
  if (typeof input !== "object" || input === null) throw new Error("That is not a Webhook.");
  if (!(await personalWebhooksAllowed(actor.workspaceId))) throw new Forbidden(OFF);
  const rules = await rulesOrRefuse(actor.workspaceId);
  const name = cleanName(input.name);
  const events = cleanEvents(input.events ?? []);
  const metricIds = input.metricIds === undefined ? [] : await checkedPickedMetrics(actor, input.metricIds);
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
  if (metricIds.length) {
    const { error: pickError } = await db().from("webhooks").update({ metric_ids: metricIds }).eq("id", id).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId);
    // Never a Webhook that hears more or less than was asked: without its Metrics it is taken back.
    if (pickError) { await db().from("webhooks").delete().eq("id", id).eq("workspace_id", actor.workspaceId); throw new Error("The Webhook could not be saved. Try again in a moment."); }
  }
  await audit(actor, { kind: "webhook.personal_added", object: { type: "webhook", id, name }, details: { address: maskedHost(url), events, ...(metricIds.length ? { metrics: metricIds.length } : {}) } });
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
  // Only picks the person sees now leave the core; the rest are a count (rule 3: carry only what is needed).
  const picks = rows.flatMap((r) => ((r.metric_ids as number[] | null) ?? []).map(Number));
  const seen = picks.length ? await visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId)) : new Set<number>();
  return { allowed, webhooks: rows.map((r) => {
    const all = ((r.metric_ids as number[] | null) ?? []).map(Number);
    const metricIds = all.filter((id) => seen.has(id));
    return { ...webhookInfo(r, now), paused: !allowed, metricIds, hiddenMetrics: all.length - metricIds.length };
  }) };
}

/** The Metrics already picked on the actor's own Webhook. */
async function currentPicks(actor: Actor, id: string): Promise<number[]> {
  const { data } = await db().from("webhooks").select("metric_ids").eq("id", id).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).maybeSingle();
  return ((data?.metric_ids as number[] | null) ?? []).map(Number);
}

/** Changes the actor's own Webhook's name, events, address or picked Metrics. */
export async function updatePersonalWebhook(actor: Actor, id: string, change: { name?: string; events?: string[]; url?: string; metricIds?: number[] }): Promise<void> {
  await assertOwnsPersonal(actor);
  if (typeof change !== "object" || change === null) throw new Error("That is not a change to a Webhook.");
  // As testing and switching on: while the Workspace does not allow them, a Personal Webhook is paused and not changed.
  if (!(await personalWebhooksAllowed(actor.workspaceId))) throw new Forbidden(OFF);
  const { row, address } = await findOwn(actor, id);
  const rules = change.url !== undefined ? await rulesOrRefuse(actor.workspaceId) : null;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (change.name !== undefined) patch.name = cleanName(change.name);
  if (change.events !== undefined) patch.events = cleanEvents(change.events);
  if (change.metricIds !== undefined) {
    // The page only knows the picks the person sees now: the ones they lost sight of stay on the Webhook until they are dropped by the person's own sight (never sent), so the list the person submits is merged with them.
    const current = await currentPicks(actor, String(row.id));
    const seen = current.length ? await visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId)) : new Set<number>();
    const keptHidden = current.filter((id) => !seen.has(id));
    patch.metric_ids = await checkedPickedMetrics(actor, [...new Set([...(Array.isArray(change.metricIds) ? change.metricIds : []), ...keptHidden])].slice(0, 100), current);
  }
  if (change.url !== undefined) patch.url = (await sealRow("webhooks", actor.workspaceId, { id: String(row.id), url: await checkedAddress(change.url, rules?.privateHosts ?? []) })).url;
  const { data: changed, error } = await db().from("webhooks").update(patch).eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).select("id");
  if (error) throw new Error("The Webhook could not be saved. Try again in a moment.");
  if (!changed?.length) throw new Forbidden(NOT_FOUND);
  const newAddress = change.url !== undefined ? maskedHost(String((await openRows("webhooks", actor.workspaceId, [{ id: String(row.id), url: patch.url }]))[0]?.url ?? "")) : address;
  await audit(actor, { kind: "webhook.personal_changed", object: { type: "webhook", id: String(row.id), name: String(patch.name ?? row.name) }, details: { address: newAddress, ...(patch.events ? { events: patch.events as string[] } : {}), ...(patch.name ? { from: String(row.name) } : {}), ...(change.url !== undefined ? { address_changed: true } : {}) } });
}

/** Drops the picked Metrics the person can no longer see from their own Webhook, so it stops carrying them (and does not hear them again if sight returns). Returns how many it dropped. */
export async function forgetHiddenPersonalMetrics(actor: Actor, id: string): Promise<number> {
  await assertOwnsPersonal(actor);
  if (!(await personalWebhooksAllowed(actor.workspaceId))) throw new Forbidden(OFF);
  const { row } = await findOwn(actor, id);
  const current = await currentPicks(actor, String(row.id));
  const seen = current.length ? await visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId)) : new Set<number>();
  const kept = current.filter((m) => seen.has(m));
  if (kept.length === current.length) return 0;
  const { data, error } = await db().from("webhooks").update({ metric_ids: kept, updated_at: new Date().toISOString() }).eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).select("id");
  if (error) throw new Error("The Webhook could not be saved. Try again in a moment.");
  if (!data?.length) throw new Forbidden(NOT_FOUND);
  await audit(actor, { kind: "webhook.personal_changed", object: { type: "webhook", id: String(row.id), name: String(row.name) }, details: { address: maskedHost(String((await openRows("webhooks", actor.workspaceId, [row]))[0]?.url ?? "")), metrics: kept.length } });
  return current.length - kept.length;
}

/** Replaces the actor's own Webhook's secret and returns the new one, shown this once; the old one still signs beside it for 24 hours, as for a Workspace Webhook. */
export async function replacePersonalWebhookSecret(actor: Actor, id: string): Promise<{ secret: string }> {
  await assertOwnsPersonal(actor);
  const { secret, row, address } = await rotateSecret(actor, id, actor.personId);
  await audit(actor, { kind: "webhook.personal_secret_replaced", object: { type: "webhook", id: String(row.id), name: String(row.name) }, details: { address } });
  return { secret };
}

/** Switches the actor's own Webhook on or off. Off keeps it and drops what waits; on again resends nothing, and needs the Workspace's switch on. */
export async function setPersonalWebhookEnabled(actor: Actor, id: string, enabled: boolean): Promise<void> {
  await assertOwnsPersonal(actor);
  if (enabled && !(await personalWebhooksAllowed(actor.workspaceId))) throw new Forbidden(OFF);
  const done = await switchWebhook(actor, id, enabled, actor.personId);
  if (!done) return;
  await audit(actor, { kind: enabled ? "webhook.personal_switched_on" : "webhook.personal_switched_off", object: { type: "webhook", id: String(done.row.id), name: String(done.row.name) }, details: { address: done.address } });
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
  await queueTestPing(actor.workspaceId, String(row.id));
}

/** The log of one Webhook's sends, newest first, for the days it is kept. `about` (what a send was about) is for the person only: Admins read statuses and times. */
async function logOf(workspaceId: string, webhookId: string, limit: number, withAbout: boolean, person?: string): Promise<WebhookLogEntry[]> {
  const n = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 50;
  const since = new Date(Date.now() - (await daysNow("ZIFFR_KEEP_WEBHOOK_LOG_DAYS")) * 86_400_000).toISOString();
  const { data } = await db().from("webhook_sends").select("id, type, action_id, metric_id, created_at, state, status_code, failure, attempts").eq("webhook_id", webhookId).eq("workspace_id", workspaceId).gte("created_at", since).order("created_at", { ascending: false }).limit(n);
  // For the person: what a send was about is shown only for what they may see now, and a send that never went out for
  // something they may not see is left out, so the log cannot hint at it (spec 0037).
  let rowsOf = data ?? [];
  if (person) {
    const metrics = await getMetrics(workspaceId);
    const seen = await visibleMetricIds(workspaceId, person, metrics);
    const readable = new Set((await readableActions(workspaceId, person)).map((a) => a.id));
    rowsOf = rowsOf.flatMap((r) => {
      const ok = r.action_id !== null ? readable.has(Number(r.action_id)) : r.metric_id !== null ? seen.has(Number(r.metric_id)) : true;
      if (ok) return [r];
      // A send that failed for lack of a key never carried anything: for what the person may not see it is a drop, like the rest.
      return r.state === "delivered" || (r.state === "failed" && r.failure !== "key") ? [{ ...r, action_id: null, metric_id: null }] : [];
    });
  }
  return rowsOf.map((r) => ({
    id: String(r.id), type: String(r.type), at: String(r.created_at), state: r.state as WebhookLogEntry["state"], statusCode: (r.status_code as number | null) ?? null,
    failure: (r.failure as string | null) ?? null, attempts: Number(r.attempts),
    about: withAbout ? (r.action_id !== null ? refFor(Number(r.action_id)) : r.metric_id !== null ? `Metric ${r.metric_id}` : null) : null,
  }));
}

/** The log of the actor's own Webhook. */
export async function ownPersonalWebhookLog(actor: Actor, id: string, limit = 50): Promise<WebhookLogEntry[]> {
  await assertOwnsPersonal(actor);
  const { row } = await findOwn(actor, id);
  return logOf(actor.workspaceId, String(row.id), limit, true, actor.personId);
}

/** Every Personal Webhook of the Workspace for Owners and Admins: whose, the name, the address masked, the events, the state and the last send. No secret, no message. */
export async function listPersonalWebhooksForAdmin(actor: Actor): Promise<PersonalWebhookAdminInfo[]> {
  await assertAdminNow(actor);
  const { data } = await db().from("webhooks").select(COLUMNS).eq("workspace_id", actor.workspaceId).not("owner_id", "is", null).order("created_at", { ascending: false });
  const rows = await openRows("webhooks", actor.workspaceId, (data ?? []) as Record<string, unknown>[]);
  if (!rows.length) return [];
  const ownerIds = [...new Set(rows.map((r) => String(r.owner_id)))];
  const [{ data: people }, lasts] = await Promise.all([
    db().from("profiles").select("id, name").in("id", ownerIds),
    // One small query per Webhook, so a busy one cannot push the others' last send out of a shared row limit.
    Promise.all(rows.map(async (r) => [String(r.id), (await db().from("webhook_sends").select("last_attempt_at").eq("workspace_id", actor.workspaceId).eq("webhook_id", String(r.id)).not("last_attempt_at", "is", null).order("last_attempt_at", { ascending: false }).limit(1)).data?.[0]?.last_attempt_at as string | undefined] as const)),
  ]);
  const names = new Map((await openNames(actor.workspaceId, people ?? [])).map((p) => [String(p.id), String(p.name ?? "")]));
  const last = new Map(lasts.filter(([, at]) => at).map(([id, at]) => [id, String(at)]));
  const now = Date.now();
  // Admins get the host only: some tools make a subdomain or the start of the path the secret, and what was sent is the person's.
  return rows.map((r) => ({ ...webhookInfo(r, now), address: maskedHost(String(r.url ?? "")), ownerId: String(r.owner_id), ownerName: names.get(String(r.owner_id)) ?? "", lastSendAt: last.get(String(r.id)) ?? null }));
}

/** The statuses and times of one Personal Webhook's sends, for Owners and Admins: never what was sent. */
export async function personalWebhookLogForAdmin(actor: Actor, id: string, limit = 50): Promise<WebhookLogEntry[]> {
  await assertAdminNow(actor);
  if (typeof id !== "string" || !UUID.test(id)) throw new Forbidden(NOT_FOUND);
  const { data } = await db().from("webhooks").select("id").eq("id", id.toLowerCase()).eq("workspace_id", actor.workspaceId).not("owner_id", "is", null).maybeSingle();
  if (!data) throw new Forbidden(NOT_FOUND);
  return logOf(actor.workspaceId, String(data.id), limit, false);
}

/** Removes someone's Personal Webhook (Owners and Admins). Its person is told through their Delivery Preference, naming who removed it, and the Audit Log has it. */
export async function removePersonalWebhook(actor: Actor, id: string): Promise<void> {
  await assertAdminNow(actor);
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

/** Writes the Audit Log entry, with its reason, for each Personal Webhook the database ended with its person's place in the
 * Workspace or with their account (personal_webhook_ends), and clears them. With a scope (a Workspace and a person, from
 * removing a member or making a Guest) it takes only that person's rows in that Workspace and attributes them to `by`, the
 * person who made the change; without one (the system's sweep) it takes what is waiting, in every Workspace, as Ziffr's
 * own. Best effort, as every Audit Log entry. */
export async function recordPersonalWebhookEnds(scope?: { workspaceId: string; personId: string; by: string }): Promise<void> {
  const q = db().from("personal_webhook_ends").select("webhook_id, workspace_id, owner_id, name, reason").order("ended_at").limit(500);
  const { data } = await (scope ? q.eq("workspace_id", scope.workspaceId).eq("owner_id", scope.personId) : q);
  for (const e of data ?? []) {
    // Taken first, so two runs record it once.
    const { data: taken } = await db().from("personal_webhook_ends").delete().eq("webhook_id", String(e.webhook_id)).select("webhook_id");
    if (!taken?.length) continue;
    await recordAudit(String(e.workspace_id), scope?.by ?? null, { kind: "webhook.personal_ended", object: { type: "webhook", id: String(e.webhook_id), name: String(e.name) }, details: { owner_id: String(e.owner_id), reason: String(e.reason) } });
  }
}
