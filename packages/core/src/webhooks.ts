// Webhooks (GLOSSARY: Webhook; spec 0034, ticket #399): an https address that a Workspace's Owner or Admin sets, with
// the events it gets. This module makes, lists, changes, switches and deletes them, Actor first; nothing is sent here
// (ticket 3). Security: only a signed-in Owner or Admin, never an Access Key, never the demo, never a Trial Workspace
// (a free trial that can make the server call any address is an abuse path). The address is checked as the shared
// outbound request checks it (outbound-request.ts; ZIFFR_WEBHOOK_PRIVATE_HOSTS is the operator's, never a Workspace's)
// and sealed with the Workspace Key with the secret (spec 0028); the secret is shown once and read back by nobody:
// every read here is masked. A Webhook of another Workspace is answered like one that is not there. Every change goes
// into the Audit Log and tells the other Owners.
import { randomBytes, randomUUID } from "node:crypto";
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { deliverNotice } from "./deliveries";
import { refuseInDemo } from "./demo";
import { mailHostResolver, privateAddress } from "./mail-hosts";
import { operatorPrivateHosts, outboundUrlProblem } from "./outbound-request";
import { openRows, sealRow } from "./sealed-columns";
import { trialEndsAt } from "./trials";
import { WEBHOOKS_PER_WORKSPACE, WEBHOOK_NAME_MAX, WEBHOOK_SECRET_OVERLAP_HOURS, WEBHOOK_URL_MAX } from "./webhook-limits";
import { isIP } from "node:net";

/** The events a Webhook may choose (spec 0034, "Events").  `alert.fired` is sent only for a Workflow's Tell step that names the Webhook, never for a personal Alert. */
export const WEBHOOK_EVENTS = ["action.created", "action.updated", "action.answered", "action.done", "value.recorded", "value.unusual", "alert.fired"] as const;
/** One event a Webhook may choose. */
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** A Webhook as an Owner or Admin reads it: the address masked, never the secret. */
export type WebhookInfo = {
  id: string;
  name: string;
  /** The host and the first characters of the path; the rest of an address may be a secret. */
  address: string;
  events: WebhookEvent[];
  enabled: boolean;
  disabledReason: "owner" | "failing" | "gone" | null;
  disabledAt: string | null;
  /** Whether the previous secret still signs beside the new one (24 hours after a replacement). */
  replacingSecret: boolean;
  createdAt: string;
};

/** The same words for a Webhook that is not there and one of another Workspace. */
const NOT_FOUND = "That Webhook was not found.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = "id, name, url, events, disabled_at, disabled_reason, secret_previous_until, created_at";

/** Refuses anyone but a signed-in Owner or Admin, and the demo (read-only). */
function assertManagesWebhooks(actor: Actor): void {
  if (actor.key) throw new Forbidden("A key cannot manage Webhooks.");
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins manage Webhooks.");
  refuseInDemo(actor);
}

/** Whether the actor may manage Webhooks, and so name one in a Workflow's Tell step: a signed-in Owner or Admin, not an
 * Access Key, not in the demo. A trial has none to name (they cannot be made there). */
export function mayManageWebhooks(actor: Actor): boolean {
  try { assertManagesWebhooks(actor); return true; } catch { return false; }
}

/** The host and the first characters of an address's path: enough to recognise it, not to use it. */
export function maskAddress(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.protocol}//${u.host}${path.length > 9 ? `${path.slice(0, 9)}…` : path}${u.search ? "…" : ""}`;
  } catch {
    return "";
  }
}

/** Less than the page shows, for the Audit Log and for notices that leave as email: the last two labels of the host
 * and nothing else, since some tools make the whole host (a subdomain) or the start of the path the secret. */
export function maskedHost(raw: string): string {
  try {
    const host = new URL(raw).hostname;
    const labels = host.split(".");
    return isIP(host.replace(/^\[|\]$/g, "")) || labels.length <= 2 ? host : `*.${labels.slice(-2).join(".")}`;
  } catch {
    return "";
  }
}

/** A name for people: one line, trimmed, never empty. */
function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new Error("Give the Webhook a name, such as the system it feeds.");
  if (name.length > WEBHOOK_NAME_MAX) throw new Error(`The name can have at most ${WEBHOOK_NAME_MAX} characters.`);
  return name;
}

/** The events chosen, checked: only known ones, each once; none is allowed (a Webhook gets nothing until chosen). */
function cleanEvents(raw: unknown): WebhookEvent[] {
  if (!Array.isArray(raw)) throw new Error("Choose the events as a list.");
  const out: WebhookEvent[] = [];
  for (const e of raw) {
    if (!WEBHOOK_EVENTS.includes(e as WebhookEvent)) throw new Error("That is not an event a Webhook can get.");
    if (!out.includes(e as WebhookEvent)) out.push(e as WebhookEvent);
  }
  return out;
}

/** The address, checked as the shared outbound request judges it, in words for people: https only, no user or
 * password, no fragment, at most 2,000 characters, and a name that resolves only to public addresses unless the
 * operator named that exact host. Judged again at every send (ticket 3). */
async function checkedAddress(raw: unknown): Promise<string> {
  if (typeof raw !== "string") throw new Error("That is not an address.");
  const text = raw.trim();
  if (!text) throw new Error("Give the address to send to.");
  if (text.length > WEBHOOK_URL_MAX) throw new Error(`The address can have at most ${WEBHOOK_URL_MAX} characters.`);
  // Control characters and spaces are never part of an address; a URL parser would quietly drop some of them.
  if (/[\u0000- \u007f]/.test(text)) throw new Error("That is not an address.");
  const privateHosts = operatorPrivateHosts();
  const problem = outboundUrlProblem(text, { privateHosts });
  if (problem) throw new Error(problem);
  const url = new URL(text);
  if (url.hash || text.includes("#")) throw new Error("The address cannot hold a fragment (#).");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!isIP(host) && !privateHosts.includes(host.toLowerCase().replace(/\.$/, ""))) {
    let found: { address: string }[] = [];
    try { found = await mailHostResolver.lookup(host); } catch { /* the same words as an empty answer */ }
    if (!found.length) throw new Error("That address's name could not be found.");
    if (found.some((a) => privateAddress(a.address))) throw new Error("That address is inside this server's own network.");
  }
  return url.toString();
}

/** A new secret: `whsec_` and 32 random bytes. */
const newSecret = () => `whsec_${randomBytes(32).toString("base64url")}`;

/** Tells the other Owners that a Webhook changed, since it changes where the Workspace's data goes. Best effort: the
 * change has happened, so a failed notice never undoes it. The address is masked as everywhere else. */
async function tellOwners(actor: Actor, what: string, name: string, address: string): Promise<void> {
  try {
    const { data } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).eq("role", "owner");
    for (const o of data ?? []) {
      if (o.user_id === actor.personId) continue;
      await deliverNotice(actor.workspaceId, { recipientId: String(o.user_id), senderId: actor.personId, subject: `Webhook ${what}: ${name}`, text: `The Webhook "${name}" (${address}) was ${what}.`, link: "/settings/webhooks" });
    }
  } catch (e) {
    console.error("Webhooks: could not tell the Owners:", (e as Error).message);
  }
}

/** One Webhook of the Workspace, its address opened and masked, or the refusal that does not say whether it exists. */
async function find(actor: Actor, id: unknown): Promise<{ row: Record<string, unknown>; address: string }> {
  if (typeof id !== "string" || !UUID.test(id)) throw new Forbidden(NOT_FOUND);
  const { data } = await db().from("webhooks").select(COLUMNS).eq("id", id.toLowerCase()).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data) throw new Forbidden(NOT_FOUND);
  const [row] = await openRows("webhooks", actor.workspaceId, [data as Record<string, unknown>]);
  return { row, address: maskedHost(String(row.url ?? "")) };
}

/** Makes a Webhook (Owners and Admins; not in a Trial Workspace or the demo) and returns its id and its secret, which
 * is shown this once and never read back. The limit is checked in the database under a lock. */
export async function createWebhook(actor: Actor, input: { name: string; url: string; events?: string[] }): Promise<{ id: string; secret: string }> {
  assertManagesWebhooks(actor);
  if (typeof input !== "object" || input === null) throw new Error("That is not a Webhook.");
  if (await trialEndsAt(actor.workspaceId)) throw new Forbidden("A trial cannot have Webhooks: they send Workspace data to addresses outside Ziffr.");
  const name = cleanName(input.name);
  const events = cleanEvents(input.events ?? []);
  const url = await checkedAddress(input.url);
  const id = randomUUID();
  const secret = newSecret();
  const sealed = await sealRow("webhooks", actor.workspaceId, { id, url, secret });
  const { data, error } = await db().rpc("create_webhook", { p_id: id, p_ws: actor.workspaceId, p_name: name, p_url: sealed.url, p_secret: sealed.secret, p_events: events, p_by: actor.personId, p_max: WEBHOOKS_PER_WORKSPACE });
  if (error || typeof data !== "string") {
    console.error("create_webhook failed:", error?.message ?? "no answer");
    throw new Error("The Webhook could not be saved. Try again in a moment.");
  }
  if (data === "trial") throw new Forbidden("A trial cannot have Webhooks: they send Workspace data to addresses outside Ziffr.");
  if (data === "limit") throw new Error(`This Workspace already has ${WEBHOOKS_PER_WORKSPACE} Webhooks, the most it may. Delete one to add another.`);
  const address = maskedHost(url);
  await audit(actor, { kind: "webhook.created", object: { type: "webhook", id, name }, details: { address, events } });
  await tellOwners(actor, "added", name, address);
  return { id, secret };
}

/** The Workspace's Webhooks, newest first, the address masked and no secret (Owners and Admins). */
export async function listWebhooks(actor: Actor): Promise<WebhookInfo[]> {
  assertManagesWebhooks(actor);
  const { data } = await db().from("webhooks").select(COLUMNS).eq("workspace_id", actor.workspaceId).order("created_at", { ascending: false });
  const rows = await openRows("webhooks", actor.workspaceId, (data ?? []) as Record<string, unknown>[]);
  const now = Date.now();
  return rows.map((r) => ({
    id: String(r.id), name: String(r.name), address: maskAddress(String(r.url ?? "")), events: (r.events as WebhookEvent[]) ?? [],
    enabled: !r.disabled_at, disabledReason: (r.disabled_reason as WebhookInfo["disabledReason"]) ?? null, disabledAt: (r.disabled_at as string | null) ?? null,
    replacingSecret: !!r.secret_previous_until && new Date(String(r.secret_previous_until)).getTime() > now,
    createdAt: String(r.created_at),
  }));
}

/** Changes a Webhook's name or the events it gets (Owners and Admins). */
export async function updateWebhook(actor: Actor, id: string, change: { name?: string; events?: string[] }): Promise<void> {
  assertManagesWebhooks(actor);
  if (typeof change !== "object" || change === null) throw new Error("That is not a change to a Webhook.");
  const { row, address } = await find(actor, id);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (change.name !== undefined) patch.name = cleanName(change.name);
  if (change.events !== undefined) patch.events = cleanEvents(change.events);
  const { data: changed, error } = await db().from("webhooks").update(patch).eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).select("id");
  if (error) throw new Error("The Webhook could not be saved. Try again in a moment.");
  if (!changed?.length) throw new Forbidden(NOT_FOUND);
  const name = String(patch.name ?? row.name);
  await audit(actor, { kind: "webhook.changed", object: { type: "webhook", id: String(row.id), name }, details: { address, ...(patch.events ? { events: patch.events as string[] } : {}), ...(patch.name ? { from: String(row.name) } : {}) } });
  await tellOwners(actor, "changed", name, address);
}

/** Replaces a Webhook's secret (Owners and Admins) and returns the new one, shown this once. For 24 hours the old one
 * still signs beside it, so the receiver switches without a gap; replacing again within them ends the older one at
 * once, since only one previous secret is kept. */
export async function replaceWebhookSecret(actor: Actor, id: string): Promise<{ secret: string }> {
  assertManagesWebhooks(actor);
  const { row, address } = await find(actor, id);
  const { data } = await db().from("webhooks").select("secret").eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  const [current] = await openRows("webhooks", actor.workspaceId, data ? [{ id: String(row.id), secret: data.secret as string }] : []);
  // A secret that does not open cannot go on signing: the new one stands alone.
  const old = typeof current?.secret === "string" && current.secret.startsWith("whsec_") ? current.secret : null;
  const secret = newSecret();
  const sealed = await sealRow("webhooks", actor.workspaceId, { id: String(row.id), secret, secret_previous: old });
  const until = new Date(Date.now() + WEBHOOK_SECRET_OVERLAP_HOURS * 3_600_000).toISOString();
  const { data: updated, error } = await db().from("webhooks").update({ secret: sealed.secret, secret_previous: old ? sealed.secret_previous : null, secret_previous_until: old ? until : null, updated_at: new Date().toISOString() }).eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).eq("secret", String(data?.secret)).select("id");
  if (error) throw new Error("The secret could not be replaced. Try again in a moment.");
  // Replaced at the same moment by someone else (or deleted): the secret shown here would never sign, so none is shown.
  if (!updated?.length) throw new Error("The Webhook changed at the same moment. Look at it again and replace the secret once more.");
  await audit(actor, { kind: "webhook.secret_replaced", object: { type: "webhook", id: String(row.id), name: String(row.name) }, details: { address } });
  await tellOwners(actor, "given a new secret", String(row.name), address);
  return { secret };
}

/** Switches a Webhook on or off (Owners and Admins). Off keeps it and stops what is sent; on again resends nothing. */
export async function setWebhookEnabled(actor: Actor, id: string, enabled: boolean): Promise<void> {
  assertManagesWebhooks(actor);
  if (typeof enabled !== "boolean") throw new Error("A Webhook is switched on or off.");
  const { row, address } = await find(actor, id);
  if (!!row.disabled_at === !enabled) return;
  const patch = enabled ? { disabled_at: null, disabled_reason: null, failing_since: null, failure_count: 0 } : { disabled_at: new Date().toISOString(), disabled_reason: "owner" };
  const { data: changed, error } = await db().from("webhooks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).select("id");
  if (error) throw new Error("The Webhook could not be saved. Try again in a moment.");
  if (!changed?.length) throw new Forbidden(NOT_FOUND);
  // Off drops what waits to be sent, so that switching on again resends nothing.
  if (!enabled) await db().from("webhook_sends").update({ state: "dropped", claimed_at: null }).eq("webhook_id", String(row.id)).eq("workspace_id", actor.workspaceId).in("state", ["queued", "retrying"]);
  await audit(actor, { kind: enabled ? "webhook.switched_on" : "webhook.switched_off", object: { type: "webhook", id: String(row.id), name: String(row.name) }, details: { address } });
  await tellOwners(actor, enabled ? "switched on" : "switched off", String(row.name), address);
}

/** Deletes a Webhook (Owners and Admins): nothing more is sent to it. */
export async function deleteWebhook(actor: Actor, id: string): Promise<void> {
  assertManagesWebhooks(actor);
  const { row, address } = await find(actor, id);
  const { data, error } = await db().from("webhooks").delete().eq("id", String(row.id)).eq("workspace_id", actor.workspaceId).select("id");
  if (error) throw new Error("The Webhook could not be removed. Try again in a moment.");
  if (!data?.length) throw new Forbidden(NOT_FOUND);
  await audit(actor, { kind: "webhook.deleted", object: { type: "webhook", id: String(row.id), name: String(row.name) }, details: { address } });
  await tellOwners(actor, "deleted", String(row.name), address);
}
