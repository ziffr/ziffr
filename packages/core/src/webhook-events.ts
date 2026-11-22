// Events for Webhooks (GLOSSARY: Webhook; spec 0034, ticket #400; Personal Webhook, spec 0037): what a change of an Action or a
// value tells the Webhooks that chose it. This module only writes the send rows, one per enabled Webhook that chose the event, and only
// after the change itself succeeded: a Webhook can never fail an Action or a value, so every failure here is swallowed
// and logged. Nothing of the Workspace's words is written: the row holds ids, the message is built at send time
// (webhook-send.ts) so who may hear it is judged then. Callers are core functions, never a browser, Connector or link.
import { db } from "./db";
import { personalWebhooksAllowed } from "./personal-webhook-state";
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
    // `value.recorded` is for Personal Webhooks only (spec 0037): a Workspace Webhook is never sent it.
    const { data: shared } = type === "value.recorded" ? { data: [] } : await db().from("webhooks").select("id").eq("workspace_id", workspaceId).is("owner_id", null).is("disabled_at", null).contains("events", [type]);
    const hooks = [...(shared ?? []), ...(await personalRecipients(workspaceId, type, subject))];
    if (!hooks.length) return 0;
    // No echo: a change a Webhook reported is not sent back to that Webhook (Ziffr is the single source of truth); the others hear it, marked with its origin.
    const rows = hooks.filter((h) => source.type !== "webhook" || h.id !== source.webhookId).map((h) => ({
      workspace_id: workspaceId, webhook_id: h.id as string, type,
      action_id: subject.actionId ?? null, thread_message_id: subject.threadMessageId ?? null, metric_id: subject.metricId ?? null, period_start: subject.period ?? null,
      source_type: source.type, source_webhook_id: source.type === "webhook" ? source.webhookId : null, reason: subject.reason ?? null,
    }));
    if (!rows.length) return 0;
    const { error } = await db().from("webhook_sends").insert(rows);
    if (error) { console.error("Webhooks: could not queue an event:", error.message); return 0; }
    return rows.length;
  } catch (e) {
    console.error("Webhooks: could not queue an event:", (e as Error).message);
    return 0;
  }
}

/** The Personal Webhooks of the Workspace that may be told of this event: switched on, having chosen it, while the
 * Workspace allows them, and only the person's own business: an Action given to them or asked by them, or a Metric they
 * picked. Only a first cut that spares rows; what the person may see is judged again at the send (personalWebhookMayHear),
 * so a row that gets through here proves nothing. */
async function personalRecipients(workspaceId: string, type: WebhookEvent, subject: SendSubject): Promise<{ id: string }[]> {
  if (type === "alert.fired") return [];
  const isAction = type.startsWith("action.");
  if (isAction ? subject.actionId === undefined : subject.metricId === undefined) return [];
  if (!(await personalWebhooksAllowed(workspaceId))) return [];
  const { data: hooks } = await db().from("webhooks").select("id, owner_id, metric_ids").eq("workspace_id", workspaceId).not("owner_id", "is", null).is("disabled_at", null).contains("events", [type]);
  if (!hooks?.length) return [];
  if (!isAction) return hooks.filter((h) => ((h.metric_ids as number[] | null) ?? []).includes(subject.metricId as number)).map((h) => ({ id: h.id as string }));
  const { data: action } = await db().from("actions").select("asker_id, assignee_id").eq("id", subject.actionId as number).eq("workspace_id", workspaceId).maybeSingle();
  if (!action) return [];
  return hooks.filter((h) => h.owner_id === action.asker_id || h.owner_id === action.assignee_id).map((h) => ({ id: h.id as string }));
}

/** Writes an `alert.fired` send row for each of the Webhooks a Tell step names that is switched on and chose the event
 * (naming is not enough: an Owner's choice of events still guards what a Webhook gets). Only a Tell step calls this,
 * once per crossing, after it claimed the fire; a personal Alert never does (spec 0034: they go to the person only).
 * The row holds ids only: the Workflow and step, the Metric and the period; the message is built when it is sent.
 * Never throws. */
export async function queueAlertFired(workspaceId: string, webhookIds: readonly string[], tell: { workflowId: number; stepId: string; metricId: number; period: string }): Promise<number> {
  try {
    if (!webhookIds.length) return 0;
    const { data: hooks } = await db().from("webhooks").select("id").eq("workspace_id", workspaceId).in("id", [...webhookIds]).is("owner_id", null).is("disabled_at", null).contains("events", ["alert.fired"]);
    if (!hooks?.length) return 0;
    const rows = hooks.map((h) => ({ workspace_id: workspaceId, webhook_id: h.id as string, type: "alert.fired", metric_id: tell.metricId, period_start: tell.period, workflow_id: tell.workflowId, tell_step_id: tell.stepId, source_type: "workflow" }));
    const { error } = await db().from("webhook_sends").insert(rows);
    if (error) { console.error("Webhooks: could not queue an event:", error.message); return 0; }
    return rows.length;
  } catch (e) {
    console.error("Webhooks: could not queue an event:", (e as Error).message);
    return 0;
  }
}

/** Writes an `alert.fired` send row for each Personal Webhook an Alert names, once per crossing, after the Alert claimed
 * its fire. Only the Alert's own person's Webhooks (owner_id), switched on, having chosen the event, while the Workspace
 * allows them: the first cut only, since the send judges the Alert, the person's sight and the value again. The row holds
 * ids only (the Alert, the Metric, the period). Never throws. */
export async function queueAlertFiredToPersonal(workspaceId: string, alert: { id: number; personId: string; webhookIds: readonly string[]; metricId: number; period: string }): Promise<number> {
  try {
    if (!alert.webhookIds.length || !(await personalWebhooksAllowed(workspaceId))) return 0;
    const { data: hooks } = await db().from("webhooks").select("id").eq("workspace_id", workspaceId).eq("owner_id", alert.personId).in("id", [...alert.webhookIds]).is("disabled_at", null).contains("events", ["alert.fired"]);
    if (!hooks?.length) return 0;
    const rows = hooks.map((h) => ({ workspace_id: workspaceId, webhook_id: h.id as string, type: "alert.fired", alert_id: alert.id, metric_id: alert.metricId, period_start: alert.period, source_type: "system" }));
    const { error } = await db().from("webhook_sends").insert(rows);
    if (error) { console.error("Webhooks: could not queue an event:", error.message); return 0; }
    return rows.length;
  } catch (e) {
    console.error("Webhooks: could not queue an event:", (e as Error).message);
    return 0;
  }
}
