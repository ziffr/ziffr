// Events for Webhooks (GLOSSARY: Webhook; spec 0034, ticket #400): what a change of an Action or a value tells the
// Webhooks that chose it. This module only writes the send rows, one per enabled Webhook that chose the event, and only
// after the change itself succeeded: a Webhook can never fail an Action or a value, so every failure here is swallowed
// and logged. Nothing of the Workspace's words is written: the row holds ids, the message is built at send time
// (webhook-send.ts) so who may hear it is judged then. Callers are core functions, never a browser, Connector or link.
import { db } from "./db";
import type { WebhookEvent } from "./webhooks";

/** Where a change came from, in every Action event. The Webhook's own id only for `webhook` (not a secret); never anything about the person. */
export type ChangeSource = { type: "app" | "api" | "mcp" | "email" | "slack" | "telegram" | "web_form" | "ticket_system" | "workflow" | "system" } | { type: "webhook"; webhookId: string };

/** A change made in the app by a signed-in person: what a function uses when no other way in is named. */
export const FROM_APP: ChangeSource = { type: "app" };

/** Why an Action is done, on `action.done` (spec 0034, "One state change, one event"). The last four are system closes. */
export type DoneReason = "done" | "answered" | "closed" | "metric_archived" | "metric_deleted" | "assignee_left" | "workspace_closing";

/** The event types a send row may carry: the ones a Webhook chooses, and `ping` for its test button. */
export type SendType = WebhookEvent | "ping";

/** What a send row is about, as ids. */
export type SendSubject = { actionId?: number; threadMessageId?: number | null; metricId?: number; period?: string; reason?: DoneReason | null };

/** Writes a send row for each enabled Webhook of the Workspace that chose this event, and returns how many it wrote.
 * Never throws: the change has happened, and a Webhook must not undo or fail it. */
export async function queueWebhookEvent(workspaceId: string, type: WebhookEvent, source: ChangeSource, subject: SendSubject): Promise<number> {
  try {
    const { data: hooks } = await db().from("webhooks").select("id").eq("workspace_id", workspaceId).is("disabled_at", null).contains("events", [type]);
    if (!hooks?.length) return 0;
    const rows = hooks.map((h) => ({
      workspace_id: workspaceId, webhook_id: h.id as string, type,
      action_id: subject.actionId ?? null, thread_message_id: subject.threadMessageId ?? null, metric_id: subject.metricId ?? null, period_start: subject.period ?? null,
      source_type: source.type, source_webhook_id: source.type === "webhook" ? source.webhookId : null, reason: subject.reason ?? null,
    }));
    const { error } = await db().from("webhook_sends").insert(rows);
    if (error) { console.error("Webhooks: could not queue an event:", error.message); return 0; }
    return rows.length;
  } catch (e) {
    console.error("Webhooks: could not queue an event:", (e as Error).message);
    return 0;
  }
}
