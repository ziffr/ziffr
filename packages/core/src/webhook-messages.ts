// The messages a Webhook is sent (GLOSSARY: Webhook; spec 0034, "Events"): one JSON object, the same shape for every
// event, built from facts the caller loaded for the moment of sending. Pure. SECURITY (AGENTS.md rule 3): `data` holds
// only what the event needs and nothing a Member could not see; an Action whose words are not Everyone's goes out
// redacted (webhookMayHear in visibility.ts decides which), with the structure only: never the words of its question or
// Thread, never a Breakdown, Contact, Share list or a name other than the assignee's and (in full) the asker's. The
// published schema (docs/reference/webhook-events.schema.json) is generated from the definitions below.
import type { ChangeSource, DoneReason } from "./webhook-events";

/** Longest title of an Action in a message, in characters. */
export const TITLE_MAX = 200;
/** Longest reply text in a message, in characters. */
export const REPLY_MAX = 1_000;

/** The kinds of source a change has, for the schema. */
export const SOURCE_TYPES = ["app", "api", "mcp", "email", "slack", "telegram", "web_form", "ticket_system", "workflow", "system", "webhook"] as const;
/** The reasons an Action is done, for the schema. */
export const DONE_REASONS = ["done", "answered", "closed", "metric_archived", "metric_deleted", "assignee_left", "workspace_closing"] as const;

/** A person as the receiving system finds them: by the address, as the ticket-system Connector does. */
export type PersonFacts = { id: string; name: string; email: string | null };
/** An external task an Action is linked to by this Webhook (ticket 5 fills them; each Webhook gets only its own). */
export type ExternalId = { system: string; external_id: string; url: string | null };

/** What an Action message is built from; the words are already opened. */
export type ActionFacts = {
  ref: string; kind: "task" | "question"; status: "open" | "answered" | "closed"; title: string; due: string | null;
  metric: { id: number; name: string }; period: string; assignee: PersonFacts; askerName: string; link: string; updatedAt: string;
};

/** What every message has besides its facts. */
export type MessageEnvelope = { eventId: string; createdAt: string; workspaceId: string; source: ChangeSource; reason: DoneReason | null; replyText: string | null; externalIds: ExternalId[] };

/** A message as sent. */
export type WebhookMessage = { id: string; type: string; created_at: string; workspace?: { id: string }; data: Record<string, unknown> };

/** A message's source as it goes out: the kind, and the Webhook's own id for `webhook`; nothing about a person. */
export const sourceOf = (s: ChangeSource) => (s.type === "webhook" ? { type: s.type, webhook_id: s.webhookId } : { type: s.type });

const cut = (text: string, max: number) => (text.length > max ? `${Array.from(text).slice(0, max - 1).join("")}…` : text);
const person = (p: PersonFacts) => ({ id: p.id, name: p.name, email: p.email });

/** An Action event. Redacted, it has the structure only (ref, kind, status, due, assignee, updated_at, link) with
 * `redacted: true`, and also `source`, `reason` and `external_ids`, which hold no words of the Workspace's and which a
 * receiver needs to act (to ignore its own echo, to close the right external task); a full one adds the words. */
export function buildActionMessage(type: "action.created" | "action.updated" | "action.answered" | "action.done", hearing: "full" | "redacted", a: ActionFacts, env: MessageEnvelope): WebhookMessage {
  const structure = { ref: a.ref, kind: a.kind, status: a.status, due: a.due, assignee: person(a.assignee), link: a.link, updated_at: a.updatedAt, source: sourceOf(env.source), external_ids: env.externalIds, ...(type === "action.done" && env.reason ? { reason: env.reason } : {}) };
  const data = hearing === "redacted"
    ? { ...structure, redacted: true }
    : { ...structure, title: cut(a.title, TITLE_MAX), metric: a.metric, period: a.period, asker: { name: a.askerName }, ...(env.replyText ? { reply: { text: cut(env.replyText, REPLY_MAX) } } : {}) };
  return { id: env.eventId, type, created_at: env.createdAt, workspace: { id: env.workspaceId }, data };
}

/** `value.recorded`: the Metric, the period, the value and the target as text, and a link; only for a Metric Everyone sees. */
export function buildValueRecordedMessage(f: { metric: { id: number; name: string }; period: string; value: string; target: string | null; link: string }, env: Pick<MessageEnvelope, "eventId" | "createdAt" | "workspaceId">): WebhookMessage {
  return { id: env.eventId, type: "value.recorded", created_at: env.createdAt, workspace: { id: env.workspaceId }, data: { metric: f.metric, period: f.period, value: f.value, target: f.target, link: f.link } };
}

/** `value.unusual`: it carries no value (a number its Approver may send back is a rumour): the Metric, the period and a
 * link. A Personal Webhook (spec 0037) adds `value` as text, only when its person may see a value waiting for Approval. */
export function buildValueUnusualMessage(f: { metric: { id: number; name: string }; period: string; link: string; value?: string }, env: Pick<MessageEnvelope, "eventId" | "createdAt" | "workspaceId">): WebhookMessage {
  return { id: env.eventId, type: "value.unusual", created_at: env.createdAt, workspace: { id: env.workspaceId }, data: { metric: f.metric, period: f.period, ...(f.value !== undefined ? { value: f.value } : {}), link: f.link } };
}

/** The condition of a Tell step as a message says it: the kind and its level (a number as plain decimal text; for the
 * shares, a percentage). */
export type AlertFiredCondition = { kind: "share_of_target" | "at_or_above" | "below" | "changed_more"; level: string };

/** `alert.fired`: what an Alert's message says and nothing more: the Metric, the period, the value and the target as
 * text, the condition that became true and a link. Only for a Metric Everyone sees, and only through a Tell step. */
export function buildAlertFiredMessage(f: { metric: { id: number; name: string }; period: string; value: string; target: string | null; condition: AlertFiredCondition; link: string }, env: Pick<MessageEnvelope, "eventId" | "createdAt" | "workspaceId">): WebhookMessage {
  return { id: env.eventId, type: "alert.fired", created_at: env.createdAt, workspace: { id: env.workspaceId }, data: { metric: f.metric, period: f.period, value: f.value, target: f.target, condition: { kind: f.condition.kind, level: f.condition.level }, link: f.link } };
}

/** `ping`, for the test button: the Webhook's name and nothing of the Workspace. */
export function buildPingMessage(webhookName: string, env: Pick<MessageEnvelope, "eventId" | "createdAt">): WebhookMessage {
  return { id: env.eventId, type: "ping", created_at: env.createdAt, data: { webhook: { name: webhookName } } };
}

const str = { type: "string" } as const;
const nullable = (s: object) => ({ anyOf: [s, { type: "null" }] });
const person_ = { type: "object", required: ["id", "name", "email"], properties: { id: str, name: str, email: nullable(str) }, additionalProperties: false } as const;
const metric_ = { type: "object", required: ["id", "name"], properties: { id: { type: "integer" }, name: str }, additionalProperties: false } as const;
const source_ = { type: "object", required: ["type"], properties: { type: { enum: [...SOURCE_TYPES] }, webhook_id: str }, additionalProperties: false } as const;
const external_ = { type: "object", required: ["system", "external_id", "url"], properties: { system: str, external_id: str, url: nullable(str) }, additionalProperties: false } as const;

const actionData = (full: boolean) => ({
  type: "object",
  required: ["ref", "kind", "status", "due", "assignee", "link", "updated_at", "source", "external_ids", ...(full ? ["title", "metric", "period", "asker"] : ["redacted"])],
  properties: {
    ref: { type: "string", pattern: "^ZIF-[0-9]+$" }, kind: { enum: ["task", "question"] }, status: { enum: ["open", "answered", "closed"] }, due: nullable(str),
    assignee: person_, link: str, updated_at: str, source: source_, external_ids: { type: "array", maxItems: 10, items: external_ }, reason: { enum: [...DONE_REASONS] },
    ...(full ? { title: { type: "string", maxLength: TITLE_MAX }, metric: metric_, period: str, asker: { type: "object", required: ["name"], properties: { name: str }, additionalProperties: false }, reply: { type: "object", required: ["text"], properties: { text: { type: "string", maxLength: REPLY_MAX } }, additionalProperties: false } } : { redacted: { const: true } }),
  },
  additionalProperties: false,
});
const envelope = (type: string, data: object, withWorkspace = true) => ({
  type: "object", required: ["id", "type", "created_at", ...(withWorkspace ? ["workspace"] : []), "data"],
  properties: { id: { type: "string", pattern: "^evt_[0-9a-f]{32}$" }, type: { const: type }, created_at: str, ...(withWorkspace ? { workspace: { type: "object", required: ["id"], properties: { id: str }, additionalProperties: false } } : {}), data },
  additionalProperties: false,
});

/** The JSON Schema of every message a Webhook is sent (published as docs/reference/webhook-events.schema.json, generated
 * from here): one entry per event type; the Action events are either full or redacted. Receivers ignore fields they do not know. */
export const WEBHOOK_EVENTS_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Ziffr Webhook message",
  description: "The JSON body of every message a Ziffr Webhook is sent, by `type`. Action events are `redacted` when the Metric is not shared with Everyone or the Thread is limited to a Group. Signed as described in the Webhooks guide; the same `id` on every retry.",
  oneOf: [
    ...(["action.created", "action.updated", "action.answered", "action.done"] as const).map((t) => ({ ...envelope(t, { oneOf: [actionData(true), actionData(false)] }) })),
    envelope("value.recorded", { type: "object", required: ["metric", "period", "value", "target", "link"], properties: { metric: metric_, period: str, value: str, target: nullable(str), link: str }, additionalProperties: false }),
    envelope("value.unusual", { type: "object", required: ["metric", "period", "link"], properties: { metric: metric_, period: str, value: str, link: str }, additionalProperties: false }),
    envelope("alert.fired", { type: "object", required: ["metric", "period", "value", "target", "condition", "link"], properties: { metric: metric_, period: str, value: str, target: nullable(str), condition: { type: "object", required: ["kind", "level"], properties: { kind: { enum: ["share_of_target", "at_or_above", "below", "changed_more"] }, level: str }, additionalProperties: false }, link: str }, additionalProperties: false }),
    envelope("ping", { type: "object", required: ["webhook"], properties: { webhook: { type: "object", required: ["name"], properties: { name: str }, additionalProperties: false } }, additionalProperties: false }, false),
  ],
} as const;
