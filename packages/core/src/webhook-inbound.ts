// Status back into Ziffr (GLOSSARY: Webhook; spec 0034, ticket #402): a Webhook's recipe reports, signed with the
// Webhook's own secret, that an external task is an Action (`link`), is done (`done`), was replied to (`reply`),
// answers a Question (`answer`) or was un-ticked (`reopen`). Ziffr stays the single source of truth: every change goes
// through `changeActionState` (or the reply the app itself uses) with the Webhook as its origin, so it is one event to
// every Webhook, the origin's included and marked, and the answer says `changed: false` for what was already so.
// SECURITY: all of it comes from outside. The request is judged in this order and refused alike (404) without a hint
// whether the Webhook exists: a well-formed id, the Webhook is on, the timestamp is fresh, the signature matches one of
// its secrets in constant time, then the request is claimed once by its timestamp and body (what the signature covers,
// so a replay with a padded or reordered header still changes nothing) within 60 requests a minute. Only then is the body read as JSON, field by field. A leaked secret reaches only Actions that were sent to that
// Webhook, whose Metric the assignee can still see; it reads nothing back but `changed` and `status`, creates, reassigns
// and records no value. Words it sends are plain text: never a command (an Approval or Self-check is refused), never a
// value or a Correction. Nothing in a refusal repeats what was sent.
import { createHash, randomUUID } from "node:crypto";
import type { Actor, WebhookActor } from "./actor";
import { personalWebhookMayHear } from "./personal-webhook-hearing";
import { PERSONAL_WEBHOOK_ROLES, personalWebhookMayRun } from "./personal-webhook-state";
import { webhookRules } from "./webhook-trial";
import { visibleMetricIds } from "./access";
import { recordAudit } from "./audit-log";
import { db } from "./db";
import { refFor } from "./deliveries";
import { changeActionState } from "./action-state";
import { insertSealed, openNames, openRows, sealRow } from "./sealed-columns";
import { finishTask, postReply } from "./threads";
import { workspaceCipher } from "./workspace-keys";
import { getMetrics } from "./workspace-data";
import { WEBHOOK_EXTERNAL_IDS_PER_ACTION, WEBHOOK_INBOUND_PER_MINUTE } from "./webhook-limits";
import { verifyWebhookSignature } from "./webhook-send";
import type { ChangeSource } from "./webhook-events";

/** Why a request was not taken: `invalid` (400, the shape is wrong), `not_found` (404, no such Action here for this
 * Webhook) or `conflict` (409, the rules do not allow it, such as marking a Question done). */
export class WebhookRequestError extends Error {
  constructor(readonly code: "invalid" | "not_found" | "conflict", message: string) {
    super(message);
    this.name = "WebhookRequestError";
  }
}

/** What an inbound call answers: whether Ziffr changed anything, and the Action's status afterwards. */
export type InboundResult = { changed: boolean; status: "open" | "answered" | "closed" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYSTEM = /^[A-Za-z0-9-]{1,40}$/;
const REF = /^ZIF-([1-9]\d{0,8})$/;
/** Control characters other than a line break or tab: never part of what a person typed. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const TEXT_MAX = 1_000;
const EXTERNAL_ID_MAX = 200;
const URL_MAX = 500;

/** A request as the route read it: the raw body (exactly what was signed) and the two headers. */
export type InboundRequest = { timestamp: string | null; signature: string | null; body: string };

/** Judges one request to a Webhook's address and, when it is signed, fresh, not a replay and within the rate, names who
 * is calling. Everything else answers `not_found`, so the route says 404 alike for an unknown id, an off Webhook, a
 * missing or wrong signature, an old timestamp and a replay; `limit` only for a caller that proved the secret. */
export async function authenticateWebhookRequest(webhookId: string, req: InboundRequest): Promise<{ ok: true; actor: WebhookActor } | { ok: false; why: "not_found" | "no_such" | "limit" }> {
  const no = { ok: false, why: "not_found" } as const;
  // `no_such`: no Webhook that is on has this id. The route answers it 404 like the rest; it only keeps the gate from counting made-up ids against a real Webhook.
  const noSuch = { ok: false, why: "no_such" } as const;
  if (!UUID.test(webhookId)) return noSuch;
  const { data } = await db().from("webhooks").select("id, workspace_id, owner_id, name, url, secret, secret_previous, secret_previous_until, disabled_at").eq("id", webhookId.toLowerCase()).maybeSingle();
  if (!data || data.disabled_at) return noSuch;
  const ws = data.workspace_id as string;
  const [hook] = await openRows("webhooks", ws, [data as Record<string, unknown>]);
  const secrets: string[] = [];
  if (typeof hook.secret === "string" && hook.secret.startsWith("whsec_")) secrets.push(hook.secret);
  if (hook.secret_previous_until && new Date(String(hook.secret_previous_until)).getTime() > Date.now() && typeof hook.secret_previous === "string" && hook.secret_previous.startsWith("whsec_")) secrets.push(hook.secret_previous);
  if (!secrets.length || !verifyWebhookSignature(secrets, req.timestamp, req.body, req.signature)) return no;
  // A trial whose Webhooks are switched off, or that has ended, takes nothing back either (spec 0037). Asked only of a
  // signed request, so strangers cost nothing; a failed read answers like the rest.
  const allowed = await webhookRules(ws).then((r) => r.allowed, () => false);
  if (!allowed) return noSuch;
  // A Personal Webhook acts as its person only while the Workspace's switch is on and the person is still an Owner, Admin or Member (spec 0037); judged again at every request, after the signature.
  const owner = typeof data.owner_id === "string" ? data.owner_id : null;
  if (owner && !(await personalWebhookMayRun(ws, owner))) return noSuch;
  const { data: claim, error } = await db().rpc("claim_webhook_inbound", { p_ws: ws, p_webhook: data.id, p_delivery: createHash("sha256").update(`${req.timestamp}.${req.body}`).digest("hex"), p_max: WEBHOOK_INBOUND_PER_MINUTE });
  if (error || typeof claim !== "string") throw new Error("The request could not be taken. Try again in a moment.");
  if (claim === "limit") return { ok: false, why: "limit" };
  if (claim !== "ok") return no;
  // A Personal Webhook's name carries its person's: the Thread, the hourly limit and the repeat check all go by this label, so one that is named like a Workspace Webhook neither blocks it nor passes for it.
  let name = String(data.name).slice(0, 80);
  if (owner) {
    const { data: p } = await db().from("profiles").select("id, name").eq("id", owner).maybeSingle();
    const who = p ? String((await openNames(ws, [p]))[0].name ?? "").trim().slice(0, 20) : "";
    // Fits the Thread's 80 characters whatever the name, and ends in the Webhook's own id so two of the same name never share a label or an hourly count.
    const suffix = ` (${who ? `${who}'s` : "personal"} Webhook ${String(data.id).slice(0, 4)})`;
    name = String(data.name).slice(0, Math.max(1, 80 - suffix.length)) + suffix;
  }
  return { ok: true, actor: { webhookId: String(data.id), workspaceId: ws, webhook: true, name, ...(owner ? { owner } : {}) } };
}

type ActionRow = { id: number; kind: "task" | "question"; status: "open" | "answered" | "closed"; purpose: string | null; asker_id: string; assignee_id: string; metric_id: number };

/** The blind index of a Webhook's external task, under the current key and under every version the Workspace has. */
async function hashes(ws: string, webhookId: string, system: string, externalId: string): Promise<{ current: string; all: string[] }> {
  const cipher = await workspaceCipher(ws);
  const value = `${webhookId}\0${system}\0${Buffer.from(externalId, "utf8").toString("hex")}`;
  const all = cipher.blindIndexes("webhook_external_ids.external_id", value);
  const current = cipher.blindIndex("webhook_external_ids.external_id", value) ?? `p1.${createHash("sha256").update(value).digest("hex")}`;
  return { current, all: [...new Set([current, ...all])] };
}

const plain = (v: unknown, name: string, max: number): string => {
  if (typeof v !== "string") throw new WebhookRequestError("invalid", `${name} must be text.`);
  const t = v.replace(CONTROL, "").trim();
  if (!t || t.length > max) throw new WebhookRequestError("invalid", `${name} must have 1 to ${max} characters.`);
  return t;
};

/** The Action a call is about: by `ref`, or by the system and external id this Webhook linked. Only one that was sent to
 * this Webhook, and whose Metric its assignee can still see; anything else is the same `not_found`. */
async function actionOf(actor: WebhookActor, input: Record<string, unknown>): Promise<ActionRow> {
  const ws = actor.workspaceId;
  let id: number | null = null;
  if (input.ref !== undefined) {
    const m = typeof input.ref === "string" ? REF.exec(input.ref.trim()) : null;
    if (!m) throw new WebhookRequestError("invalid", "ref must look like ZIF-123.");
    id = Number(m[1]);
  } else if (input.system !== undefined || input.external_id !== undefined) {
    const system = plain(input.system, "system", 40);
    if (!SYSTEM.test(system)) throw new WebhookRequestError("invalid", "system can have letters, digits and dashes, at most 40.");
    const h = await hashes(ws, actor.webhookId, system, plain(input.external_id, "external_id", EXTERNAL_ID_MAX));
    const { data } = await db().from("webhook_external_ids").select("action_id").eq("webhook_id", actor.webhookId).eq("workspace_id", ws).eq("system", system).in("external_hash", h.all).limit(1).maybeSingle();
    id = (data?.action_id as number | undefined) ?? null;
  } else throw new WebhookRequestError("invalid", "Name the Action by ref, or by system and external_id.");
  const gone = new WebhookRequestError("not_found", "There is no such Action for this Webhook.");
  if (id === null) throw gone;
  const { data } = await db().from("actions").select("id, kind, status, purpose, asker_id, assignee_id, metric_id").eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!data) throw gone;
  // Only what was sent to this Webhook: a leaked secret reaches no further (a send still in flight counts: the recipe may answer first).
  // A link this Webhook made counts as proof too: the log of sends is pruned after 14 days, the link is not.
  const [{ data: sent }, { data: linked }] = await Promise.all([
    db().from("webhook_sends").select("id").eq("webhook_id", actor.webhookId).eq("workspace_id", ws).eq("action_id", id).in("state", ["delivered", "sending"]).limit(1),
    db().from("webhook_external_ids").select("action_id").eq("webhook_id", actor.webhookId).eq("workspace_id", ws).eq("action_id", id).limit(1),
  ]);
  if (!sent?.length && !linked?.length) throw gone;
  const row = data as ActionRow;
  if (actor.owner) {
    // A Personal Webhook acts as its person, who must still see this Action as the app shows it to them (their role, the
    // Metric, the Thread's limits: the same check that decides what the Webhook hears), and it is theirs to answer for.
    const { data: m } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", actor.owner).maybeSingle();
    if (!m || !(PERSONAL_WEBHOOK_ROLES as readonly string[]).includes(String(m.role))) throw gone;
    const person = { personId: actor.owner, workspaceId: ws, role: m.role } as Actor;
    if (!(await personalWebhookMayHear(person, { type: "action.updated", actionId: id }))) throw gone;
    // No second rule: the app lets the people on a Thread read it and answer it (markTaskDone, reply) whether or not they
    // still see its Metric, so the Webhook that acts as the person does the same, no more and no less.
    return row;
  }
  // The assignee is still a Member or a Contact of this Workspace and still sees the Metric.
  const [{ data: member }, { data: contact }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", ws).eq("user_id", row.assignee_id).maybeSingle(),
    db().from("contacts").select("person_id").eq("workspace_id", ws).eq("person_id", row.assignee_id).maybeSingle(),
  ]);
  if (!member && !contact) throw gone;
  const visible = await visibleMetricIds(ws, row.assignee_id, await getMetrics(ws));
  if (!visible.has(row.metric_id)) throw gone;
  return row;
}

const statusOf = async (ws: string, id: number) => ((await db().from("actions").select("status").eq("id", id).eq("workspace_id", ws).maybeSingle()).data?.status ?? "open") as InboundResult["status"];

/** Why a closed Task may not be reopened from outside: the system closed it (an archived Metric, a person who left, a
 * closing Workspace), by what its sends recorded (any Webhook that heard it) or what is true now; there is no one to do it. */
async function closedBySystem(ws: string, row: ActionRow): Promise<boolean> {
  const [{ data: sends }, { data: metric }] = await Promise.all([
    db().from("webhook_sends").select("id").eq("workspace_id", ws).eq("action_id", row.id).in("reason", ["metric_archived", "metric_deleted", "assignee_left", "workspace_closing"]).limit(1),
    db().from("metrics").select("archived_at").eq("id", row.metric_id).eq("workspace_id", ws).maybeSingle(),
  ]);
  return !!sends?.length || !metric || !!metric.archived_at;
}

/** Most things a Webhook may add to one Action's Thread in an hour (done, reopen, reply and answer each leave one), so a
 * leaked secret cannot flip a Task or fill a Thread to pester the people on it. */
const THREAD_PER_HOUR = 10;
const busy = async (ws: string, actionId: number, webhookId: string) =>
  ((await db().from("thread_messages").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("action_id", actionId).eq("via_webhook_id", webhookId).gt("created_at", new Date(Date.now() - 3_600_000).toISOString())).count ?? 0) >= THREAD_PER_HOUR;

/** A line in the Thread saying which Webhook did something that has no text of its own ("Marked done in To Do"). */
async function note(ws: string, row: ActionRow, by: string, text: string, via: string, viaWebhookId: string): Promise<void> {
  await insertSealed("thread_messages", ws, [{ action_id: row.id, author_id: by, body: text, correction_value: null, correction_status: null, via, via_webhook_id: viaWebhookId }]);
}

const audited = (actor: WebhookActor, kind: "webhook.marked_done" | "webhook.replied" | "webhook.answered" | "webhook.reopened", ref: string) =>
  recordAudit(actor.workspaceId, null, { kind, object: { type: "webhook", id: actor.webhookId, name: actor.name }, details: { ref, ...(actor.owner ? { owner_id: actor.owner } : {}) } }, `Webhook ${actor.name}`);

/** Does what a Webhook's recipe asks, as the Webhook, for one Action that was sent to it (spec 0034, "Status back into
 * Ziffr"). `input` is untrusted: `op` is `link` (`ref`, `system`, `external_id`, `url?`), `done`, `reopen`, `reply` or `answer`
 * (`text`), the Action named by `ref` or by a `system` and `external_id` linked before. Answers whether anything changed and
 * the status afterwards, so a recipe may repeat any call; throws a WebhookRequestError for what is not allowed. */
export async function applyWebhookAction(actor: WebhookActor, input: unknown): Promise<InboundResult> {
  if (typeof input !== "object" || input === null || Array.isArray(input) || !actor.webhook) throw new WebhookRequestError("invalid", "The request must be a JSON object.");
  const i = input as Record<string, unknown>;
  const op = i.op;
  if (op !== "link" && op !== "done" && op !== "reply" && op !== "answer" && op !== "reopen") throw new WebhookRequestError("invalid", "op must be link, done, reply, answer or reopen.");
  const ws = actor.workspaceId;
  const source: ChangeSource = { type: "webhook", webhookId: actor.webhookId };
  const plainOnly = (row: ActionRow) => {
    // An Approval or a Self-check is decided by its own words, which a Webhook never speaks.
    if (row.purpose !== null && row.purpose !== "escalation") throw new WebhookRequestError("conflict", "A Webhook cannot act on an Approval or a Self-check.");
  };
  const ref = (row: ActionRow) => refFor(row.id);

  if (op === "link") {
    // A link names the Action by its ref only: the external id it brings is the one being set.
    const row = await actionOf(actor, { ref: i.ref });
    const system = plain(i.system, "system", 40);
    if (!SYSTEM.test(system)) throw new WebhookRequestError("invalid", "system can have letters, digits and dashes, at most 40.");
    const externalId = plain(i.external_id, "external_id", EXTERNAL_ID_MAX);
    let url: string | null = null;
    if (i.url !== undefined && i.url !== null) {
      const u = plain(i.url, "url", URL_MAX);
      let parsed: URL;
      try { parsed = new URL(u); } catch { throw new WebhookRequestError("invalid", "url must be an https address."); }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || /[\s]/.test(u)) throw new WebhookRequestError("invalid", "url must be an https address.");
      url = parsed.toString();
    }
    const h = await hashes(ws, actor.webhookId, system, externalId);
    const { data: had } = await db().from("webhook_external_ids").select("id, external_id, url").eq("webhook_id", actor.webhookId).eq("workspace_id", ws).eq("action_id", row.id).eq("system", system).maybeSingle();
    if (had) {
      const [open] = await openRows("webhook_external_ids", ws, [had as Record<string, unknown>]);
      if (open.external_id === externalId && (open.url ?? null) === url) return { changed: false, status: row.status };
    }
    const id = randomUUID();
    const sealed = await sealRow("webhook_external_ids", ws, { id, external_id: externalId, url });
    const { data, error } = await db().rpc("link_webhook_external", { p_id: id, p_ws: ws, p_webhook: actor.webhookId, p_action: row.id, p_system: system, p_external: sealed.external_id, p_url: sealed.url, p_hash: h.current, p_hashes: h.all, p_max: WEBHOOK_EXTERNAL_IDS_PER_ACTION });
    if (error || typeof data !== "string") throw new Error("The link could not be saved. Try again in a moment.");
    if (data === "taken") throw new WebhookRequestError("conflict", "That external task is already linked to another Action.");
    if (data === "limit") throw new WebhookRequestError("conflict", `An Action can be linked to at most ${WEBHOOK_EXTERNAL_IDS_PER_ACTION} external tasks.`);
    return { changed: true, status: row.status };
  }

  const row = await actionOf(actor, i);
  // Whose words and changes these are: the Webhook's person, or for a Workspace Webhook the Action's assignee. A person
  // who only asked the Action may reply to it, not finish or answer it for the assignee.
  const by = actor.owner ?? row.assignee_id;
  if (op !== "reply" && by !== row.assignee_id) throw new WebhookRequestError("not_found", "There is no such Action for this Webhook.");
  if (await busy(ws, row.id, actor.webhookId)) throw new WebhookRequestError("conflict", "Too many changes to this Action in the last hour.");

  if (op === "done") {
    if (row.kind !== "task") throw new WebhookRequestError("conflict", "A Question is answered, not marked done.");
    plainOnly(row);
    if (row.status !== "open") return { changed: false, status: row.status };
    const changed = await finishTask(ws, row.id, by, source);
    if (changed) { await audited(actor, "webhook.marked_done", ref(row)); await note(ws, row, by, `Marked done in ${actor.name}`, actor.name, actor.webhookId); }
    return { changed, status: await statusOf(ws, row.id) };
  }

  if (op === "reopen") {
    if (row.kind !== "task") throw new WebhookRequestError("conflict", "A Question cannot be reopened from outside.");
    plainOnly(row);
    // Only a Task marked done is reopened; one closed by the asker, or by the system, stays closed.
    if (row.status !== "answered") return { changed: false, status: row.status };
    if (await closedBySystem(ws, row)) throw new WebhookRequestError("conflict", "Ziffr closed this Task itself; it cannot be reopened from outside.");
    const r = await changeActionState(ws, row.id, { to: "open", from: ["answered"], guard: { kind: "task", assigneeId: row.assignee_id, purpose: "plain_or_escalation" } }, source);
    if (r.refused) throw new WebhookRequestError("conflict", "This Task cannot be reopened.");
    if (r.changed) { await audited(actor, "webhook.reopened", ref(row)); await note(ws, row, by, `Reopened in ${actor.name}`, actor.name, actor.webhookId); }
    return { changed: r.changed, status: r.status ?? row.status };
  }

  // reply and answer: words only, and never into a closed Action.
  plainOnly(row);
  if (row.status === "closed") return { changed: false, status: row.status };
  const text = plain(i.text, "text", TEXT_MAX);
  if (op === "answer") {
    if (row.kind !== "question") throw new WebhookRequestError("conflict", "Only a Question is answered; mark a Task done instead.");
    if (row.status !== "open") return { changed: false, status: row.status };
    // The text is never parsed (no Correction, no command): `correction` is null and an Approval was refused above.
    await postReply(ws, row.id, by, text, null, source, false, { via: actor.name, viaWebhookId: actor.webhookId });
    await audited(actor, "webhook.answered", ref(row));
    return { changed: true, status: await statusOf(ws, row.id) };
  }
  // A repeat of the last message, said the same way by the same Webhook, adds nothing.
  const { data: last } = await db().from("thread_messages").select("id, body, via_webhook_id, author_id").eq("action_id", row.id).eq("workspace_id", ws).order("id", { ascending: false }).limit(1).maybeSingle();
  if (last) {
    const [open] = await openRows("thread_messages", ws, [last as Record<string, unknown>]);
    if (open.body === text && open.via_webhook_id === actor.webhookId && open.author_id === by) return { changed: false, status: row.status };
  }
  await postReply(ws, row.id, by, text, null, source, false, { via: actor.name, viaWebhookId: actor.webhookId, keepState: true });
  await audited(actor, "webhook.replied", ref(row));
  return { changed: true, status: await statusOf(ws, row.id) };
}
